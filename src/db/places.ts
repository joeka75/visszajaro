import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { distanceM } from '@/lib/format';
import type { PlaceCandidate } from '@/providers/types';

/** Név összehasonlításhoz: kisbetű, ékezet és írásjelek nélkül */
const norm = (s: string) =>
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
  source: 'import' | 'auto',
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
  const same = near.find((p) => norm(p.name) === norm(c.name) && distanceM(p.lat, p.lon, c.lat, c.lon) <= 40);
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
