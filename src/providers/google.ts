import { distanceM } from '@/lib/format';

import { describeGoogle, GOOGLE_FOOD_TYPES, isGoogleFoodPlace } from './categories';
import { ProviderError, type PlaceCandidate, type PlaceProvider } from './types';

/**
 * Google Places API (New).
 *  - Nearby Search: POST https://places.googleapis.com/v1/places:searchNearby  → „Nearby Search Pro” díjkategória
 *  - Place Details: GET  https://places.googleapis.com/v1/places/{placeId}    → „Place Details Pro” díjkategória
 * Szándékosan NEM kérünk telefonszámot/weboldalt: azok a drágább „Enterprise” kategóriába vinnék a hívást.
 */
const BASE = 'https://places.googleapis.com/v1';
const FIELDS = ['id', 'displayName', 'location', 'primaryType', 'types', 'shortFormattedAddress'];
const TIMEOUT_MS = 20_000;

interface GPlace {
  id: string;
  displayName?: { text: string };
  location?: { latitude: number; longitude: number };
  primaryType?: string;
  types?: string[];
  shortFormattedAddress?: string;
}

async function call<T>(apiKey: string, url: string, fieldMask: string, body?: unknown): Promise<T | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ac.signal,
    });
    if (r.status === 404) return null; // elavult / ismeretlen placeId
    if (!r.ok) {
      let msg = `HTTP ${r.status}`;
      try {
        const j = (await r.json()) as { error?: { message?: string; status?: string } };
        if (j.error?.message) msg = j.error.message;
      } catch {}
      if (r.status === 400 && /invalid|malformed/i.test(msg) && !url.includes(':searchNearby')) return null;
      if (r.status === 403 || r.status === 401) {
        throw new ProviderError(`A Google elutasította a kulcsot: ${msg}. Ellenőrizd, hogy a Places API (New) engedélyezve van-e.`);
      }
      throw new ProviderError(`Google hiba: ${msg}`);
    }
    return (await r.json()) as T;
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(
      (e as Error).name === 'AbortError' ? 'A Google nem válaszolt időben.' : `Google hiba: ${(e as Error).message}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

function toCandidate(p: GPlace, from?: { lat: number; lon: number }): PlaceCandidate | null {
  if (!p.location || !p.displayName?.text) return null;
  const d = describeGoogle(p.primaryType, p.types);
  return {
    provider: 'google',
    externalId: p.id,
    name: p.displayName.text,
    lat: p.location.latitude,
    lon: p.location.longitude,
    category: d.category,
    cuisine: d.cuisine,
    emoji: d.emoji,
    address: p.shortFormattedAddress,
    distanceM: from ? distanceM(from.lat, from.lon, p.location.latitude, p.location.longitude) : undefined,
  };
}

export function createGoogleProvider(apiKey: string): PlaceProvider {
  return {
    id: 'google',

    async findFoodPlacesNear(lat, lon, radiusM) {
      const res = await call<{ places?: GPlace[] }>(
        apiKey,
        `${BASE}/places:searchNearby`,
        FIELDS.map((f) => `places.${f}`).join(','),
        {
          includedTypes: GOOGLE_FOOD_TYPES,
          maxResultCount: 10,
          rankPreference: 'DISTANCE',
          languageCode: 'hu',
          regionCode: 'HU',
          locationRestriction: { circle: { center: { latitude: lat, longitude: lon }, radius: radiusM } },
        },
      );
      return (res?.places ?? [])
        .map((p) => toCandidate(p, { lat, lon }))
        .filter((c): c is PlaceCandidate => !!c)
        .sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
    },

    async getPlace(placeId) {
      const p = await call<GPlace>(
        apiKey,
        `${BASE}/places/${encodeURIComponent(placeId)}?languageCode=hu&regionCode=HU`,
        FIELDS.join(','),
      );
      if (!p || !isGoogleFoodPlace([p.primaryType ?? '', ...(p.types ?? [])])) return null;
      return toCandidate(p);
    },
  };
}
