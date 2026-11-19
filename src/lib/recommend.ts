import type { PlaceSummary } from '@/db/types';

import { daysSince, distanceM } from './format';

export interface Here {
  lat: number;
  lon: number;
  label: string;
}

export const visible = (ps: PlaceSummary[]) => ps.filter((p) => !p.hidden);
const byLastVisitAsc = (a: PlaceSummary, b: PlaceSummary) => (a.last_visit ?? '').localeCompare(b.last_visit ?? '');
const byLastVisitDesc = (a: PlaceSummary, b: PlaceSummary) => -byLastVisitAsc(a, b);

/** Kedvencek, ahol legalább 30 napja nem jártál – a legrégebbi elöl */
export function longAgoFavourites(ps: PlaceSummary[], limit = 4) {
  return visible(ps)
    .filter((p) => p.rating === 'up' && p.last_visit && daysSince(p.last_visit) >= 30)
    .sort(byLastVisitAsc)
    .slice(0, limit);
}

export function nearbyFavourites(ps: PlaceSummary[], here: Here, limit = 3) {
  return visible(ps)
    .filter((p) => p.rating === 'up')
    .map((p) => ({ p, d: distanceM(here.lat, here.lon, p.lat, p.lon) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map((x) => x.p);
}

export function unrated(ps: PlaceSummary[], limit = 4) {
  return visible(ps)
    .filter((p) => !p.rating && p.visit_count > 0)
    .sort(byLastVisitDesc)
    .slice(0, limit);
}

/** „Kipróbálnám”: elmentett, de még meg nem látogatott helyek, a legutóbb mentett elöl */
export function wishlist(ps: PlaceSummary[]) {
  return visible(ps)
    .filter((p) => p.wish_at && p.visit_count === 0)
    .sort((a, b) => (b.wish_at ?? '').localeCompare(a.wish_at ?? ''));
}

export function randomFavourite(ps: PlaceSummary[]) {
  const liked = visible(ps).filter((p) => p.rating === 'up');
  return liked.length ? liked[Math.floor(Math.random() * liked.length)] : null;
}

export type ListFilter = 'all' | 'up' | 'down' | 'none' | 'wish' | 'hidden';
export type ListSort = 'recent' | 'count' | 'name' | 'dist';

export function filterAndSort(ps: PlaceSummary[], f: ListFilter, sort: ListSort, q: string, here: Here | null) {
  let out = f === 'hidden' ? ps.filter((p) => p.hidden) : visible(ps);
  if (f === 'up') out = out.filter((p) => p.rating === 'up');
  if (f === 'down') out = out.filter((p) => p.rating === 'down');
  if (f === 'none') out = out.filter((p) => !p.rating && p.visit_count > 0);
  if (f === 'wish') out = out.filter((p) => p.wish_at && p.visit_count === 0);
  const query = q.trim().toLowerCase();
  if (query) {
    out = out.filter((p) => `${p.name} ${p.cuisine ?? ''} ${p.address ?? ''}`.toLowerCase().includes(query));
  }
  return out.slice().sort((a, b) => {
    if (sort === 'count') return b.visit_count - a.visit_count;
    if (sort === 'name') return a.name.localeCompare(b.name, 'hu');
    if (sort === 'dist' && here) {
      return distanceM(here.lat, here.lon, a.lat, a.lon) - distanceM(here.lat, here.lon, b.lat, b.lon);
    }
    return byLastVisitDesc(a, b);
  });
}
