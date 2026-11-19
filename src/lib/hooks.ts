import * as Location from 'expo-location';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';

import { useDataVersion } from '@/db/events';
import { DEMO_LOCATION, getPlace, hasDemo, listPlaces, listVisits } from '@/db/repo';
import type { PlaceSummary, Visit } from '@/db/types';

import type { Here } from './recommend';

/** Egy aszinkron lekérdezés, ami minden adatváltozáskor újrafut */
function useQuery<T>(fn: () => Promise<T>, initial: T, deps: unknown[] = []) {
  const version = useDataVersion();
  const [data, setData] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    fn().then((d) => {
      if (alive) {
        setData(d);
        setLoaded(true);
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps]);
  return { data, loaded };
}

export function usePlaces() {
  const db = useSQLiteContext();
  return useQuery<PlaceSummary[]>(() => listPlaces(db), []);
}

export function usePlace(id: string) {
  const db = useSQLiteContext();
  return useQuery<PlaceSummary | null>(() => getPlace(db, id), null, [id]);
}

export function useVisits(placeId: string) {
  const db = useSQLiteContext();
  return useQuery<Visit[]>(() => listVisits(db, placeId), [], [placeId]);
}

/**
 * A felhasználó helyzete. Ha vannak demó adatok, a demó helyzet (Deák tér), különben a telefon helyzete
 * (első alkalommal engedélyt kér). Engedély nélkül null – ilyenkor a távolság szerinti ajánlás nem látszik.
 */
export function useHere(): Here | null {
  const db = useSQLiteContext();
  const { data: demo, loaded } = useQuery<boolean>(() => hasDemo(db), false);
  const [pos, setPos] = useState<Here | null>(null);
  useEffect(() => {
    if (!loaded || demo) return;
    let alive = true;
    (async () => {
      let perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return;
      const last = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000, requiredAccuracy: 300 });
      const p = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      if (alive) setPos({ lat: p.coords.latitude, lon: p.coords.longitude, label: 'A jelenlegi helyzeted alapján' });
    })().catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [loaded, demo]);
  return demo ? DEMO_LOCATION : pos;
}
