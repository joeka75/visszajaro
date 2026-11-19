import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Adatbázis-migrációk. Minden lépés egyszer fut le; a verziót a PRAGMA user_version tárolja.
 * Új séma-változásnál MINDIG új elemet adj a tömb végére, a régieket ne módosítsd.
 *
 * A séma úgy készült, hogy később változtatás nélkül felkerülhessen a felhőbe (Postgres):
 * UUID azonosítók, user_id oszlopok, időbélyegek a szinkronhoz.
 */
const MIGRATIONS: string[] = [
  // 1 – alap séma
  `
  CREATE TABLE places (
    id              TEXT PRIMARY KEY NOT NULL,
    name            TEXT NOT NULL,
    address         TEXT,
    lat             REAL NOT NULL,
    lon             REAL NOT NULL,
    category        TEXT NOT NULL DEFAULT 'restaurant',
    cuisine         TEXT,
    emoji           TEXT,
    phone           TEXT,
    website         TEXT,
    google_place_id TEXT UNIQUE,
    osm_id          TEXT UNIQUE,
    source          TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );

  CREATE TABLE visits (
    id         TEXT PRIMARY KEY NOT NULL,
    place_id   TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    start_at   TEXT NOT NULL,
    end_at     TEXT NOT NULL,
    source     TEXT NOT NULL,
    confidence REAL,
    user_id    TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (place_id, start_at)
  );
  CREATE INDEX visits_place_start ON visits(place_id, start_at);

  CREATE TABLE ratings (
    place_id   TEXT PRIMARY KEY NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    value      TEXT CHECK (value IN ('up', 'down')),
    note       TEXT,
    rated_at   TEXT,
    user_id    TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE place_overrides (
    place_id    TEXT PRIMARY KEY NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    hidden      INTEGER NOT NULL DEFAULT 0,
    custom_name TEXT,
    updated_at  TEXT NOT NULL
  );

  CREATE TABLE excluded_zones (
    id         TEXT PRIMARY KEY NOT NULL,
    lat        REAL NOT NULL,
    lon        REAL NOT NULL,
    radius_m   REAL NOT NULL,
    label      TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE shares (
    id         TEXT PRIMARY KEY NOT NULL,
    place_id   TEXT REFERENCES places(id) ON DELETE SET NULL,
    channel    TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE provider_cache (
    provider   TEXT NOT NULL,
    query_key  TEXT NOT NULL,
    payload    TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (provider, query_key)
  );

  CREATE TABLE settings (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT
  );
  `,

  // 2 – automatikus felismerés (M3): feldolgozásra váró megállások és egy rövid napló
  `
  CREATE TABLE pending_stays (
    id         TEXT PRIMARY KEY NOT NULL,
    lat        REAL NOT NULL,
    lon        REAL NOT NULL,
    start_at   TEXT NOT NULL UNIQUE,
    end_at     TEXT NOT NULL,
    attempts   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE tracking_log (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    at      TEXT NOT NULL,
    kind    TEXT NOT NULL,
    message TEXT NOT NULL
  );
  `,
];

export async function migrate(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
    });
    version++;
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
}
