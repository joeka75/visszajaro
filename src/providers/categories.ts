import type { PlaceCategory } from '@/db/types';

/** Kategória, magyar konyha-címke és ikon – OSM címkékből és Google típusokból */
export interface Description {
  category: PlaceCategory;
  cuisine: string;
  emoji: string;
}

const CATEGORY_LABEL: Record<PlaceCategory, [string, string]> = {
  restaurant: ['Étterem', '🍽️'],
  cafe: ['Kávézó', '☕'],
  fast_food: ['Gyorsétterem', '🍟'],
  bar: ['Bár', '🍸'],
  pub: ['Pub', '🍺'],
  other: ['Vendéglátóhely', '🍽️'],
};

/** Konyhák: OSM `cuisine` érték és Google `*_restaurant` előtag egyaránt */
const CUISINE: Record<string, [string, string]> = {
  hungarian: ['Magyaros', '🥘'],
  regional: ['Magyaros', '🥘'],
  pizza: ['Pizza', '🍕'],
  italian: ['Olasz', '🍝'],
  burger: ['Burger', '🍔'],
  hamburger: ['Burger', '🍔'],
  asian: ['Ázsiai', '🥢'],
  asian_fusion: ['Ázsiai', '🥢'],
  chinese: ['Kínai', '🥡'],
  japanese: ['Japán', '🍣'],
  sushi: ['Sushi', '🍣'],
  ramen: ['Ramen', '🍜'],
  noodle: ['Tészta', '🍜'],
  thai: ['Thai', '🥢'],
  vietnamese: ['Vietnámi', '🍜'],
  korean: ['Koreai', '🥢'],
  indian: ['Indiai', '🍛'],
  kebab: ['Kebab', '🥙'],
  gyro: ['Gyros', '🥙'],
  greek: ['Görög', '🥙'],
  turkish: ['Török', '🥙'],
  lebanese: ['Libanoni', '🧆'],
  middle_eastern: ['Közel-keleti', '🧆'],
  mexican: ['Mexikói', '🌮'],
  french: ['Francia', '🥐'],
  spanish: ['Spanyol', '🥘'],
  mediterranean: ['Mediterrán', '🫒'],
  american: ['Amerikai', '🍔'],
  steak_house: ['Steak', '🥩'],
  steak: ['Steak', '🥩'],
  seafood: ['Tenger gyümölcsei', '🦐'],
  fish: ['Hal', '🐟'],
  vegan: ['Vegán', '🥦'],
  vegetarian: ['Vegetáriánus', '🥦'],
  breakfast: ['Reggeliző', '🍳'],
  brunch: ['Reggeliző', '🍳'],
  sandwich: ['Szendvics', '🥪'],
  chicken: ['Csirke', '🍗'],
  bistro: ['Bisztró', '🥗'],
  fine_dining: ['Fine dining', '🍷'],
  coffee_shop: ['Kávézó', '☕'],
  cake: ['Cukrászda', '🍰'],
  ice_cream: ['Fagyi', '🍦'],
  bakery: ['Pékség', '🥐'],
  international: ['Nemzetközi', '🍽️'],
};

const labelFor = (cat: PlaceCategory, cuisineKey: string | null): Description => {
  const [catLabel, catEmoji] = CATEGORY_LABEL[cat];
  const c = cuisineKey ? CUISINE[cuisineKey] : undefined;
  if (!c) return { category: cat, cuisine: catLabel, emoji: catEmoji };
  // Étteremnél elég a konyha („Olasz”), máshol „Kávézó · Reggeliző”
  const label = cat === 'restaurant' || c[0] === catLabel ? c[0] : `${catLabel} · ${c[0]}`;
  return { category: cat, cuisine: label, emoji: c[1] };
};

/* ---------------- OpenStreetMap ---------------- */

export const OSM_FOOD_AMENITIES = ['restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'biergarten', 'food_court', 'ice_cream'];

const OSM_CATEGORY: Record<string, PlaceCategory> = {
  restaurant: 'restaurant',
  food_court: 'restaurant',
  cafe: 'cafe',
  ice_cream: 'cafe',
  fast_food: 'fast_food',
  bar: 'bar',
  pub: 'pub',
  biergarten: 'pub',
};

export function describeOsm(tags: Record<string, string>): Description {
  const cat = OSM_CATEGORY[tags.amenity] ?? 'other';
  const cuisine = (tags.cuisine || '').split(';')[0].trim() || null;
  if (tags.amenity === 'ice_cream') return labelFor(cat, 'ice_cream');
  return labelFor(cat, cuisine);
}

/* ---------------- Google Places ---------------- */

/** Nearby Search szűrő (Table A típusok, max. 50) */
export const GOOGLE_FOOD_TYPES = [
  'restaurant',
  'cafe',
  'coffee_shop',
  'bar',
  'pub',
  'wine_bar',
  'cocktail_bar',
  'beer_garden',
  'gastropub',
  'brewpub',
  'bistro',
  'fast_food_restaurant',
  'food_court',
  'meal_takeaway',
  'bakery',
  'cake_shop',
  'pastry_shop',
  'dessert_shop',
  'ice_cream_shop',
  'tea_house',
  'sandwich_shop',
  'kebab_shop',
  'diner',
  'deli',
  'cafeteria',
];

/** Étkezőhely-e egy Google hely a típusai alapján */
export function isGoogleFoodPlace(types: string[] = []) {
  return types.some(
    (t) => GOOGLE_FOOD_TYPES.includes(t) || t.endsWith('_restaurant') || t === 'food' || t.endsWith('_bar'),
  );
}

export function describeGoogle(primaryType: string | undefined, types: string[] = []): Description {
  const all = [primaryType, ...types].filter(Boolean) as string[];
  const has = (re: RegExp) => all.some((t) => re.test(t));
  let cat: PlaceCategory = 'restaurant';
  if (has(/^(fast_food_restaurant|meal_takeaway|kebab_shop|hot_dog_stand|sandwich_shop)$/)) cat = 'fast_food';
  if (has(/^(cafe|coffee_shop|coffee_stand|tea_house|cake_shop|pastry_shop|dessert_shop|ice_cream_shop|bakery)$/)) cat = 'cafe';
  if (has(/^(bar|wine_bar|cocktail_bar|lounge_bar|sports_bar|hookah_bar)$/)) cat = 'bar';
  if (has(/^(pub|irish_pub|gastropub|brewpub|beer_garden|brewery)$/)) cat = 'pub';
  if (primaryType?.endsWith('_restaurant') || primaryType === 'restaurant' || primaryType === 'bistro') cat = 'restaurant';

  // Konyha a legspecifikusabb típusból: „italian_restaurant” → „italian”
  const specific = all.find((t) => t.endsWith('_restaurant') && t !== 'fast_food_restaurant') ?? primaryType ?? '';
  let key = specific.replace(/_restaurant$|_shop$|_house$/, '');
  if (primaryType === 'ice_cream_shop') key = 'ice_cream';
  if (primaryType === 'coffee_shop') key = 'coffee_shop';
  return labelFor(cat, CUISINE[key] ? key : null);
}
