import type { Ref } from 'react';
import { StyleSheet, Text, View, type HostInstance } from 'react-native';

import type { PlaceSummary } from '@/db/types';

/** A kártya mérete a képernyőn; mentéskor 1080×1350-re (Instagram 4:5) nagyítjuk */
export const CARD_W = 320;
export const CARD_H = 400;

const ACCENT = '#D9480F';
const ACCENT_DARK = '#A8360A';

/** A város a címből (pl. „Budapest, Király u. 8.” → „Budapest”), ha felismerhető */
function city(address: string | null) {
  if (!address) return null;
  const first = address.split(',')[0]?.trim();
  return first && !/\d/.test(first) ? first : null;
}

/**
 * Megosztókártya: egy kép, ami jól mutat Instagram/Facebook sztoriban és üzenetben is.
 * Szándékosan fix színekkel (nem a téma szerint), hogy mindenkinél egyforma legyen.
 */
export function ShareCard({ p, note, ref }: { p: PlaceSummary; note?: string | null; ref?: Ref<HostInstance> }) {
  const where = [p.cuisine, city(p.address)].filter(Boolean).join(' · ');
  const line =
    p.visit_count >= 3
      ? `Már ${p.visit_count}× jártam itt – és visszajárok.`
      : p.visit_count === 2
        ? 'Másodszor is jártam itt – megéri.'
        : 'Kipróbáltam – megéri!';

  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <View style={styles.top}>
        <Text style={styles.brand}>VISSZAJÁRÓ</Text>
        <View style={styles.pill}>
          <Text style={styles.pillText}>👍 Ajánlom</Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.emojiBox}>
          <Text style={{ fontSize: 44 }}>{p.emoji || '🍽️'}</Text>
        </View>
        <Text style={styles.name} numberOfLines={2}>
          {p.name}
        </Text>
        {where ? <Text style={styles.where}>{where}</Text> : null}
        <Text style={styles.line}>{line}</Text>
        {note ? (
          <Text style={styles.note} numberOfLines={3}>
            „{note.trim()}”
          </Text>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Hova menjünk ma? 🍽️ Visszajáró</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: CARD_W, height: CARD_H, backgroundColor: ACCENT, borderRadius: 24, overflow: 'hidden' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 18 },
  brand: { color: '#fff', opacity: 0.85, fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  pill: { backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  pillText: { color: ACCENT, fontWeight: '800', fontSize: 13 },
  body: { flex: 1, paddingHorizontal: 22, justifyContent: 'center' },
  emojiBox: {
    width: 76,
    height: 76,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  name: { color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: -0.6, lineHeight: 34 },
  where: { color: '#fff', opacity: 0.9, fontSize: 15, marginTop: 6 },
  line: { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 16 },
  note: { color: '#fff', opacity: 0.92, fontSize: 14, fontStyle: 'italic', marginTop: 10, lineHeight: 19 },
  footer: { backgroundColor: ACCENT_DARK, paddingVertical: 12, alignItems: 'center' },
  footerText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
