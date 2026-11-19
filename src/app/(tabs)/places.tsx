import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { PlaceRow } from '@/components/place-row';
import { Chip, Empty, Screen } from '@/components/ui';
import { useHere, usePlaces } from '@/lib/hooks';
import { filterAndSort, visible, type ListFilter, type ListSort } from '@/lib/recommend';
import { radius, space, useColors } from '@/theme';

const FILTERS: [ListFilter, string][] = [
  ['all', 'Mind'],
  ['up', '👍 Tetszett'],
  ['down', '👎 Nem tetszett'],
  ['none', 'Értékeletlen'],
  ['hidden', 'Rejtett'],
];

export default function PlacesScreen() {
  const c = useColors();
  const { data: places, loaded } = usePlaces();
  const here = useHere();
  const [q, setQ] = useState('');
  const [f, setF] = useState<ListFilter>('all');
  const [sort, setSort] = useState<ListSort>('recent');

  const vis = visible(places);
  const up = vis.filter((p) => p.rating === 'up').length;
  const down = vis.filter((p) => p.rating === 'down').length;
  const visits = vis.reduce((a, p) => a + p.visit_count, 0);
  const items = filterAndSort(places, f, sort, q, here);

  const sorts: [ListSort, string][] = [
    ['recent', 'Legutóbbi'],
    ['count', 'Leggyakoribb'],
    ['name', 'Név'],
    ...(here ? ([['dist', 'Legközelebbi']] as [ListSort, string][]) : []),
  ];

  return (
    <Screen title="Helyeim">
      <View style={styles.stats}>
        {[
          [String(vis.length), 'hely'],
          [String(visits), 'látogatás'],
          [`${up} / ${down}`, '👍 / 👎'],
        ].map(([v, l]) => (
          <View key={l} style={[styles.stat, { backgroundColor: c.card, borderColor: c.line }]}>
            <Text style={{ color: c.text, fontSize: 20, fontWeight: '800' }}>{v}</Text>
            <Text style={{ color: c.muted, fontSize: 12 }}>{l}</Text>
          </View>
        ))}
      </View>

      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Keresés név, konyha vagy cím szerint…"
        placeholderTextColor={c.muted}
        clearButtonMode="while-editing"
        style={[styles.search, { color: c.text, backgroundColor: c.card, borderColor: c.line }]}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {FILTERS.map(([k, l]) => (
          <Chip key={k} label={l} on={f === k} onPress={() => setF(k)} />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips, { marginTop: 0 }]}>
        <Text style={{ color: c.muted, fontSize: 13, alignSelf: 'center' }}>Rendezés:</Text>
        {sorts.map(([k, l]) => (
          <Chip key={k} label={l} on={sort === k} onPress={() => setSort(k)} />
        ))}
      </ScrollView>

      {items.length ? (
        items.map((p) => <PlaceRow key={p.id} p={p} here={here} />)
      ) : (
        <Empty text={loaded ? 'Nincs találat.' : 'Betöltés…'} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: space.s, marginVertical: space.m },
  stat: { flex: 1, borderWidth: 1, borderRadius: radius.m, paddingVertical: space.s, paddingHorizontal: space.m },
  search: { borderWidth: 1, borderRadius: radius.m, paddingHorizontal: space.m, paddingVertical: 10, fontSize: 15 },
  chips: { gap: 6, marginVertical: space.m },
});
