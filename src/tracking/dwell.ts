/**
 * Megállás-felismerő: helymintákból (lat, lon, idő) kiszámolja, hol töltött a felhasználó
 * legalább 20 percet. Tiszta TypeScript, nincs benne React Native – Node-ban is tesztelhető
 * (scripts/test-dwell.ts).
 *
 * Működés:
 *  - Az első minta lesz a „horgony”. Amíg a minták a horgony körüli körön belül vannak, ugyanaz a megállás tart.
 *  - Egyetlen távoli minta még nem jelent távozást (beltéri GPS-ugrás) – csak ha a következő is kint van,
 *    vagy ha egyértelműen messze van (> 500 m).
 *  - Ha a telefon nem mozdult, sokáig nem jön minta. Ezért távozáskor a megállás végét a távoli minta
 *    idejéből becsüljük (gyalogos sebességgel visszaszámolva), nem az utolsó benti mintából.
 */

export interface Sample {
  lat: number;
  lon: number;
  /** időpont, ms */
  t: number;
  /** pontosság méterben (ha ismert) */
  acc?: number | null;
}

export interface Anchor {
  lat: number;
  lon: number;
  /** ennyi mintából átlagoltuk */
  n: number;
  since: number;
  lastSeen: number;
}

export interface DwellState {
  anchor: Anchor | null;
  /** egy távoli minta, ami még megerősítésre vár */
  pendingExit: Sample | null;
}

export interface Stay {
  lat: number;
  lon: number;
  start: number;
  end: number;
}

export const DWELL = {
  radiusM: 80,
  minMinutes: 20,
  maxMinutes: 240,
  /** ennél pontatlanabb mintát eldobunk */
  maxAccuracyM: 150,
  /** ennél messzebbi minta önmagában is távozás */
  sureExitM: 500,
  /** visszaszámoláshoz: gyalogos sebesség, m/s */
  walkMps: 1.4,
  /** ha ennél hosszabb volt a csend, nem tudjuk, mikor indult el – az utolsó benti mintát vesszük */
  maxGapMinutes: 240,
};

export const emptyState = (): DwellState => ({ anchor: null, pendingExit: null });

export function distM(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371e3;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const newAnchor = (s: Sample): Anchor => ({ lat: s.lat, lon: s.lon, n: 1, since: s.t, lastSeen: s.t });

/** Belül van-e a minta (a pontatlanságot a javára írjuk, legfeljebb 50 m-ig) */
function inside(a: Anchor, s: Sample) {
  const slack = Math.min(s.acc ?? 0, 50);
  return distM(a.lat, a.lon, s.lat, s.lon) - slack <= DWELL.radiusM;
}

/** A horgonyt lezárja a `exit` mintánál; visszaadja a megállást, ha elég hosszú volt */
function close(a: Anchor, exit: Sample): Stay | null {
  const gap = exit.t - a.lastSeen;
  let end: number;
  if (gap > DWELL.maxGapMinutes * 60_000) {
    end = a.lastSeen;
  } else {
    const travelMs = (distM(a.lat, a.lon, exit.lat, exit.lon) / DWELL.walkMps) * 1000;
    end = Math.max(a.lastSeen, exit.t - travelMs);
  }
  const minutes = (end - a.since) / 60_000;
  if (minutes < DWELL.minMinutes || minutes > DWELL.maxMinutes) return null;
  return { lat: a.lat, lon: a.lon, start: a.since, end };
}

/** Egy minta feldolgozása. A visszaadott állapotot kell tovább adni a következő mintához. */
export function step(state: DwellState, s: Sample): { state: DwellState; stays: Stay[] } {
  if (s.acc != null && s.acc > DWELL.maxAccuracyM) return { state, stays: [] };
  const a = state.anchor;
  if (!a) return { state: { anchor: newAnchor(s), pendingExit: null }, stays: [] };
  if (s.t <= a.lastSeen) return { state, stays: [] }; // régi vagy ismétlődő minta

  if (inside(a, s)) {
    // visszajött / bent maradt: a függőben lévő távozás téves volt
    const n = a.n + 1;
    const anchor: Anchor = {
      lat: (a.lat * a.n + s.lat) / n,
      lon: (a.lon * a.n + s.lon) / n,
      n: Math.min(n, 50), // a régi minták súlya ne nőjön a végtelenségig
      since: a.since,
      lastSeen: s.t,
    };
    return { state: { anchor, pendingExit: null }, stays: [] };
  }

  const far = distM(a.lat, a.lon, s.lat, s.lon) > DWELL.sureExitM;
  if (!state.pendingExit && !far) {
    return { state: { anchor: a, pendingExit: s }, stays: [] };
  }

  // távozás megerősítve: a megállás az első távoli mintánál ért véget
  const exit = state.pendingExit ?? s;
  const stay = close(a, exit);
  let next: DwellState = { anchor: newAnchor(exit), pendingExit: null };
  const stays = stay ? [stay] : [];
  if (exit !== s) {
    const r = step(next, s);
    next = r.state;
    stays.push(...r.stays);
  }
  return { state: next, stays };
}

/** Több minta egyben (a háttérfeladat kötegben kapja őket) */
export function stepMany(state: DwellState, samples: Sample[]): { state: DwellState; stays: Stay[] } {
  const stays: Stay[] = [];
  let st = state;
  for (const s of [...samples].sort((x, y) => x.t - y.t)) {
    const r = step(st, s);
    st = r.state;
    stays.push(...r.stays);
  }
  return { state: st, stays };
}
