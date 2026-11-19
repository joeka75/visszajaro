import { distanceM } from '@/lib/format';

import { describeOsm, OSM_FOOD_AMENITIES } from './categories';
import { ProviderError, type PlaceCandidate, type PlaceProvider, type Point } from './types';

/** Overpass szerverek – ha az egyik nem válaszol, a következővel próbálkozunk */
const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const TIMEOUT_MS = 60_000;
const BATCH = 20; // ennyi pont egy lekérdezésben
const AMENITY_RE = `^(${OSM_FOOD_AMENITIES.join('|')})$`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/**
 * Az overpass-api.de az általános kliens-azonosítókat (pl. „okhttp”) 406-tal elutasítja –
 * az appnak azonosítania kell magát. Túlterhelésnél (429/502/503/504) exponenciális várakozással újrapróbálunk.
 * Megjegyzés: a nyilvános Overpass szerverek emberi, alacsony forgalmú használatra valók;
 * nyilvános induláshoz saját Overpass példány vagy szerveroldali gyorsítótár kell (lásd ARCHITEKTURA.md).
 */
const USER_AGENT = 'Visszajaro/0.1 (restaurant diary app; personal test)';
const RETRY_STATUS = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

async function overpass(query: string): Promise<OsmElement[]> {
  let lastErr = '';
  for (const url of SERVERS) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
            'User-Agent': USER_AGENT,
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: ac.signal,
        });
        if (r.ok) return ((await r.json()) as { elements?: OsmElement[] }).elements ?? [];
        lastErr = r.status === 502 || r.status === 504 || r.status === 429 ? `a szerver túlterhelt (${r.status})` : `HTTP ${r.status}`;
        if (RETRY_STATUS.has(r.status) && attempt < MAX_ATTEMPTS - 1) {
          await sleep(3000 * 2 ** attempt); // 3 s, 6 s
          continue;
        }
        break; // másik szerver
      } catch (e) {
        lastErr = ac.signal.aborted ? 'időtúllépés' : (e as Error).message;
        break;
      } finally {
        clearTimeout(timer);
      }
    }
  }
  throw new ProviderError(`Nem érem el az OpenStreetMap szervereket (${lastErr}). Próbáld újra pár perc múlva, vagy válaszd a Google szolgáltatót.`);
}

function toCandidate(e: OsmElement, from: Point): PlaceCandidate | null {
  const lat = e.lat ?? e.center?.lat;
  const lon = e.lon ?? e.center?.lon;
  const t = e.tags ?? {};
  if (lat == null || lon == null || !t.name) return null;
  const d = describeOsm(t);
  const street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ');
  return {
    provider: 'osm',
    externalId: `${e.type}/${e.id}`,
    name: t.name,
    lat,
    lon,
    category: d.category,
    cuisine: d.cuisine,
    emoji: d.emoji,
    address: [t['addr:city'], street].filter(Boolean).join(', ') || undefined,
    phone: t.phone || t['contact:phone'] || undefined,
    website: t.website || t['contact:website'] || undefined,
    distanceM: distanceM(from.lat, from.lon, lat, lon),
  };
}

const around = (p: Point, r: number) =>
  `nwr(around:${Math.round(r)},${p.lat.toFixed(6)},${p.lon.toFixed(6)})["amenity"~"${AMENITY_RE}"]["name"];`;

async function nearMany(points: Point[], radiusM: number): Promise<PlaceCandidate[][]> {
  const out: PlaceCandidate[][] = [];
  for (let i = 0; i < points.length; i += BATCH) {
    const batch = points.slice(i, i + BATCH);
    const els = await overpass(`[out:json][timeout:60];(${batch.map((p) => around(p, radiusM)).join('')});out center tags;`);
    for (const p of batch) {
      out.push(
        els
          .map((e) => toCandidate(e, p))
          .filter((c): c is PlaceCandidate => !!c && (c.distanceM ?? Infinity) <= radiusM)
          .sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0)),
      );
    }
    if (i + BATCH < points.length) await sleep(1200); // kíméljük az ingyenes szervert
  }
  return out;
}

export const osmProvider: PlaceProvider = {
  id: 'osm',
  async findFoodPlacesNear(lat, lon, radiusM) {
    return (await nearMany([{ lat, lon }], radiusM))[0];
  },
  findFoodPlacesNearMany: nearMany,
};
