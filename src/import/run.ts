import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { bump } from '@/db/events';
import { upsertPlace } from '@/db/places';
import { removeDemo, setSetting } from '@/db/repo';
import { resolveStops, type ProviderSettings } from '@/providers';

import type { PreparedImport } from './timeline';

export interface ImportResult {
  matchedPlaces: number;
  newPlaces: number;
  newVisits: number;
  noMatch: number;
  cancelled: boolean;
}

export interface RunImportOptions {
  dropDemo: boolean;
  onProgress?: (done: number, total: number) => void;
  isCancelled?: () => boolean;
}

export async function runImport(
  db: SQLiteDatabase,
  prepared: PreparedImport,
  settings: ProviderSettings,
  opts: RunImportOptions,
): Promise<ImportResult> {
  const groups = prepared.groups;
  const candidates = await resolveStops(
    db,
    groups.map((g) => ({ lat: g.lat, lon: g.lon, googlePlaceId: g.googlePlaceId })),
    settings,
    { onProgress: opts.onProgress, isCancelled: opts.isCancelled },
  );
  const cancelled = !!opts.isCancelled?.();

  let newPlaces = 0;
  let newVisits = 0;
  let noMatch = 0;
  const matched = new Set<string>();

  await db.withTransactionAsync(async () => {
    if (opts.dropDemo) await removeDemo(db);
    const now = new Date().toISOString();
    for (let i = 0; i < groups.length; i++) {
      const c = candidates[i];
      if (!c) {
        noMatch++;
        continue;
      }
      const { id, created } = await upsertPlace(db, c, 'import', groups[i].address);
      if (created) newPlaces++;
      matched.add(id);
      for (const s of groups[i].stops) {
        const r = await db.runAsync(
          `INSERT OR IGNORE INTO visits (id, place_id, start_at, end_at, source, confidence, created_at)
           VALUES (?, ?, ?, ?, 'import', ?, ?)`,
          [randomUUID(), id, s.start, s.end, c.distanceM != null ? Math.max(0, 1 - c.distanceM / 100) : 1, now],
        );
        newVisits += r.changes;
      }
    }
  });
  await setSetting(db, 'last_import_at', new Date().toISOString());
  bump();
  return { matchedPlaces: matched.size, newPlaces, newVisits, noMatch, cancelled };
}
