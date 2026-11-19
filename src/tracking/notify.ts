import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import type { Rating } from '@/db/types';
import { fmtTime } from '@/lib/format';

export const CHANNEL_ID = 'visits';
export const CATEGORY_ID = 'rate_visit';
export const ACTION_UP = 'up';
export const ACTION_DOWN = 'down';
export const ACTION_WRONG = 'wrong';

export interface VisitNotificationData {
  placeId: string;
  visitId: string;
  [key: string]: unknown;
}

let ready: Promise<void> | null = null;

/** Értesítési csatorna és a 👍 / 👎 / „Nem itt voltam” gombok – egyszer kell beállítani */
export function ensureNotificationSetup() {
  ready ??= (async () => {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Éttermi látogatások',
        description: '„Milyen volt?” kérdés, miután eljöttél egy vendéglátóhelyről',
        importance: AndroidImportance.DEFAULT,
      });
    }
    await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
      { identifier: ACTION_UP, buttonTitle: '👍 Tetszett', options: { opensAppToForeground: true } },
      { identifier: ACTION_DOWN, buttonTitle: '👎 Nem tetszett', options: { opensAppToForeground: true } },
      { identifier: ACTION_WRONG, buttonTitle: 'Nem itt voltam', options: { opensAppToForeground: true, isDestructive: true } },
    ]);
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

/** Az app előtérben is mutassa az értesítést */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function notifyVisit(p: {
  placeId: string;
  visitId: string;
  name: string;
  emoji: string | null;
  rating: Rating;
  /** a Kipróbálnám listáról, első látogatás */
  firstTry?: boolean;
  start: Date;
  end: Date;
}) {
  await ensureNotificationSetup();
  const when = `${fmtTime(p.start.toISOString())}–${fmtTime(p.end.toISOString())}`;
  const body =
    p.rating === 'up'
      ? `${when} · Legutóbb tetszett 👍 – most is?`
      : p.rating === 'down'
        ? `${when} · Legutóbb nem tetszett 👎 – most jobb volt?`
        : `${when} · Milyen volt?`;
  const data: VisitNotificationData = { placeId: p.placeId, visitId: p.visitId };
  await Notifications.scheduleNotificationAsync({
    content: {
      title: p.firstTry ? `🔖 Végre kipróbáltad: ${p.name}` : `${p.emoji ?? '🍽️'} Itt jártál: ${p.name}`,
      body,
      data,
      categoryIdentifier: CATEGORY_ID,
    },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
  });
}
