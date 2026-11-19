/**
 * Google Térkép Idővonal export feldolgozása – tiszta TypeScript, nincs benne app-függőség,
 * így Node-dal is tesztelhető (lásd scripts/test-timeline.ts).
 *
 * Három formátumot ismer:
 *  - új Android export (Timeline.json):   { semanticSegments: [{ startTime, endTime, visit: { topCandidate: { placeId, semanticType, placeLocation: { latLng: "47.49°, 19.04°" } } } }] }
 *  - új iOS export:                        [ { startTime, endTime, visit: { topCandidate: { placeID, semanticType, placeLocation: "geo:47.49,19.04" } } } ]
 *  - régi Takeout „Semantic Location History”: { timelineObjects: [{ placeVisit: { location: { latitudeE7, longitudeE7, placeId, name, address }, duration: { startTimestamp } } }] }
 */

export interface Stop {
  start: string; // ISO (UTC)
  end: string;
  minutes: number;
  lat: number;
  lon: number;
  googlePlaceId: string | null;
  semanticType: string;
  name: string | null;
  address: string | null;
}

export interface StopGroup {
  key: string;
  lat: number;
  lon: number;
  googlePlaceId: string | null;
  name: string | null;
  address: string | null;
  stops: Stop[];
}

export interface PreparedImport {
  stopsTotal: number;
  excludedHomeWork: number;
  excludedDuration: number;
  excludedTooOld: number;
  kept: number;
  groups: StopGroup[];
  firstDate: string | null;
  lastDate: string | null;
}

export class TimelineFormatError extends Error {}

export const MIN_STOP_MINUTES = 20;
export const MAX_STOP_MINUTES = 240;

function parseLatLng(v: unknown): [number, number] | null {
  if (v == null) return null;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.latitudeE7 === 'number' && typeof o.longitudeE7 === 'number') return [o.latitudeE7 / 1e7, o.longitudeE7 / 1e7];
    if ('latLng' in o) return parseLatLng(o.latLng);
    if (o.latitude != null && o.longitude != null) return [Number(o.latitude), Number(o.longitude)];
    return null;
  }
  const m = String(v).match(/(-?\d+(?:\.\d+)?)\D+?(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lat, lon] : null;
}

const msToIso = (ms: unknown) => (ms ? new Date(Number(ms)).toISOString() : null);

interface RawStop {
  start: unknown;
  end: unknown;
  ll: [number, number] | null;
  googlePlaceId: string | null;
  semanticType: string;
  name: string | null;
  address: string | null;
}

export function extractStops(json: unknown): Stop[] {
  const out: Stop[] = [];
  let recognized = false;

  const push = (r: RawStop) => {
    if (!r.ll || !r.start || !r.end) return;
    const s = new Date(String(r.start));
    const e = new Date(String(r.end));
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || e <= s) return;
    out.push({
      start: s.toISOString(),
      end: e.toISOString(),
      minutes: (e.getTime() - s.getTime()) / 60000,
      lat: r.ll[0],
      lon: r.ll[1],
      googlePlaceId: r.googlePlaceId,
      semanticType: r.semanticType,
      name: r.name,
      address: r.address,
    });
  };

  const obj = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const segs = Array.isArray(json) ? json : Array.isArray(obj.semanticSegments) ? obj.semanticSegments : null;
  if (segs) {
    recognized = true;
    for (const seg of segs as Record<string, any>[]) {
      const c = seg?.visit?.topCandidate;
      if (!c) continue;
      push({
        start: seg.startTime,
        end: seg.endTime,
        ll: parseLatLng(c.placeLocation),
        googlePlaceId: c.placeId || c.placeID || null,
        semanticType: String(c.semanticType || '').toUpperCase(),
        name: null,
        address: null,
      });
    }
  }

  if (Array.isArray(obj.timelineObjects)) {
    recognized = true;
    for (const o of obj.timelineObjects as Record<string, any>[]) {
      const pv = o?.placeVisit;
      if (!pv) continue;
      const l = pv.location || {};
      const d = pv.duration || {};
      push({
        start: d.startTimestamp || msToIso(d.startTimestampMs),
        end: d.endTimestamp || msToIso(d.endTimestampMs),
        ll: parseLatLng(l),
        googlePlaceId: l.placeId || null,
        semanticType: String(l.semanticType || '').toUpperCase(),
        name: l.name || null,
        address: l.address || null,
      });
    }
  }

  if (!recognized) {
    if (obj.locations || obj.rawSignals) {
      throw new TimelineFormatError(
        'Ez nyers helyadat-fájl (pl. Records.json), nincsenek benne megállások. A Timeline.json-t vagy a Semantic Location History fájljait válaszd.',
      );
    }
    throw new TimelineFormatError(
      'Ismeretlen fájlformátum. A Google Térkép Idővonal exportját (Timeline.json) vagy a Takeout Semantic Location History fájljait válaszd.',
    );
  }
  return out;
}

const isHomeOrWork = (s: Stop) => /HOME|WORK/.test(s.semanticType);

/**
 * Szűrés és csoportosítás: otthon/munkahely ki, 20 perc – 4 óra közötti megállások maradnak,
 * azonos helyek (Google placeId vagy ~10 m-es rács) egy csoportba.
 * `since`: ennél régebbi megállások kimaradnak (ingyenes verzió korlátja).
 */
export function prepareImport(jsons: unknown[], since: Date | null = null): PreparedImport {
  const all = jsons.flatMap((j) => extractStops(j));
  // Több fájlban ugyanaz a megállás többször is szerepelhet
  const seen = new Set<string>();
  const stops = all.filter((s) => {
    const k = `${s.start}|${s.lat.toFixed(4)}|${s.lon.toFixed(4)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const homeWork = stops.filter(isHomeOrWork);
  const rest = stops.filter((s) => !isHomeOrWork(s));
  const durationOk = rest.filter((s) => s.minutes >= MIN_STOP_MINUTES && s.minutes <= MAX_STOP_MINUTES);
  const keep = since ? durationOk.filter((s) => new Date(s.start) >= since) : durationOk;

  const groups = new Map<string, StopGroup>();
  for (const s of keep) {
    const key = s.googlePlaceId || `${s.lat.toFixed(4)},${s.lon.toFixed(4)}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, lat: s.lat, lon: s.lon, googlePlaceId: s.googlePlaceId, name: s.name, address: s.address, stops: [] };
      groups.set(key, g);
    }
    g.stops.push(s);
    if (!g.name && s.name) {
      g.name = s.name;
      g.address = s.address;
    }
  }

  const dates = keep.map((s) => s.start).sort();
  return {
    stopsTotal: stops.length,
    excludedHomeWork: homeWork.length,
    excludedDuration: rest.length - durationOk.length,
    excludedTooOld: durationOk.length - keep.length,
    kept: keep.length,
    groups: [...groups.values()],
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
  };
}
