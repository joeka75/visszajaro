import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Empty, SectionTitle } from '@/components/ui';
import { addWish, normName } from '@/db/places';
import type { PlaceSummary } from '@/db/types';
import { distanceM, fmtDist } from '@/lib/format';
import type { Here } from '@/lib/recommend';
import { discoverNearby, getProviderSettings } from '@/providers';
import type { PlaceCandidate } from '@/providers/types';
import { radius, space, useColors } from '@/theme';

const RADIUS_M = 800;
const SHOW_FIRST = 5;
const SHOW_MAX = 20;

/** Ismert-e már a hely (azonosító, vagy azonos név 60 m-en belül) */
function isKnown(c: PlaceCandidate, places: PlaceSummary[]) {
  const n = normName(c.name);
  return places.some(
    (p) =>
      (c.provider === 'osm' ? p.osm_id === c.externalId : p.google_place_id === c.externalId) ||
      (normName(p.name) === n && distanceM(p.lat, p.lon, c.lat, c.lon) <= 60),
  );
}

type State = { kind: 'loading' } | { kind: 'ok'; items: PlaceCandidate[] } | { kind: 'error'; message: string };

/** „Hova ma?” → Új helyek a közelben: ahol még nem jártál */
export function DiscoverSection({ here, places }: { here: Here; places: PlaceSummary[] }) {
  const c = useColors();
  const db = useSQLiteContext();
  const [res, setRes] = useState<{ key: string; items?: PlaceCandidate[]; error?: string } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [reload, setReload] = useState(0);
  // ~100 m-es lépésben frissül, ne kérdezzünk minden apró mozdulatra
  const spot = `${here.lat.toFixed(3)},${here.lon.toFixed(3)}`;

  const key = `${spot}|${reload}`;

  useEffect(() => {
    let alive = true;
    (async () => {
      const settings = await getProviderSettings(db);
      const items = await discoverNearby(db, here, RADIUS_M, settings);
      if (alive) setRes({ key, items });
    })().catch((e) => alive && setRes({ key, error: (e as Error).message }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, db]);

  const state: State =
    !res || res.key !== key
      ? { kind: 'loading' }
      : res.error
        ? { kind: 'error', message: res.error }
        : { kind: 'ok', items: res.items ?? [] };

  // (a React Compiler magától memoizál)
  const fresh =
    state.kind !== 'ok'
      ? []
      : state.items
          .filter((x) => !isKnown(x, places))
          .map((x) => ({ ...x, distanceM: distanceM(here.lat, here.lon, x.lat, x.lon) }))
          .sort((a, b) => a.distanceM - b.distanceM)
          .slice(0, SHOW_MAX);

  const shown = expanded ? fresh : fresh.slice(0, SHOW_FIRST);

  const openInMaps = (x: PlaceCandidate) => {
    const q = encodeURIComponent(`${x.name} ${x.address ?? ''}`.trim());
    const pid = x.provider === 'google' ? `&query_place_id=${encodeURIComponent(x.externalId)}` : '';
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}${pid}`);
  };

  const onPress = (x: PlaceCandidate) =>
    Alert.alert(`${x.emoji ?? '🍽️'} ${x.name}`, [x.cuisine, x.address, x.distanceM != null ? fmtDist(x.distanceM) : null].filter(Boolean).join(' · '), [
      { text: 'Mégse', style: 'cancel' },
      { text: 'Térkép, vélemények', onPress: () => openInMaps(x) },
      { text: '🔖 Kipróbálnám', onPress: () => addWish(db, x) },
    ]);

  return (
    <>
      <SectionTitle title="Új helyek a közelben" hint={`${RADIUS_M} m-en belül, ahol még nem jártál`} />
      {state.kind === 'loading' ? (
        <Empty text="Keresem a közeli helyeket…" />
      ) : state.kind === 'error' ? (
        <View>
          <Empty text={state.message} />
          <Button label="Újra" kind="soft" onPress={() => setReload((n) => n + 1)} style={{ alignSelf: 'flex-start', marginTop: space.s }} />
        </View>
      ) : !fresh.length ? (
        <Empty text="A közelben minden helyen jártál már – vagy nincs a térképen étterem. 🙂" />
      ) : (
        <>
          {shown.map((x) => (
            <Pressable
              key={`${x.provider}:${x.externalId}`}
              accessibilityRole="button"
              accessibilityLabel={`${x.name}, ${fmtDist(x.distanceM ?? 0)}`}
              onPress={() => onPress(x)}
              style={({ pressed }) => [styles.row, { backgroundColor: c.card, borderColor: pressed ? c.accent : c.line }]}>
              <View style={[styles.ico, { backgroundColor: c.bg }]}>
                <Text style={{ fontSize: 20 }}>{x.emoji || '🍽️'}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ color: c.text, fontWeight: '700', fontSize: 15 }}>
                  {x.name}
                </Text>
                <Text numberOfLines={1} style={{ color: c.muted, fontSize: 13 }}>
                  {[x.cuisine, fmtDist(x.distanceM ?? 0)].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${x.name} mentése: Kipróbálnám`}
                hitSlop={8}
                onPress={() => addWish(db, x)}
                style={[styles.save, { borderColor: c.line, backgroundColor: c.bg }]}>
                <Text style={{ fontSize: 15 }}>🔖</Text>
              </Pressable>
            </Pressable>
          ))}
          {fresh.length > SHOW_FIRST ? (
            <Pressable accessibilityRole="button" onPress={() => setExpanded((v) => !v)} style={{ paddingVertical: space.s }}>
              <Text style={{ color: c.accent, fontWeight: '600' }}>
                {expanded ? 'Kevesebb' : `További ${fresh.length - SHOW_FIRST} hely`}
              </Text>
            </Pressable>
          ) : null}
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    borderWidth: 1,
    borderRadius: radius.m,
    padding: space.m,
    marginBottom: space.s,
  },
  ico: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  save: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
