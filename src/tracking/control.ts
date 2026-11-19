import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { ensureNotificationSetup } from './notify';
import { LOCATION_TASK } from './task';

/** Az Expo Go-ban a háttér-helyfigyelés nem működik – ehhez saját (fejlesztői) build kell */
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export interface TrackingStatus {
  running: boolean;
  foreground: boolean;
  background: boolean;
  notifications: boolean;
}

export async function getTrackingStatus(): Promise<TrackingStatus> {
  const [fg, bg, notif] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
    Notifications.getPermissionsAsync(),
  ]);
  let running = false;
  if (!isExpoGo) {
    try {
      running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
    } catch {
      running = false;
    }
  }
  return { running, foreground: fg.granted, background: bg.granted, notifications: notif.granted };
}

export type EnableResult =
  | { ok: true; notifications: boolean }
  | { ok: false; reason: 'expo-go' | 'foreground' | 'background' | 'services'; message: string };

/**
 * Bekapcsolás. Sorrend (Android és iOS is így várja): előtérbeli engedély → háttér („Mindig”) → értesítés → indítás.
 * Androidon a háttér-engedélynél a rendszer a Beállítások oldalra visz, ott a „Mindig engedélyezés” kell.
 */
export async function enableTracking(): Promise<EnableResult> {
  if (isExpoGo) {
    return { ok: false, reason: 'expo-go', message: 'Az Expo Go-ban a háttér-helyfigyelés nem működik. A saját fejlesztői buildben fog.' };
  }
  if (!(await Location.hasServicesEnabledAsync())) {
    return { ok: false, reason: 'services', message: 'A telefonon ki van kapcsolva a helymeghatározás. Kapcsold be, és próbáld újra.' };
  }
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) {
    return { ok: false, reason: 'foreground', message: 'Helyhozzáférés nélkül nem tudom felismerni, hol jártál.' };
  }
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (!bg.granted) {
    return {
      ok: false,
      reason: 'background',
      message: 'A háttérben is kell a hely: a Beállításokban a Visszajáró → Engedélyek → Hely → „Mindig engedélyezés”.',
    };
  }
  const notif = await Notifications.requestPermissionsAsync();
  await ensureNotificationSetup().catch(() => undefined);

  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    // Android: 3 percenként egy minta, 10 percenként kötegben kézbesítve (kíméli az akkut)
    timeInterval: 3 * 60_000,
    distanceInterval: Platform.OS === 'ios' ? 40 : 0,
    deferredUpdatesInterval: 10 * 60_000,
    // iOS
    activityType: Location.ActivityType.Other,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: false,
    // Android: állandó értesítés kell, különben a rendszer óránként csak pár mintát ad
    foregroundService: {
      notificationTitle: 'Visszajáró',
      notificationBody: 'Figyelem, ha vendéglátóhelyen jársz 🍽️',
      notificationColor: '#D9480F',
      killServiceOnDestroy: false,
    },
  });
  return { ok: true, notifications: notif.granted };
}

export async function disableTracking() {
  if (isExpoGo) return;
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}

/** Jelenlegi helyzet (otthon kizárásához, „Hova ma?”-hoz) */
export async function getHereOnce() {
  const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000, requiredAccuracy: 200 });
  const p = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  return { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy };
}
