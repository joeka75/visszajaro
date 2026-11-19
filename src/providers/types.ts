import type { PlaceCategory } from '@/db/types';

/**
 * Helyszolgáltató közös felülete. Az app többi része nem tudja, melyik szolgáltató fut –
 * a Google Places és az OpenStreetMap megvalósítás ezt a felületet valósítja meg.
 */
export type ProviderId = 'google' | 'osm';
export type ProviderMode = ProviderId | 'auto';

export interface PlaceCandidate {
  provider: ProviderId;
  /** Google placeId vagy OSM „node/123” */
  externalId: string;
  name: string;
  lat: number;
  lon: number;
  category: PlaceCategory;
  cuisine: string;
  emoji: string;
  address?: string;
  phone?: string;
  website?: string;
  distanceM?: number;
}

export interface Point {
  lat: number;
  lon: number;
}

export interface PlaceProvider {
  id: ProviderId;
  /** Vendéglátóhelyek egy pont körül, távolság szerint rendezve */
  findFoodPlacesNear(lat: number, lon: number, radiusM: number): Promise<PlaceCandidate[]>;
  /** Több pont egyszerre (az OSM egy lekérdezésben, a Google pontonként) – a tömeges importhoz */
  findFoodPlacesNearMany?(points: Point[], radiusM: number): Promise<PlaceCandidate[][]>;
  /** Részletek külső azonosító alapján (pl. Idővonal-importból kapott Google placeId). null = nem étkezőhely / nincs ilyen */
  getPlace?(externalId: string): Promise<PlaceCandidate | null>;
}

export class ProviderError extends Error {}

export const PROVIDER_LABELS: Record<ProviderMode, string> = {
  osm: 'OpenStreetMap',
  google: 'Google',
  auto: 'Automatikus',
};

export const PROVIDER_HINTS: Record<ProviderMode, string> = {
  osm: 'Ingyenes. Budapesten jó, vidéken hiányosabb lehet.',
  google: 'A legpontosabb. API-kulcs kell hozzá, havi ingyenes keret felett fizetős.',
  auto: 'OpenStreetMap, és ha nem talál semmit, a Google-t kérdezi (ha van kulcs).',
};
