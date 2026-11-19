import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { setRating } from '@/db/repo';
import type { PlaceSummary } from '@/db/types';
import { ago, distanceM, fmtDist } from '@/lib/format';
import type { Here } from '@/lib/recommend';
import { radius, space, useColors } from '@/theme';

export function PlaceRow({ p, here, quickRate }: { p: PlaceSummary; here?: Here | null; quickRate?: boolean }) {
  const c = useColors();
  const db = useSQLiteContext();
  const sub = [p.cuisine, here ? fmtDist(distanceM(here.lat, here.lon, p.lat, p.lon)) : null].filter(Boolean).join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${p.name}, ${p.visit_count} látogatás`}
      onPress={() => router.push({ pathname: '/place/[id]', params: { id: p.id } })}
      style={({ pressed }) => [styles.row, { backgroundColor: c.card, borderColor: pressed ? c.accent : c.line }]}>
      <View style={[styles.ico, { backgroundColor: c.accentSoft }]}>
        <Text style={{ fontSize: 22 }}>{p.emoji || '🍽️'}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[styles.name, { color: c.text }]}>
          {p.name}
        </Text>
        {sub ? (
          <Text numberOfLines={1} style={[styles.sub, { color: c.muted }]}>
            {sub}
          </Text>
        ) : null}
        <Text numberOfLines={1} style={[styles.sub, { color: c.muted }]}>
          {p.visit_count ? `Utoljára ${ago(p.last_visit)} · ${p.visit_count}× jártál itt` : '🔖 Kipróbálnám – még nem jártál itt'}
        </Text>
      </View>
      {quickRate && !p.rating ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {(['up', 'down'] as const).map((v) => (
            <Pressable
              key={v}
              accessibilityRole="button"
              accessibilityLabel={v === 'up' ? 'Tetszett' : 'Nem tetszett'}
              hitSlop={6}
              onPress={() => setRating(db, p.id, v)}
              style={[styles.quick, { borderColor: c.line, backgroundColor: c.bg }]}>
              <Text style={{ fontSize: 16 }}>{v === 'up' ? '👍' : '👎'}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <View
          style={[
            styles.badge,
            { backgroundColor: p.rating === 'up' ? c.goodSoft : p.rating === 'down' ? c.badSoft : c.line },
          ]}>
          <Text style={{ fontSize: 14, color: c.muted, fontWeight: '700' }}>
            {p.rating === 'up' ? '👍' : p.rating === 'down' ? '👎' : p.visit_count ? '?' : '🔖'}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    borderWidth: 1,
    borderRadius: radius.l,
    paddingVertical: 10,
    paddingHorizontal: space.m,
    marginBottom: space.s,
  },
  ico: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 16, fontWeight: '700' },
  sub: { fontSize: 13 },
  badge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  quick: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
