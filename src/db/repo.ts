import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { bump } from './events';
import type { PlaceSummary, Rating, Visit } from './types';

const now = () => new Date().toISOString();

const SUMMARY_SQL = `
  SELECT p.*,
         r.value                AS rating,
         r.note                 AS note,
         COALESCE(o.hidden, 0)  AS hidden,
         COUNT(v.id)            AS visit_count,
         MAX(v.start_at)        AS last_visit
  FROM places p
  LEFT JOIN ratings r         ON r.place_id = p.id
  LEFT JOIN place_overrides o ON o.place_id = p.id
  LEFT JOIN visits v          ON v.place_id = p.id`;

export function listPlaces(db: SQLiteDatabase) {
  return db.getAllAsync<PlaceSummary>(`${SUMMARY_SQL} GROUP BY p.id`);
}

export function getPlace(db: SQLiteDatabase, id: string) {
  return db.getFirstAsync<PlaceSummary>(`${SUMMARY_SQL} WHERE p.id = ? GROUP BY p.id`, [id]);
}

export function listVisits(db: SQLiteDatabase, placeId: string) {
  return db.getAllAsync<Visit>(
    'SELECT id, place_id, start_at, end_at, source FROM visits WHERE place_id = ? ORDER BY start_at DESC',
    [placeId],
  );
}

/** Ugyanarra az értékre nyomva visszavonja (null) az értékelést. */
export async function setRating(db: SQLiteDatabase, placeId: string, value: Rating) {
  const t = now();
  await db.runAsync(
    `INSERT INTO ratings (place_id, value, rated_at, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(place_id) DO UPDATE SET value = excluded.value, rated_at = excluded.rated_at, updated_at = excluded.updated_at`,
    [placeId, value, value ? t : null, t],
  );
  bump();
}

export async function setNote(db: SQLiteDatabase, placeId: string, note: string) {
  await db.runAsync(
    `INSERT INTO ratings (place_id, note, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(place_id) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at`,
    [placeId, note, now()],
  );
  bump();
}

export async function setHidden(db: SQLiteDatabase, placeId: string, hidden: boolean) {
  await db.runAsync(
    `INSERT INTO place_overrides (place_id, hidden, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(place_id) DO UPDATE SET hidden = excluded.hidden, updated_at = excluded.updated_at`,
    [placeId, hidden ? 1 : 0, now()],
  );
  bump();
}

/* ---------- Beállítások ---------- */

