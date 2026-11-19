import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { distanceM } from '@/lib/format';
import type { PlaceCandidate } from '@/providers/types';

import { bump } from './events';
import type { PlaceSource } from './types';

/** Név összehasonlításhoz: kisbetű, ékezet és írásjelek nélkül */
export const normName = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

/**
 * Megkeresi vagy létrehozza a helyet. Egy étterem = egy sor, akár Google-ből, akár OSM-ből jött:
 * ha a másik szolgáltatóból már megvan ugyanaz (≤ 40 m, azonos név), ahhoz kapcsoljuk.
 */
export async function upsertPlace(
  db: SQLiteDatabase,
  c: PlaceCandidate,
  source: Exclude<PlaceSource, 'demo'>,
  fallbackAddress?: string | null,
): Promise<{ id: string; created: boolean }> {
  const idCol = c.provider === 'google' ? 'google_place_id' : 'osm_id';
  const existing = await db.getFirstAsync<{ id: string }>(`SELECT id FROM places WHERE ${idCol} = ?`, [c.externalId]);
  if (existing) return { id: existing.id, created: false };

  const near = await db.getAllAsync<{ id: string; name: string; lat: number; lon: number }>(
    `SELECT id, name, lat, lon FROM places WHERE ${idCol} IS NULL AND source != 'demo'
       AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?`,
    [c.lat - 0.0005, c.lat + 0.0005, c.lon - 0.0008, c.lon + 0.0008],
  );
  const same = near.find((p) => normName(p.name) === normName(c.name) && distanceM(p.lat, p.lon, c.lat, c.lon) <= 40);
  const now = new Date().toISOString();
  if (same) {
    await db.runAsync(`UPDATE places SET ${idCol} = ?, updated_at = ? WHERE id = ?`, [c.externalId, now, same.id]);
    return { id: same.id, created: false };
  }

  const id = randomUUID();
  await db.runAsync(
    `INSERT INTO places (id, name, address, lat, lon, category, cuisine, emoji, phone, website, google_place_id, osm_id, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      c.name,
      c.address ?? fallbackAddress ?? null,
      c.lat,
      c.lon,
      c.category,
      c.cuisine,
      c.emoji,
      c.phone ?? null,
      c.website ?? null,
      c.provider === 'google' ? c.externalId : null,
      c.provider === 'osm' ? c.externalId : null,
      source,
      now,
      now,
    ],
  );
  return { id, created: true };
}

/** „Kipróbálnám”: a felfedezett helyet elmenti későbbre */
export async function addWish(db: SQLiteDatabase, c: PlaceCandidate) {
  let id = '';
  await db.withTransactionAsync(async () => {
    id = (await upsertPlace(db, c, 'manual')).id;
    await db.runAsync('UPDATE places SET wish_at = ?, updated_at = ? WHERE id = ?', [new Date().toISOString(), new Date().toISOString(), id]);
  });
  bump();
  return id;
}

/** Levétel a „Kipróbálnám” listáról; ha a hely csak emiatt volt meg, törlődik */
export async function removeWish(db: SQLiteDatabase, placeId: string) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE places SET wish_at = NULL WHERE id = ?', [placeId]);
    await db.runAsync(
      `DELETE FROM places WHERE id = ? AND source = 'manual'
         AND NOT EXISTS (SELECT 1 FROM visits WHERE place_id = ?)
         AND NOT EXISTS (SELECT 1 FROM ratings WHERE place_id = ?)`,
      [placeId, placeId, placeId],
    );
  });
  bump();
}

/** Megosztás naplózása (statisztikához, később: melyik csatorna hoz új felhasználót) */
export async function logShare(db: SQLiteDatabase, placeId: string, channel: string) {
  await db.runAsync('INSERT INTO shares (id, place_id, channel, created_at) VALUES (?, ?, ?, ?)', [
    randomUUID(),
    placeId,
    channel,
    new Date().toISOString(),
  ]);
}
