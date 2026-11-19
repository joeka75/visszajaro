import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Button, Card, Screen } from '@/components/ui';
import { hasDemo } from '@/db/repo';
import { hasFeature } from '@/features';
import { runImport, type ImportResult } from '@/import/run';
import { sampleTimeline } from '@/import/sample';
import { prepareImport, TimelineFormatError, type PreparedImport } from '@/import/timeline';
import { fmtDay } from '@/lib/format';
import { getProviderSettings, type ProviderSettings } from '@/providers';
import { PROVIDER_LABELS } from '@/providers/types';
import { radius, space, useColors } from '@/theme';

type Phase =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'ready'; prepared: PreparedImport; label: string }
  | { kind: 'running'; prepared: PreparedImport; done: number; total: number }
  | { kind: 'done'; result: ImportResult }
  | { kind: 'error'; message: string; prepared?: PreparedImport; label?: string };

const FREE_MONTHS = 3;

export default function ImportScreen() {
  const c = useColors();
  const db = useSQLiteContext();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [settings, setSettings] = useState<ProviderSettings | null>(null);
  const [demo, setDemo] = useState(false);
  const [dropDemo, setDropDemo] = useState(true);
  const cancelled = useRef(false);

  useEffect(() => {
    getProviderSettings(db).then(setSettings);
    hasDemo(db).then(setDemo);
  }, [db]);

  const fullHistory = hasFeature('timelineImportFull');
  const since = () => {
    if (fullHistory) return null;
    const d = new Date();
    d.setMonth(d.getMonth() - FREE_MONTHS);
    return d;
  };

  const prepare = (jsons: unknown[], label: string) => {
    try {
      setPhase({ kind: 'ready', prepared: prepareImport(jsons, since()), label });
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof TimelineFormatError ? e.message : `Hiba a feldolgozáskor: ${(e as Error).message}` });
    }
  };

  const pickFiles = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true });
    if (res.canceled) return;
    setPhase({ kind: 'reading' });
    try {
      const jsons: unknown[] = [];
      for (const a of res.assets) jsons.push(JSON.parse(await new File(a.uri).text()));
      prepare(jsons, res.assets.length === 1 ? res.assets[0].name : `${res.assets.length} fájl`);
    } catch (e) {
      setPhase({
        kind: 'error',
        message: e instanceof SyntaxError ? 'A kiválasztott fájl nem érvényes JSON.' : `Nem sikerült beolvasni: ${(e as Error).message}`,
      });
    }
  };

  const start = async (prepared: PreparedImport, label: string) => {
    if (!settings) return;
    cancelled.current = false;
    setPhase({ kind: 'running', prepared, done: 0, total: prepared.groups.length });
    try {
      const result = await runImport(db, prepared, settings, {
        dropDemo: demo && dropDemo,
        onProgress: (done, total) => setPhase({ kind: 'running', prepared, done, total }),
        isCancelled: () => cancelled.current,
      });
      setPhase({ kind: 'done', result });
    } catch (e) {
      setPhase({ kind: 'error', message: (e as Error).message, prepared, label });
    }
  };

  const usesGoogle = settings && settings.mode !== 'osm' && !!settings.googleKey;

  return (
    <Screen hasHeader>
      <Text style={{ color: c.muted, marginBottom: space.m }}>
        Töltsd be a Google Térkép Idővonal exportodat – az app kikeresi belőle, melyik vendéglátóhelyen jártál.
      </Text>

      <Card>
        <Text style={[styles.h4, { color: c.text }]}>1. Exportáld az Idővonalat</Text>
        <Text style={[styles.p, { color: c.text }]}>
          <Text style={styles.b}>Android: </Text>Google Térkép → profilkép (jobb felül) → Idővonal → ⋮ (jobb felül) → Hely- és adatvédelmi
          beállítások → Idővonal-adatok exportálása → mentsd el a Timeline.json-t.
        </Text>
        <Text style={[styles.p, { color: c.muted, fontSize: 13 }]}>
          Ha nem találod: a telefon Beállításaiban keress rá az „Idővonal” szóra – a menü helye gyártónként eltér.
        </Text>
        <Text style={[styles.p, { color: c.text }]}>
          <Text style={styles.b}>iPhone: </Text>Google Térkép → profilkép → Idővonal → ⋯ → Beállítások → Idővonal-adatok exportálása.
        </Text>
        <Text style={[styles.p, { color: c.text }]}>
          <Text style={styles.b}>Régi Takeout: </Text>a Semantic Location History mappa havi JSON fájljai (többet is kiválaszthatsz).
        </Text>
      </Card>

      <Card>
        <Text style={[styles.h4, { color: c.text }]}>2. Válaszd ki a fájlt</Text>
        <Button label="📂  Fájl kiválasztása" onPress={pickFiles} disabled={phase.kind === 'running' || phase.kind === 'reading'} />
        <Pressable
          accessibilityRole="button"
          disabled={phase.kind === 'running'}
          onPress={() => prepare([sampleTimeline()], 'Minta-idővonal (9 megállás Budapesten)')}
          style={{ marginTop: space.m }}>
          <Text style={{ color: c.accent, fontWeight: '600' }}>Nincs kéznél? Próbáld ki egy minta-idővonallal</Text>
        </Pressable>
        {!fullHistory ? (
          <Text style={{ color: c.muted, fontSize: 12, marginTop: space.s }}>
            Ingyenes verzió: az utolsó {FREE_MONTHS} hónap kerül be. A teljes múlt Pro funkció.
          </Text>
        ) : null}
      </Card>

      {phase.kind === 'reading' ? <Text style={{ color: c.muted }}>Fájl beolvasása…</Text> : null}

      {phase.kind === 'error' ? (
        <Card style={{ borderColor: c.bad }}>
          <Text style={{ color: c.bad, fontWeight: '700' }}>{phase.message}</Text>
          {phase.prepared ? (
            <Button label="Újrapróbálom" kind="soft" onPress={() => start(phase.prepared!, phase.label ?? '')} style={{ marginTop: space.m }} />
          ) : null}
        </Card>
      ) : null}

      {phase.kind === 'ready' || phase.kind === 'running' ? (
        <Card>
          <Text style={[styles.h4, { color: c.text }]}>3. Megállások</Text>
          {phase.kind === 'ready' ? <Text style={{ color: c.muted, marginBottom: space.s }}>{phase.label}</Text> : null}
          <Summary p={phase.prepared} />

          {phase.kind === 'ready' ? (
            <>
              <View style={[styles.note, { backgroundColor: c.accentSoft }]}>
                <Text style={{ color: c.text, fontSize: 13 }}>
                  🔒 A felismeréshez a megállások <Text style={styles.b}>koordinátáit</Text> elküldöm a(z){' '}
                  {settings ? PROVIDER_LABELS[settings.mode] : ''} szolgáltatónak
                  {settings?.mode === 'auto' ? (settings.googleKey ? ' (OSM, szükség esetén Google)' : ' (kulcs nélkül csak OSM)') : ''}. Időpontok és
                  egyéb adatok nem mennek ki.
                </Text>
                {usesGoogle ? (
                  <Text style={{ color: c.muted, fontSize: 12, marginTop: 6 }}>
                    Google: legfeljebb {phase.prepared.groups.length} lekérdezés. A már ismert helyeket nem kérdezi le újra.
                  </Text>
                ) : null}
              </View>
              {demo ? (
                <View style={styles.switchRow}>
                  <Text style={{ color: c.text, flex: 1 }}>A demó adatokat töröljem az importáláskor</Text>
                  <Switch value={dropDemo} onValueChange={setDropDemo} trackColor={{ true: c.accentSoft, false: c.line }} thumbColor={dropDemo ? c.accent : c.muted} />
                </View>
              ) : null}
              <Button
                label="🍽️  Éttermek felismerése"
                onPress={() => start(phase.prepared, phase.label)}
                disabled={!phase.prepared.groups.length || !settings}
              />
            </>
          ) : (
            <>
              <View style={[styles.bar, { backgroundColor: c.line }]}>
                <View
                  style={[
                    styles.barFill,
                    { backgroundColor: c.accent, width: `${phase.total ? Math.round((phase.done / phase.total) * 100) : 0}%` },
                  ]}
                />
              </View>
              <Text style={{ color: c.muted, fontSize: 13 }}>
                {phase.done} / {phase.total} hely ellenőrizve… (az ingyenes OSM szerver lassú lehet)
              </Text>
              <Button label="Mégse" kind="soft" onPress={() => (cancelled.current = true)} style={{ marginTop: space.m }} />
            </>
          )}
        </Card>
      ) : null}

      {phase.kind === 'done' ? (
        <Card style={{ borderColor: c.good }}>
          <Text style={{ color: c.good, fontWeight: '800', fontSize: 16 }}>
            ✔ {phase.result.newPlaces} új vendéglátóhely, {phase.result.newVisits} látogatás hozzáadva
          </Text>
          <Text style={{ color: c.muted, marginTop: 6 }}>
            Összesen {phase.result.matchedPlaces} helyet ismertem fel. {phase.result.noMatch} megállási helyen nem volt étterem 60 méteren belül
            (bolt, edzőterem, ismerős lakása stb.).
            {phase.result.cancelled ? ' Az importálást megszakítottad, az addig felismert helyek bekerültek.' : ''}
          </Text>
          <Button label="Megnézem a helyeimet" onPress={() => router.navigate('/places')} style={{ marginTop: space.m }} />
        </Card>
      ) : null}
    </Screen>
  );
}

