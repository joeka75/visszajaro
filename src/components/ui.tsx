import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, space, useColors } from '@/theme';

/** Görgethető képernyő, biztonságos margókkal (értesítési sáv, alsó fülsor) */
export function Screen({
  children,
  title,
  subtitle,
  hasHeader,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  /** A képernyőnek saját fejléce van (Stack) – ilyenkor nem kell felső biztonsági margó */
  hasHeader?: boolean;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{
        padding: space.l,
        paddingTop: (hasHeader ? 0 : insets.top) + space.l,
        paddingBottom: insets.bottom + (hasHeader ? space.xl : 96),
      }}
      keyboardShouldPersistTaps="handled">
      {title ? <Text style={[styles.h1, { color: c.text }]}>{title}</Text> : null}
      {subtitle ? <Text style={{ color: c.muted, marginBottom: space.m }}>{subtitle}</Text> : null}
      {children}
    </ScrollView>
  );
}

export function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  const c = useColors();
  return (
    <View style={styles.sectionTitle}>
      <Text style={[styles.h3, { color: c.text }]}>{title}</Text>
      {hint ? <Text style={{ color: c.muted, fontSize: 13 }}>{hint}</Text> : null}
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  const c = useColors();
  return (
    <View style={[styles.empty, { borderColor: c.line }]}>
      <Text style={{ color: c.muted, textAlign: 'center' }}>{text}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line }, style]}>{children}</View>;
}

type BtnKind = 'primary' | 'soft' | 'danger';
export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: BtnKind;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const bg = kind === 'primary' ? c.accent : kind === 'soft' ? c.accentSoft : c.badSoft;
  const fg = kind === 'primary' ? c.accentText : kind === 'soft' ? c.accent : c.bad;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.btn, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }, style]}>
      <Text style={{ color: fg, fontWeight: '700', fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.chip, { borderColor: on ? c.text : c.line, backgroundColor: on ? c.text : c.card }]}>
      <Text style={{ color: on ? c.bg : c.text, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  h1: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginBottom: space.xs },
  h3: { fontSize: 16, fontWeight: '700' },
  sectionTitle: { flexDirection: 'row', alignItems: 'baseline', gap: space.s, marginTop: space.xl, marginBottom: space.s },
  empty: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: radius.l, padding: space.l },
  card: { borderWidth: 1, borderRadius: radius.l, padding: space.l, marginBottom: space.m },
  btn: { borderRadius: radius.m, paddingVertical: 12, paddingHorizontal: space.l, alignItems: 'center', justifyContent: 'center' },
  chip: { borderWidth: 1, borderRadius: 99, paddingVertical: 6, paddingHorizontal: 12 },
});
