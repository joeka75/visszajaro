/**
 * Pro funkciók kapcsolói.
 *
 * Saját teszt alatt minden be van kapcsolva. Nyilvános induláskor az `isPro` értékét
 * az előfizetés (RevenueCat) adja majd, és a `PRO_ONLY` funkciók csak előfizetőknek élnek.
 */
export type Feature =
  | 'timelineImportFull' // teljes múlt importálása (ingyen: utolsó 3 hónap)
  | 'statsDetailed' // részletes statisztika, „Év éttermei”
  | 'photos' // fotók, ételszintű jegyzetek
  | 'cloudSync' // felhő szinkron, több eszköz
  | 'export'; // CSV / PDF export

export const PRO_ONLY: Record<Feature, string> = {
  timelineImportFull: 'Teljes múlt importálása',
  statsDetailed: 'Részletes statisztikák, „Év éttermei”',
  photos: 'Fotók, ételszintű jegyzetek',
  cloudSync: 'Felhő szinkron, több eszköz',
  export: 'Export (CSV / PDF)',
};

/** Saját teszt mód: minden Pro funkció elérhető. */
export const TEST_MODE = true;

export function hasFeature(_feature: Feature, isPro = false) {
  return TEST_MODE || isPro;
}
