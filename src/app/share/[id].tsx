import * as Sharing from 'expo-sharing';
import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View, type HostInstance } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { ShareCard } from '@/components/share-card';
import { Button, Empty, Screen } from '@/components/ui';
import { logShare } from '@/db/places';
import { usePlace } from '@/lib/hooks';
import { space, useColors } from '@/theme';

/** Megosztókártya előnézet + megosztás (Instagram, Facebook, Messenger, Viber… – a telefon megosztó menüje) */
export default function ShareScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const db = useSQLiteContext();
  const { data: p, loaded } = usePlace(id);
  const card = useRef<HostInstance>(null);
  const [withNote, setWithNote] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!p) {
    return (
      <Screen hasHeader>
        <Empty text={loaded ? 'A hely nem található.' : 'Betöltés…'} />
      </Screen>
    );
  }

  const share = async () => {
    setBusy(true);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Nem elérhető', 'Ezen az eszközön nem lehet megosztani.');
        return;
      }
      const uri = await captureRef(card, { format: 'png', result: 'tmpfile', width: 1080, height: 1350 });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Ajánld a barátaidnak' });
      await logShare(db, p.id, 'system');
    } catch (e) {
      Alert.alert('Nem sikerült a megosztás', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen hasHeader>
      <Text style={{ color: c.muted, marginBottom: space.m }}>
        Így fog kinézni. A telefon megosztó menüjében választhatsz: Instagram sztori, Facebook, Messenger, Viber, WhatsApp…
      </Text>

      <View style={styles.center}>
        <ShareCard ref={card} p={p} note={withNote ? p.note : null} />
      </View>

      {p.note?.trim() ? (
        <View style={styles.switchRow}>
          <Text style={{ color: c.text, flex: 1 }}>A jegyzetem is legyen rajta</Text>
          <Switch
            value={withNote}
            onValueChange={setWithNote}
            trackColor={{ true: c.accentSoft, false: c.line }}
            thumbColor={withNote ? c.accent : c.muted}
          />
        </View>
      ) : null}

      <Button label={busy ? 'Készül…' : '📤  Megosztás'} onPress={share} disabled={busy} style={{ marginTop: space.m }} />
      <Text style={{ color: c.muted, fontSize: 12, marginTop: space.s, textAlign: 'center' }}>
        A kártyán nincs rajta, mikor jártál ott, és a helyzeted sem.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.s, marginTop: space.m },
});
