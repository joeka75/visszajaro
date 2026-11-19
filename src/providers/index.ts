import type { SQLiteDatabase } from 'expo-sqlite';

import { getSetting } from '@/db/repo';

import { createGoogleProvider } from './google';
import { osmProvider } from './osm';
import { ProviderError, type PlaceCandidate, type PlaceProvider, type Point, type ProviderMode } from './types';

/** A felismeréshez használt sugár: ennyi méteren belül keresünk vendéglátóhelyet */
export const MATCH_RADIUS_M = 60;
/** A gyorsítótár ennyi ideig érvényes */
const CACHE_DAYS = 180;

export interface ProviderSettings {
  mode: ProviderMode;
  googleKey: string | null;
}

export async function getProviderSettings(db: SQLiteDatabase): Promise<ProviderSettings> {
  const mode = ((await getSetting(db, 'provider')) as ProviderMode | null) ?? 'osm';
  const googleKey = (await getSetting(db, 'google_api_key')) || process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY || null;
  return { mode, googleKey };
}

/* ---------------- Gyorsítótár (provider_cache tábla) ---------------- */

async function cacheGet<T>(db: SQLiteDatabase, provider: string, key: string): Promise<T | undefined> {
  const row = await db.getFirstAsync<{ payload: string; fetched_at: string }>(
    'SELECT payload, fetched_at FROM provider_cache WHERE provider = ? AND query_key = ?',
    [provider, key],
  );
  if (!row) return undefined;
  if (Date.now() - new Date(row.fetched_at).getTime() > CACHE_DAYS * 864e5) return undefined;
  return JSON.parse(row.payload) as T;
}

async function cachePut(db: SQLiteDatabase, provider: string, key: string, value: unknown) {
  await db.runAsync(
    `INSERT INTO provider_cache (provider, query_key, payload, fetched_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(provider, query_key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`,
    [provider, key, JSON.stringify(value), new Date().toISOString()],
  );
}

const nearKey = (p: Point, r: number) => `near:${p.lat.toFixed(4)},${p.lon.toFixed(4)},${r}`;

/** Közeli helyek több pontra, gyorsítótárral; csak a még nem ismert pontokat kérdezi le */
async function nearManyCached(db: SQLiteDatabase, prov: PlaceProvider, points: Point[], r: number) {
  const result: (PlaceCandidate[] | undefined)[] = await Promise.all(
    points.map((p) => cacheGet<PlaceCandidate[]>(db, prov.id, nearKey(p, r))),
  );
  const missingIdx = result.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  if (missingIdx.length) {
    const missing = missingIdx.map((i) => points[i]);
    const fresh = prov.findFoodPlacesNearMany
      ? await prov.findFoodPlacesNearMany(missing, r)
      : await Promise.all(missing.map((p) => prov.findFoodPlacesNear(p.lat, p.lon, r)));
    for (let k = 0; k < missingIdx.length; k++) {
      result[missingIdx[k]] = fresh[k];
      await cachePut(db, prov.id, nearKey(missing[k], r), fresh[k]);
    }
  }
  return result as PlaceCandidate[][];
}

async function googlePlaceCached(db: SQLiteDatabase, prov: PlaceProvider, placeId: string) {
  const key = `place:${placeId}`;
  const hit = await cacheGet<PlaceCandidate | null>(db, 'google', key);
  if (hit !== undefined) return hit;
  const p = (await prov.getPlace?.(placeId)) ?? null;
  await cachePut(db, 'google', key, p);
  return p;
}

/* ---------------- Megálló → vendéglátóhely ---------------- */

export interface StopToResolve extends Point {
  googlePlaceId: string | null;
}

export interface ResolveOptions {
  onProgress?: (done: number, total: number) => void;
  isCancelled?: () => boolean;
  /** keresési sugár (alapból MATCH_RADIUS_M) */
  radiusM?: number;
}

/**
 * Minden megállóhoz megkeresi a vendéglátóhelyet (vagy null, ha ott nincs ilyen).
 *  - osm:    OpenStreetMap, legközelebbi hely 60 m-en belül
 *  - google: ha van Google placeId (Idővonal-import) → pontos részletek; különben közeli keresés
 *  - auto:   OSM, és ahol nem talált semmit, ott Google (ha van kulcs)
 */
export async function resolveStops(
  db: SQLiteDatabase,
  stops: StopToResolve[],
  settings: ProviderSettings,
  opts: ResolveOptions = {},
): Promise<(PlaceCandidate | null)[]> {
  const { mode, googleKey } = settings;
  const r = opts.radiusM ?? MATCH_RADIUS_M;
  if (mode === 'google' && !googleKey) {
    throw new ProviderError('A Google szolgáltatóhoz API-kulcs kell. Add meg a Beállításokban, vagy válaszd az OpenStreetMap-et.');
  }
  const google = googleKey ? createGoogleProvider(googleKey) : null;
  const out: (PlaceCandidate | null)[] = new Array(stops.length).fill(null);
  const total = stops.length;
  let done = 0;
  const tick = (n = 1) => {
    done += n;
    opts.onProgress?.(Math.min(done, total), total);
  };

  // 1) OpenStreetMap (osm és auto mód) – 20-as csomagokban
  if (mode === 'osm' || mode === 'auto') {
    const CHUNK = 20;
    for (let i = 0; i < stops.length; i += CHUNK) {
      if (opts.isCancelled?.()) return out;
      const chunk = stops.slice(i, i + CHUNK);
      const res = await nearManyCached(db, osmProvider, chunk, r);
      res.forEach((cands, k) => (out[i + k] = cands[0] ?? null));
      if (mode === 'osm') tick(chunk.length);
    }
    if (mode === 'osm') return out;
  }

  // 2) Google (google mód: mindenre; auto mód: ahol az OSM nem talált semmit)
  const todo = stops.map((s, i) => i).filter((i) => mode === 'google' || out[i] === null);
  if (mode === 'auto') tick(total - todo.length);
  if (!google) {
    tick(todo.length);
    return out;
  }
  for (const i of todo) {
    if (opts.isCancelled?.()) return out;
    const s = stops[i];
    let cand: PlaceCandidate | null | undefined;
    if (s.googlePlaceId) cand = await googlePlaceCached(db, google, s.googlePlaceId);
    if (cand === undefined || (cand === null && !s.googlePlaceId)) {
      const near = await nearManyCached(db, google, [s], r);
      cand = near[0][0] ?? null;
    }
    out[i] = cand ?? null;
    tick();
  }
  return out;
}

/** Egy hívás a Google felé a kulcs kipróbálásához (Deák tér környéke). */
export async function testGoogleKey(apiKey: string) {
  const res = await createGoogleProvider(apiKey).findFoodPlacesNear(47.4977, 19.0545, 150);
  return res.length;
}
