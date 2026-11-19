import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { setRating } from '@/db/repo';

import { deleteWrongVisit, processPending } from './engine';
import { ACTION_DOWN, ACTION_UP, ACTION_WRONG, type VisitNotificationData } from './notify';

/**
 * Az app gyökerében fut (nem rajzol semmit):
 *  - a „Milyen volt?” értesítés gombjait kezeli (👍 / 👎 / Nem itt voltam / koppintás),
 *  - előtérbe kerüléskor feldolgozza a háttérben félbemaradt felismeréseket (pl. nem volt net).
 */
export function TrackingBridge() {
  const db = useSQLiteContext();
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef(new Set<string>());

  useEffect(() => {
    if (!response) return;
    const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
    if (handled.current.has(key)) return;
    handled.current.add(key);

    const data = response.notification.request.content.data as Partial<VisitNotificationData> | undefined;
    if (!data?.placeId || !data.visitId) return;
    const { placeId, visitId } = data;

    (async () => {
      await Notifications.dismissNotificationAsync(response.notification.request.identifier).catch(() => undefined);
      switch (response.actionIdentifier) {
        case ACTION_UP:
        case ACTION_DOWN:
          await setRating(db, placeId, response.actionIdentifier);
          router.push({ pathname: '/place/[id]', params: { id: placeId } });
          break;
        case ACTION_WRONG:
          await deleteWrongVisit(db, visitId, placeId);
          break;
        default:
          router.push({ pathname: '/place/[id]', params: { id: placeId } });
      }
    })().catch((e) => console.warn('[visszajaro] értesítés kezelése', e));
  }, [response, db]);

  useEffect(() => {
    processPending(db).catch(() => undefined);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') processPending(db).catch(() => undefined);
    });
    return () => sub.remove();
  }, [db]);

  return null;
}