export async function getSetting(db: SQLiteDatabase, key: string) {
  const row = await db.getFirstAsync<{ value: string | null }>('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string | null) {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
  bump();
}

/* ---------- Demó adatok ---------- */

function visitAt(daysAgo: number, h: number, m: number, durMin: number) {
  const s = new Date();
  s.setDate(s.getDate() - daysAgo);
  s.setHours(h, m, 0, 0);
  return [s.toISOString(), new Date(s.getTime() + durMin * 60000).toISOString()] as const;
}

type DemoRow = [string, string, string, string, number, number, Rating, string, [number, number, number, number][]];
const DEMO: DemoRow[] = [
  ['Pöttyös Bisztró', 'Bisztró', '🥗', 'Budapest VII., Dob utca 18.', 47.4983, 19.061, 'up', 'A kacsacomb nagyon jó volt.', [[95, 19, 0, 100], [160, 12, 30, 60], [210, 20, 0, 90]]],
  ['Szaletli Kifőzde', 'Magyaros', '🥘', 'Budapest VIII., Rökk Szilárd u. 9.', 47.493, 19.068, 'up', 'Napi menü, gyors.', [[3, 12, 10, 40], [10, 12, 5, 35], [17, 12, 20, 40], [24, 12, 0, 45], [40, 12, 15, 40]]],
  ['Tűzhely Pizzéria', 'Pizza', '🍕', 'Budapest IX., Ráday u. 22.', 47.4868, 19.0618, 'up', '', [[45, 19, 30, 80], [120, 18, 45, 70]]],
  ['Bors & Lime Thai', 'Thai', '🥢', 'Budapest VI., Hajós u. 7.', 47.5025, 19.056, 'down', 'Túl csípős, lassú kiszolgálás.', [[30, 13, 0, 70]]],
  ['Kakas Kávézó', 'Kávézó', '☕', 'Budapest V., Szép u. 3.', 47.4925, 19.057, null, '', [[2, 9, 30, 45]]],
  ['Rakpart Ramen', 'Ramen', '🍜', 'Budapest I., Fő u. 41.', 47.504, 19.038, 'up', 'Tonkotsu ramen 👌', [[70, 19, 0, 60], [75, 13, 0, 50], [140, 20, 0, 70]]],
  ['Hegyvidék Vendéglő', 'Magyaros', '🍲', 'Budapest XII., Városmajor u. 30.', 47.508, 19.017, null, '', [[6, 13, 0, 95]]],
  ['Duna Halászcsárda', 'Halétterem', '🐟', 'Budapest III., Királyok útja 85.', 47.562, 19.056, 'down', 'Drága, a halászlé langyos volt.', [[200, 14, 0, 110]]],
  ['Mangó Burger', 'Burger', '🍔', 'Budapest XIII., Pozsonyi út 14.', 47.515, 19.052, 'up', '', [[21, 20, 15, 55], [50, 19, 40, 60]]],
];

/** A demó helyek „kitalált” helyzete: Deák Ferenc tér. */
export const DEMO_LOCATION = { lat: 47.4977, lon: 19.0545, label: 'Demó helyzet: Deák Ferenc tér' };

export async function seedDemo(db: SQLiteDatabase) {
  const t = now();
  await db.withTransactionAsync(async () => {
    for (const [name, cuisine, emoji, address, lat, lon, rating, note, visits] of DEMO) {
      const id = randomUUID();
      await db.runAsync(
        `INSERT INTO places (id, name, address, lat, lon, category, cuisine, emoji, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'demo', ?, ?)`,
        [id, name, address, lat, lon, cuisine === 'Kávézó' ? 'cafe' : 'restaurant', cuisine, emoji, t, t],
      );
      if (rating || note) {
        await db.runAsync(
          'INSERT INTO ratings (place_id, value, note, rated_at, updated_at) VALUES (?, ?, ?, ?, ?)',
          [id, rating, note || null, rating ? t : null, t],
        );
      }
      for (const [d, h, m, dur] of visits) {
        const [s, e] = visitAt(d, h, m, dur);
        await db.runAsync(
          `INSERT INTO visits (id, place_id, start_at, end_at, source, created_at) VALUES (?, ?, ?, ?, 'demo', ?)`,
          [randomUUID(), id, s, e, t],
        );
      }
    }
  });
  bump();
}

export async function removeDemo(db: SQLiteDatabase) {
  await db.runAsync(`DELETE FROM places WHERE source = 'demo'`);
  bump();
}

export async function hasDemo(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM places WHERE source = 'demo'`);
  return (row?.n ?? 0) > 0;
}

export async function wipeAll(db: SQLiteDatabase) {
  await db.withTransactionAsync(async () => {
    await db.execAsync(`
      DELETE FROM visits; DELETE FROM ratings; DELETE FROM place_overrides; DELETE FROM shares;
      DELETE FROM places; DELETE FROM excluded_zones; DELETE FROM provider_cache;
      DELETE FROM pending_stays; DELETE FROM tracking_log;`);
    await db.runAsync(`INSERT OR REPLACE INTO settings (key, value) VALUES ('demo_seeded', '1')`);
  });
  bump();
}

/** Első indításkor demó adatokkal töltjük fel, hogy legyen mit nézni. */
export async function seedOnFirstRun(db: SQLiteDatabase) {
  if (await getSetting(db, 'demo_seeded')) return;
  await seedDemo(db);
  await db.runAsync(`INSERT OR REPLACE INTO settings (key, value) VALUES ('demo_seeded', '1')`);
}
