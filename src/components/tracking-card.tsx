import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card } from '@/components/ui';
import { useDataVersion } from '@/db/events';
import { getSetting, setSetting } from '@/db/repo';
import { fmtTime } from '@/lib/format';
import { disableTracking, enableTracking, getHereOnce, getTrackingStatus, isExpoGo, type TrackingStatus } from '@/tracking/control';
import { addZone, clearZones, getTrackingStats, listLog, listZones, log, resetTrackingState, type LogEntry } from '@/tracking/engine';
import { space, useColors } from '@/theme';

const KIND_ICON: Record<LogEntry['kind'], string> = { info: 'ℹ️', stay: '⏱️', visit: '🍽️', skip: '–', error: '⚠️' };

const minutesAgo = (iso: string | null) => {
  if (!iso) return 'még nincs';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  return m < 1 ? 'most' : m < 120 ? `${m} perce` : `${Math.round(m / 60)} órája`;
};

/** Beállítások → Automatikus felismerés (M3) */
export function TrackingCard() {
  const c = useColors();
  const db = useSQLiteContext();
  const version = useDataVersion();
  const [status, setStatus] = useState<TrackingStatus | null>(null);
  const [stats, setStats] = useState<{ lastSampleAt: string | null; sampleCount: number; pending: number } | null>(null);
  const [zones, setZones] = useState(0);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [showLog, setShowLog] = useState(false);

  const refresh = useCallback(async () => {
    setStatus(await getTrackingStatus());
    setStats(await getTrackingStats(db));
    setZones((await listZones(db)).length);
    setEntries(await listLog(db, 12));
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refresh, version]),
  );

  const turnOn = async () => {
    setBusy(true);
    try {
      const r = await enableTracking();
      if (r.ok) {
        await setSetting(db, 'tracking_enabled', '1');
        await log(db, 'info', 'Automatikus felismerés bekapcsolva');
        if (Platform.OS === 'android' && !(await getSetting(db, 'battery_tip_shown'))) {
          await setSetting(db, 'battery_tip_shown', '1');
          Alert.alert(
            'Még egy lépés (Samsung)',
            'Hogy a telefon ne állítsa le a háttérben: Beállítások → Alkalmazások → Visszajáró → Akkumulátor → „Nem korlátozott”.',
            [
              { text: 'Később', style: 'cancel' },
              { text: 'Megnyitom', onPress: () => Linking.openSettings() },
            ],
          );
        }
      } else if (r.reason === 'background' || r.reason === 'foreground') {
        Alert.alert('Engedély kell', r.message, [
          { text: 'Mégse', style: 'cancel' },
          { text: 'Beállítások', onPress: () => Linking.openSettings() },
        ]);
      } else {
        Alert.alert('Nem sikerült', r.message);
      }
    } catch (e) {
      Alert.alert('Hiba', (e as Error).message);
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      await disableTracking();
      await resetTrackingState(db);
      await setSetting(db, 'tracking_enabled', null);
      await log(db, 'info', 'Automatikus felismerés kikapcsolva');
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const excludeHere = () =>
    Alert.alert('Kizárod a mostani helyet?', 'A környékén (150 m) töltött időt nem fogom étteremlátogatásnak venni. Otthonra és munkahelyre ajánlott.', [
      { text: 'Mégse', style: 'cancel' },
      {
        text: 'Kizárom',
        onPress: async () => {
          try {
            const h = await getHereOnce();
            await addZone(db, h.lat, h.lon, 'Otthon / munkahely');
            await log(db, 'info', `Kizárt hely hozzáadva (±${Math.round(h.acc ?? 0)} m)`);
          } catch (e) {
            Alert.alert('Nem sikerült a helymeghatározás', (e as Error).message);
          }
        },
      },
    ]);

  const running = !!status?.running;

  return (
    <Card>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: running ? c.good : c.line }]} />
        <Text style={{ color: c.text, fontWeight: '700', flex: 1 }}>{running ? 'Bekapcsolva' : 'Kikapcsolva'}</Text>
      </View>
      <Text style={{ color: c.muted, fontSize: 13, marginTop: 4 }}>
        Ha legalább 20 percet töltesz egy vendéglátóhelyen, utána megkérdezem, milyen volt. A helyadatok csak ezen a telefonon
        maradnak; a felismeréshez csak a megállás koordinátája megy a helyszolgáltatónak.
      </Text>

      {isExpoGo ? (
        <Text style={{ color: c.bad, fontSize: 13, marginTop: space.s }}>
          Az Expo Go-ban ez nem működik – a saját fejlesztői buildben fog (lásd README).
        </Text>
      ) : null}

      {running ? (
        <Button label="Kikapcsolás" kind="soft" onPress={turnOff} disabled={busy} style={{ marginTop: space.m }} />
      ) : (
        <Button label={busy ? 'Bekapcsolás…' : '📍  Bekapcsolás'} onPress={turnOn} disabled={busy || isExpoGo} style={{ marginTop: space.m }} />
      )}

      {status && running && (!status.background || !status.notifications) ? (
        <Text style={{ color: c.bad, fontSize: 13, marginTop: space.s }}>
          {!status.background ? 'Hiányzik a „Mindig engedélyezés” helyengedély. ' : ''}
          {!status.notifications ? 'Az értesítések le vannak tiltva – nem fogom tudni megkérdezni, milyen volt.' : ''}
        </Text>
      ) : null}

      <View style={[styles.sep, { borderTopColor: c.line }]} />
      <Text style={{ color: c.text }}>
        Kizárt helyek (otthon, munkahely): <Text style={{ fontWeight: '700' }}>{zones}</Text>
      </Text>
      <View style={{ flexDirection: 'row', gap: space.s, marginTop: space.s }}>
        <Button label="Itt vagyok – kizárom" kind="soft" onPress={excludeHere} style={{ flex: 1 }} />
        {zones ? <Button label="Törlés" kind="danger" onPress={() => clearZones(db)} style={{ flex: 0.5 }} /> : null}
      </View>

      {stats ? (
        <Text style={{ color: c.muted, fontSize: 12, marginTop: space.m }}>
          Utolsó helyminta: {minutesAgo(stats.lastSampleAt)} · összesen {stats.sampleCount}
          {stats.pending ? ` · ${stats.pending} megállás vár felismerésre` : ''}
        </Text>
      ) : null}

      <Pressable onPress={() => setShowLog((v) => !v)} accessibilityRole="button" style={{ marginTop: space.s }}>
        <Text style={{ color: c.accent, fontWeight: '600' }}>{showLog ? 'Napló elrejtése' : 'Napló (teszteléshez)'}</Text>
      </Pressable>
      {showLog ? (
        <View style={{ marginTop: space.s }}>
          {entries.length ? (
            entries.map((e) => (
              <Text key={e.id} style={{ color: c.text, fontSize: 12, paddingVertical: 2 }}>
                {fmtTime(e.at)} {KIND_ICON[e.kind]} {e.message}
              </Text>
            ))
          ) : (
            <Text style={{ color: c.muted, fontSize: 12 }}>Még üres.</Text>
          )}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  dot: { width: 10, height: 10, borderRadius: 5 },
  sep: { borderTopWidth: 1, marginVertical: space.m },
});