function Summary({ p }: { p: PreparedImport }) {
  const c = useColors();
  const row = (label: string, value: string | number, strong = false) => (
    <View style={styles.sumRow}>
      <Text style={{ color: c.muted, flex: 1 }}>{label}</Text>
      <Text style={{ color: c.text, fontWeight: strong ? '800' : '600' }}>{value}</Text>
    </View>
  );
  return (
    <View style={{ marginBottom: space.m }}>
      {row('Összes megállás', p.stopsTotal)}
      {row('Otthon / munkahely (kihagyva)', p.excludedHomeWork)}
      {row('20 percnél rövidebb vagy 4 óránál hosszabb', p.excludedDuration)}
      {p.excludedTooOld ? row(`${FREE_MONTHS} hónapnál régebbi`, p.excludedTooOld) : null}
      {row('Megmaradt megállás', p.kept, true)}
      {row('Különböző hely', p.groups.length, true)}
      {p.firstDate && p.lastDate ? (
        <Text style={{ color: c.muted, fontSize: 12, marginTop: 4 }}>
          {fmtDay(p.firstDate)} – {fmtDay(p.lastDate)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  h4: { fontSize: 16, fontWeight: '700', marginBottom: space.s },
  p: { marginBottom: 6, lineHeight: 20 },
  b: { fontWeight: '700' },
  note: { borderRadius: radius.m, padding: space.m, marginBottom: space.m },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.s, marginBottom: space.m },
  sumRow: { flexDirection: 'row', paddingVertical: 3 },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: space.s },
  barFill: { height: '100%' },
});
