export type Rating = 'up' | 'down' | null;
export type PlaceSource = 'demo' | 'import' | 'auto' | 'manual';
export type VisitSource = 'demo' | 'import' | 'auto' | 'manual';
export type PlaceCategory = 'restaurant' | 'cafe' | 'fast_food' | 'bar' | 'pub' | 'other';

export interface Place {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lon: number;
  category: PlaceCategory;
  cuisine: string | null;
  emoji: string | null;
  phone: string | null;
  website: string | null;
  google_place_id: string | null;
  osm_id: string | null;
  source: PlaceSource;
  /** „Kipróbálnám” listára tette (ISO idő) */
  wish_at: string | null;
}

/** Hely + értékelés + látogatás-összesítő, a listákhoz */
export interface PlaceSummary extends Place {
  rating: Rating;
  note: string | null;
  hidden: number;
  visit_count: number;
  last_visit: string | null;
}

export interface Visit {
  id: string;
  place_id: string;
  start_at: string;
  end_at: string;
  source: VisitSource;
}
