// A háttér-helyfigyelés feladatát az app legelején definiálni kell
import '@/tracking/task';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

import { migrate } from '@/db/migrations';
import { seedOnFirstRun } from '@/db/repo';
import { TrackingBridge } from '@/tracking/bridge';
import { useColors } from '@/theme';

async function initDb(db: SQLiteDatabase) {
  await migrate(db);
  await seedOnFirstRun(db);
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const c = useColors();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: { ...base.colors, primary: c.accent, background: c.bg, card: c.bg, text: c.text, border: c.line },
  };

  return (
    <SQLiteProvider databaseName="visszajaro.db" onInit={initDb}>
      <ThemeProvider value={theme}>
        <StatusBar style="auto" />
        <TrackingBridge />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="place/[id]" options={{ title: '', headerBackTitle: 'Vissza' }} />
          <Stack.Screen name="import" options={{ title: 'Idővonal importálása', headerBackTitle: 'Vissza' }} />
          <Stack.Screen name="share/[id]" options={{ title: 'Megosztás', headerBackTitle: 'Vissza', presentation: 'modal' }} />
        </Stack>
      </ThemeProvider>
    </SQLiteProvider>
  );
}
