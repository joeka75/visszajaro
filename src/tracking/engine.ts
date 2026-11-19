import { randomUUID } from 'expo-crypto';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { bump } from '@/db/events';
import { migrate } from '@/db/migrations';
import { upsertPlace } from '@/db/places';
import type { Rating } from '@/db/types';
import { distanceM } from '@/lib/format';
import { getProviderSettings, resolveStops } from '@/providers';

import { emptyState, stepMany, type DwellState, type Sample, type Stay } from './dwell';
import { notifyVisit } from './notify';

/** Élő felismerésnél kicsit nagyobb sugár, mert a beltéri helymeghatározás pontatlanabb */
const LIVE_RADIUS_M = 75;
const MAX_ATTEMPTS = 8;
const LOG_KEEP = 200;

/* ---------------- Adatbázis a háttérfeladathoz ---------------- */

let dbPromise: Promise<SQLiteDatabase> | null = null;

/** A háttérfeladat saját kapcsolatot nyit (az app felülete ilyenkor lehet, hogy nem is fut) */
export function getTrackingDb() {
  dbPromise ??= (async () => {
    const db = await openDatabaseAsync('visszajaro.db');
    try {
      await migrate(db);
    } catch {
      // ha épp az app is migrált ugyanekkor: egyszer újra
      await new Promise((r) => setTimeout(r, 1000));
      await migrate(db);
    }
    return db;
  })().catch((e) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

/* ---------------- Segédek ---------------- */

async function getRaw(db: SQLiteDatabase, key: string) {
  const row = await db.getFirstAsync<{ value: string | null }>('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value ?? null;
}

/** Beállítás mentése értesítés (bump) nélkül – a háttérben percenként fut, ne frissítse feleslegesen a felületet */
async function putRaw(db: SQLiteDatabase, key: string, value: string | null) {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}

export type LogKind = 'info' | 'stay' | 'visit' | 'skip' | 'error';

export async function log(db: SQLiteDatabase, kind: LogKind, message: string) {
  await db.runAsync('INSERT INTO tracking_log (at, kind, message) VALUES (?, ?, ?)', [new Date().toISOString(), kind, message]);
  await db.runAsync('DELETE FROM tracking_log WHERE id <= (SELECT MAX(id) FROM tracking_log) - ?', [LOG_KEEP]);
}

export interface LogEntry {
  id: number;
  at: string;
  kind: LogKind;
  message: string;
}

export function listLog(db: SQLiteDatabase, limit = 10) {
  return db.getAllAsync<LogEntry>('SELECT * FROM tracking_log ORDER BY id DESC LIMIT ?', [limit]);
}

/* ---------------- Kizárt zónák (otthon, munkahely) ---------------- */

export interface Zone {
  id: string;
  lat: number;
  lon: number;
  radius_m: number;
  label: string | null;
}

export function listZones(db: SQLiteDatabase) {
  return db.getAllAsync<Zone>('SELECT id, lat, lon, radius_m, label FROM excluded_zones ORDER BY created_at');
}

export async function addZone(db: SQLiteDatabase, lat: number, lon: number, label: string, radiusM = 150) {
  await db.runAsync('INSERT INTO excluded_zones (id, lat, lon, radius_m, label, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
    randomUUID(),
    lat,
    lon,
    radiusM,
    label,
    new Date().toISOString(),
  ]);
  bump();
}

export async function clearZones(db: SQLiteDatabase) {
  await db.runAsync('DELETE FROM excluded_zones');
  bump();
}

const inZone = (zones: Zone[], s: Stay) => zones.find((z) => distanceM(z.lat, z.lon, s.lat, s.lon) <= z.radius_m);

/* ---------------- Helyminták feldolgozása ---------------- */

/** A háttérfeladat ezt hívja minden helyminta-köteggel */
export async function handleSamples(db: SQLiteDatabase, samples: Sample[]) {
  if (!samples.length) return;
  const raw = await getRaw(db, 'tracking_state');
  const state: DwellState = raw ? (JSON.parse(raw) as DwellState) : emptyState();
  const r = stepMany(state, samples);
  await putRaw(db, 'tracking_state', JSON.stringify(r.state));
  await putRaw(db, 'tracking_last_sample_at', new Date(Math.max(...samples.map((s) => s.t))).toISOString());
  const count = Number((await getRaw(db, 'tracking_sample_count')) ?? 0) + samples.length;
  await putRaw(db, 'tracking_sample_count', String(count));

  if (r.stays.length) {
    const zones = await listZones(db);
    for (const s of r.stays) {
      const mins = Math.round((s.end - s.start) / 60_000);
      const z = inZone(zones, s);
      if (z) {
        await log(db, 'skip', `${mins} perces megállás kihagyva (${z.label ?? 'kizárt hely'})`);
        continue;
      }
      await db.runAsync(
        'INSERT OR IGNORE INTO pending_stays (id, lat, lon, start_at, end_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [randomUUID(), s.lat, s.lon, new Date(s.start).toISOString(), new Date(s.end).toISOString(), new Date().toISOString()],
      );
      await log(db, 'stay', `${mins} perces megállás (${s.lat.toFixed(4)}, ${s.lon.toFixed(4)})`);
    }
  }
  await processPending(db);
}

/* ---------------- Megállás → étterem → látogatás → értesítés ---------------- */

interface PendingRow {
  id: string;
  lat: number;
  lon: number;
  start_at: string;
  end_at: string;
  attempts: number;
}

let processing = false;

/** A még fel nem dolgozott megállásokat felismeri. Hálózati hiba esetén később újra próbálja. */
export async function processPending(db: SQLiteDatabase) {
  if (processing) return;
  processing = true;
  try {
    const rows = await db.getAllAsync<PendingRow>('SELECT * FROM pending_stays WHERE attempts < ? ORDER BY start_at', [MAX_ATTEMPTS]);
    if (!rows.length) return;

    const settings = await getProviderSettings(db);
    // Google mód kulcs nélkül: OSM-mel próbálkozunk, ne vesszen el a látogatás
    const effective = settings.mode === 'google' && !settings.googleKey ? { ...settings, mode: 'osm' as const } : settings;

    let cands;
    try {
      cands = await resolveStops(
        db,
        rows.map((r) => ({ lat: r.lat, lon: r.lon, googlePlaceId: null })),
        effective,
        { radiusM: LIVE_RADIUS_M },
      );
    } catch (e) {
      await db.runAsync(`UPDATE pending_stays SET attempts = attempts + 1 WHERE id IN (${rows.map(() => '?').join(',')})`, rows.map((r) => r.id));
      await log(db, 'error', `Felismerés később újra: ${(e as Error).message}`);
      return;
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const c = cands[i];
      if (!c) {
        await db.runAsync('DELETE FROM pending_stays WHERE id = ?', [row.id]);
        await log(db, 'skip', `Nincs vendéglátóhely ${LIVE_RADIUS_M} m-en belül (${row.lat.toFixed(4)}, ${row.lon.toFixed(4)})`);
        continue;
      }
      const visitId = randomUUID();
      let placeId = '';
      let inserted = 0;
      await db.withTransactionAsync(async () => {
        placeId = (await upsertPlace(db, c, 'auto')).id;
        const res = await db.runAsync(
          `INSERT OR IGNORE INTO visits (id, place_id, start_at, end_at, source, confidence, created_at)
           VALUES (?, ?, ?, ?, 'auto', ?, ?)`,
          [visitId, placeId, row.start_at, row.end_at, c.distanceM != null ? Math.max(0, 1 - c.distanceM / 100) : 1, new Date().toISOString()],
        );
        inserted = res.changes;
        await db.runAsync('DELETE FROM pending_stays WHERE id = ?', [row.id]);
      });
      if (!inserted) continue;
      await log(db, 'visit', `${c.emoji ?? ''} ${c.name} (${Math.round(c.distanceM ?? 0)} m)`.trim());
      const rated = await db.getFirstAsync<{ value: Rating }>('SELECT value FROM ratings WHERE place_id = ?', [placeId]);
      try {
        await notifyVisit({
          placeId,
          visitId,
          name: c.name,
          emoji: c.emoji,
          rating: rated?.value ?? null,
          start: new Date(row.start_at),
          end: new Date(row.end_at),
        });
      } catch (e) {
        await log(db, 'error', `Értesítés hiba: ${(e as Error).message}`);
      }
    }
    bump();
  } finally {
    processing = false;
  }
}

/** „Nem itt voltam”: a látogatás törlése; ha a hely csak emiatt került be, a hely is megy */
export async function deleteWrongVisit(db: SQLiteDatabase, visitId: string, placeId: string) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM visits WHERE id = ?', [visitId]);
    await db.runAsync(
      `DELETE FROM places WHERE id = ? AND source = 'auto'
         AND NOT EXISTS (SELECT 1 FROM visits WHERE place_id = ?)
         AND NOT EXISTS (SELECT 1 FROM ratings WHERE place_id = ?)`,
      [placeId, placeId, placeId],
    );
  });
  await log(db, 'info', 'Egy látogatást töröltél („Nem itt voltam”)');
  bump();
}

export async function getTrackingStats(db: SQLiteDatabase) {
  return {
    lastSampleAt: await getRaw(db, 'tracking_last_sample_at'),
    sampleCount: Number((await getRaw(db, 'tracking_sample_count')) ?? 0),
    pending: (await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM pending_stays WHERE attempts < ?', [MAX_ATTEMPTS]))?.n ?? 0,
  };
}

export async function resetTrackingState(db: SQLiteDatabase) {
  await putRaw(db, 'tracking_state', null);
}
