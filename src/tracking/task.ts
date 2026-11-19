/**
 * Háttérfeladat: a rendszer ide küldi a helymintákat akkor is, ha az app nincs megnyitva.
 * Ezt a fájlt az app indulásakor (src/app/_layout.tsx) be kell tölteni, hogy a feladat definiálva legyen.
 */
import type { LocationObject } from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { getTrackingDb, handleSamples, log } from './engine';

export const LOCATION_TASK = 'visszajaro-location';

TaskManager.defineTask<{ locations: LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  try {
    const db = await getTrackingDb();
    if (error) {
      await log(db, 'error', `Helyfigyelés hiba: ${error.message}`);
      return;
    }
    const samples = (data?.locations ?? []).map((l) => ({
      lat: l.coords.latitude,
      lon: l.coords.longitude,
      t: l.timestamp,
      acc: l.coords.accuracy,
    }));
    await handleSamples(db, samples);
  } catch (e) {
    console.warn('[visszajaro] háttérfeladat hiba', e);
  }
});
