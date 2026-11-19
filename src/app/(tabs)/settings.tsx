import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { TrackingCard } from '@/components/tracking-card';
import { Button, Card, Screen, SectionTitle } from '@/components/ui';
import { useDataVersion } from '@/db/events';
import { getSetting, hasDemo, removeDemo, seedDemo, setSetting, wipeAll } from '@/db/repo';
import { PRO_ONLY, TEST_MODE } from '@/features';
import { ago } from '@/lib/format';
import { testGoogleKey } from '@/providers';
import { PROVIDER_HINTS, PROVIDER_LABELS, type ProviderMode } from '@/providers/types';
import { radius, space, useColors } from '@/theme';

const MODES: ProviderMode[] = ['osm', 'google', 'auto'];
const ENV_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY;

export default function SettingsScreen() {
  const c = useColors();
  const db = useSQLiteContext();
  const version = useDataVersion();
  const [mode, setMode] = useState<ProviderMode>('osm');
  const [demo, setDemo] = useState(false);
  const [lastImport, setLastImport] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [keyStatus, setKeyStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    getSetting(db, 'provider').then((v) => setMode((v as ProviderMode) || 'osm'));
    getSetting(db, 'google_api_key').then(setSavedKey);
    getSetting(db, 'last_import_at').then(setLastImport);
    hasDemo(db).then(setDemo);
  }, [db, version]);

  const activeKey = savedKey || ENV_KEY || null;

  const saveKey = async () => {
    const k = keyDraft.trim();
    if (!k) return;
    setTesting(true);
    setKeyStatus(null);
    try {
      const n = await testGoogleKey(k);
      await setSetting(db, 'google_api_key', k);
      setKeyDraft('');
      setKeyStatus({ ok: true, text: `A kulcs működik (${n} hely a Deák tér körül).` });
    } catch (e) {
      setKeyStatus({ ok: false, text: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const removeKey = () => {
    setSetting(db, 'google_api_key', null);
    setKeyStatus(null);
  };

  const confirmWipe = () =>
    Alert.alert('Minden adat törlése', 'Az összes hely, látogatás és értékelés törlődik erről a telefonról. Ez nem vonható vissza.', [
      { text: 'Mégse', style: 'cancel' },
      { text: 'Törlés', style: 'destructive', onPress: () => wipeAll(db) },
    ]);

  return (
    <Screen title="Beállítások">
      <SectionTitle title="Automatikus felismerés" hint="háttérben" />
      <TrackingCard />

      <SectionTitle title="Google Idővonal importálása" />
      <Card>
        <Text style={{ color: c.text }}>
          A régi éttermi látogatásaid betöltése a Google Térkép Idővonal exportjából (Timeline.json).
        </Text>
        {lastImport ? (
          <Text style={{ color: c.muted, fontSize: 12, marginTop: 4 }}>Utolsó importálás: {ago(lastImport)}</Text>
        ) : null}
        <Button label="⬇️  Importálás" onPress={() => router.push('/import')} style={{ marginTop: space.m }} />
      </Card>

      <SectionTitle title="Helyszolgáltató" hint="éttermek felismeréséhez" />
      <Card>
        {MODES.map((m, i) => {
          const on = mode === m;
          return (
            <Pressable
              key={m}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => setSetting(db, 'provider', m)}
              style={[styles.option, i > 0 && { borderTopWidth: 1, borderTopColor: c.line }]}>
              <View style={[styles.radio, { borderColor: on ? c.accent : c.line }]}>
                {on ? <View style={[styles.radioDot, { backgroundColor: c.accent }]} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontWeight: '700' }}>{PROVIDER_LABELS[m]}</Text>
                <Text style={{ color: c.muted, fontSize: 13 }}>{PROVIDER_HINTS[m]}</Text>
              </View>
            </Pressable>
          );
        })}
        {mode !== 'osm' && !activeKey ? (
          <Text style={{ color: c.bad, fontSize: 13, marginTop: space.s }}>
            {mode === 'google'
              ? 'A Google módhoz adj meg API-kulcsot lent.'
              : 'Kulcs nélkül az Automatikus mód csak az OpenStreetMap-et használja.'}
          </Text>
        ) : null}
      </Card>

      <SectionTitle title="Google Places API-kulcs" />
      <Card>
        {activeKey ? (
          <Text style={{ color: c.text, marginBottom: space.s }}>
            ✓ Kulcs beállítva: …{activeKey.slice(-4)}
            {!savedKey && ENV_KEY ? ' (a .env fájlból)' : ''}
          </Text>
        ) : (
          <Text style={{ color: c.muted, fontSize: 13, marginBottom: space.s }}>
            Google Cloud Console → új projekt → számlázás bekapcsolása → „Places API (New)” engedélyezése → Hitelesítő adatok → API-kulcs.
            Biztonság: korlátozd a kulcsot csak a Places API (New)-ra, és állíts be napi kvótát.
          </Text>
        )}
        <TextInput
          value={keyDraft}
          onChangeText={setKeyDraft}
          placeholder={activeKey ? 'Új kulcs beillesztése…' : 'API-kulcs beillesztése…'}
          placeholderTextColor={c.muted}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={[styles.input, { color: c.text, backgroundColor: c.bg, borderColor: c.line }]}
        />
        <View style={{ flexDirection: 'row', gap: space.s, marginTop: space.s }}>
          <Button
            label={testing ? 'Ellenőrzés…' : 'Mentés és teszt'}
            onPress={saveKey}
            disabled={!keyDraft.trim() || testing}
            style={{ flex: 1 }}
          />
          {savedKey ? <Button label="Kulcs törlése" kind="danger" onPress={removeKey} style={{ flex: 1 }} /> : null}
        </View>
        {keyStatus ? (
          <Text style={{ color: keyStatus.ok ? c.good : c.bad, fontSize: 13, marginTop: space.s }}>{keyStatus.text}</Text>
        ) : null}
        <Text style={{ color: c.muted, fontSize: 12, marginTop: space.s }}>
          A kulcs csak ezen a telefonon tárolódik. Költség: havonta 5 000 lekérdezés ingyenes, felette kb. 17–32 USD / 1 000.
        </Text>
      </Card>

      <SectionTitle title="Pro funkciók" hint={TEST_MODE ? 'teszt módban mind elérhető' : undefined} />
      <Card>
        {Object.values(PRO_ONLY).map((label) => (
          <Text key={label} style={{ color: c.text, paddingVertical: 3 }}>
            {TEST_MODE ? '✓' : '🔒'}  {label}
          </Text>
        ))}
      </Card>

      <SectionTitle title="Adatok" />
      <Card>
        <Text style={{ color: c.muted, fontSize: 13, marginBottom: space.m }}>
          Minden adat csak ezen a telefonon tárolódik.
        </Text>
        {demo ? (
          <Button label="Demó adatok eltávolítása" kind="soft" onPress={() => removeDemo(db)} />
        ) : (
          <Button label="Demó adatok betöltése" kind="soft" onPress={() => seedDemo(db)} />
        )}
        <Button label="Minden adat törlése" kind="danger" onPress={confirmWipe} style={{ marginTop: space.s }} />
      </Card>

      <Text style={{ color: c.muted, fontSize: 12, textAlign: 'center', marginTop: space.l }}>
        Visszajáró {Constants.expoConfig?.version ?? ''} · saját teszt verzió
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: radius.s },
  input: { borderWidth: 1, borderRadius: radius.m, paddingHorizontal: space.m, paddingVertical: 10, fontSize: 15 },
});
