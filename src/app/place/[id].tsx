import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, Empty, Screen, SectionTitle } from '@/components/ui';
import { setHidden, setNote, setRating } from '@/db/repo';
import { ago, distanceM, fmtDay, fmtDist, fmtTime, minutesBetween } from '@/lib/format';
import { useHere, usePlace, useVisits } from '@/lib/hooks';
import { radius, space, useColors } from '@/theme';

export default function PlaceScreen() {
  const { id, pick } = useLocalSearchParams<{ id: string; pick?: string }>();
  const c = useColors();
  const db = useSQLiteContext();
  const { data: p, loaded } = usePlace(id);
  const { data: visits } = useVisits(id);
  const here = useHere();

  // Jegyzet: helyi állapot, mentés gépelés után kis késleltetéssel
  const [note, setNoteText] = useState('');
  const noteLoadedFor = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (p && noteLoadedFor.current !== p.id) {
      noteLoadedFor.current = p.id;
      setNoteText(p.note ?? '');
    }
  }, [p]);
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);
  const onNote = (t: string) => {
    setNoteText(t);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setNote(db, id, t), 600);
  };

  if (!p) {
    return (
      <Screen hasHeader>
        <Empty text={loaded ? 'A hely nem található.' : 'Betöltés…'} />
      </Screen>
    );
  }

  const dist = here ? distanceM(here.lat, here.lon, p.lat, p.lon) : null;
  const rate = (v: 'up' | 'down') => setRating(db, p.id, p.rating === v ? null : v);
  const openDirections = () =>
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`);
  const openMaps = () =>
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name} ${p.address ?? ''}`)}`,
    );
  const toggleHidden = () => {
    if (p.hidden) {
      setHidden(db, p.id, false);
      return;
    }
    Alert.alert('Elrejted?', `A(z) „${p.name}” nem jelenik meg többet a listákban. A Helyeim → Rejtett szűrőnél visszaállíthatod.`, [
      { text: 'Mégse', style: 'cancel' },
      {
        text: 'Elrejtés',
        style: 'destructive',
        onPress: async () => {
          await setHidden(db, p.id, true);
          router.back();
        },
      },
    ]);
  };

  return (
    <Screen hasHeader>
      <Stack.Screen options={{ title: p.name }} />

      <View style={[styles.bigIco, { backgroundColor: c.accentSoft }]}>
        <Text style={{ fontSize: 36 }}>{p.emoji || '🍽️'}</Text>
      </View>
      <Text style={[styles.title, { color: c.text }]}>{p.name}</Text>
      <Text style={{ color: c.muted }}>{[p.cuisine, p.address].filter(Boolean).join(' · ')}</Text>
      {dist != null ? <Text style={{ color: c.muted, fontSize: 13, marginTop: 2 }}>📍 {fmtDist(dist)} innen</Text> : null}

      {pick ? (
        <View style={[styles.banner, { backgroundColor: c.accentSoft }]}>
          <Text style={{ color: c.accent, fontWeight: '700' }}>
            🎲 Ma ezt ajánlom! Utoljára {ago(p.last_visit)} jártál itt.
          </Text>
        </View>
      ) : null}

      <View style={styles.seg}>
        {(['up', 'down'] as const).map((v) => {
          const on = p.rating === v;
          const col = v === 'up' ? c.good : c.bad;
          const soft = v === 'up' ? c.goodSoft : c.badSoft;
          return (
            <Pressable
              key={v}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => rate(v)}
              style={[styles.segBtn, { borderColor: on ? col : c.line, backgroundColor: on ? soft : c.card }]}>
              <Text style={{ color: on ? col : c.text, fontWeight: '700', fontSize: 15 }}>
                {v === 'up' ? '👍  Tetszett' : '👎  Nem tetszett'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.label, { color: c.muted }]}>Jegyzet magadnak</Text>
      <TextInput
        value={note}
        onChangeText={onNote}
        onBlur={() => setNote(db, id, note)}
        multiline
        placeholder="Mit ettél? Mit rendelnél újra, mit ne?"
        placeholderTextColor={c.muted}
        style={[styles.note, { color: c.text, backgroundColor: c.card, borderColor: c.line }]}
      />

      <View style={styles.actions}>
        <Button label="🧭  Útvonal" onPress={openDirections} style={{ flex: 1 }} />
        <Button label="Google Térkép" kind="soft" onPress={openMaps} style={{ flex: 1 }} />
      </View>
      {p.phone ? (
        <Button label={`📞  ${p.phone}`} kind="soft" onPress={() => Linking.openURL(`tel:${p.phone}`)} style={{ marginTop: space.s }} />
      ) : null}

      <SectionTitle title="Látogatások" hint={`${visits.length} alkalom`} />
      <Card style={{ padding: 0 }}>
        {visits.map((v, i) => (
          <View key={v.id} style={[styles.visit, i > 0 && { borderTopWidth: 1, borderTopColor: c.line }]}>
            <Text style={{ color: c.text, fontWeight: '600', flexShrink: 1 }}>{fmtDay(v.start_at)}</Text>
            <Text style={{ color: c.muted }}>
              {fmtTime(v.start_at)}–{fmtTime(v.end_at)} · {minutesBetween(v.start_at, v.end_at)} p
            </Text>
          </View>
        ))}
      </Card>

      <Pressable accessibilityRole="button" onPress={toggleHidden} style={{ marginTop: space.l }}>
        <Text style={{ color: p.hidden ? c.accent : c.bad, fontWeight: '600' }}>
          {p.hidden ? 'Visszaállítás a listákba' : 'Ez nem étterem / ne mutasd többet'}
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bigIco: { width: 68, height: 68, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: space.s },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.4 },
  banner: { marginTop: space.m, borderRadius: radius.m, padding: space.m },
  seg: { flexDirection: 'row', gap: space.s, marginVertical: space.l },
  segBtn: { flex: 1, borderWidth: 1.5, borderRadius: radius.m, paddingVertical: 14, alignItems: 'center' },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  note: { borderWidth: 1, borderRadius: radius.m, padding: space.m, minHeight: 80, textAlignVertical: 'top', fontSize: 15 },
  actions: { flexDirection: 'row', gap: space.s, marginTop: space.m },
  visit: { flexDirection: 'row', justifyContent: 'space-between', gap: space.s, paddingVertical: 10, paddingHorizontal: space.m },
});
