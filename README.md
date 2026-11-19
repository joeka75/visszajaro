# Visszajáró – mobilapp (Android + iOS)

Expo (SDK 58) + React Native + TypeScript. A terv: [docs/ARCHITEKTURA.md](docs/ARCHITEKTURA.md), a koncepció: [docs/KONCEPCIO.md](docs/KONCEPCIO.md), a korai böngészős prototípus: [docs/prototipus/index.html](docs/prototipus/index.html).

## Indítás a saját telefonodon (Android)

1. Telepítsd a telefonra a **Expo Go** appot a Play Áruházból.
2. A gépen, ebben a mappában:
   ```bash
   npm install
   npx expo start
   ```
3. A telefon és a gép **ugyanazon a Wi-Fi-n** legyen. Az Expo Go-ban olvasd be a terminálban megjelenő QR-kódot.

Emulátoron: indítsd el az Android Studio emulátort, majd `npx expo start --android`.

## Fejlesztői build (M3-tól kötelező)

A háttér-helyfigyelés és az értesítés-gombok az Expo Go-ban nem működnek, ezért saját fejlesztői build kell.

1. A telefonon: Fejlesztői beállítások → **USB-hibakeresés** be; USB-kábellel a géphez; „Engedélyezed az USB-hibakeresést?” → Engedélyezés.
2. A gépen (egyszer, ill. ha natív csomag vagy app.json változik):
   ```bash
   npx expo run:android --device
   ```
   Ehhez kell: JAVA_HOME = Android Studio JBR (`C:\Program Files\Android\Android Studio\jbr`), ANDROID_HOME = `%LOCALAPPDATA%\Android\Sdk`.
3. Utána a napi fejlesztéshez elég a JS-szerver: `npx expo start --dev-client`, és a telefonon a **Visszajáró** ikon (nem az Expo Go).
   USB-n: `adb reverse tcp:8081 tcp:8081`, vagy ugyanazon a Wi-Fi-n a szerver címét kell megadni.

Az `android/` és `ios/` mappát a build generálja (nincs Gitben); natív beállítás csak az `app.json`-ban legyen.

## Automatikus felismerés (M3)

Beállítások → Automatikus felismerés → Bekapcsolás → hely: „Mindig engedélyezés”, értesítések: engedélyezés.
Samsungon: Beállítások → Alkalmazások → Visszajáró → Akkumulátor → „Nem korlátozott”, különben a rendszer leállítja a háttérben.
Működés: `src/tracking/` – `dwell.ts` (megállás-felismerő, tesztje: `scripts/test-dwell.ts`), `task.ts` (háttérfeladat),
`engine.ts` (megállás → étterem → látogatás → értesítés), `bridge.tsx` (értesítés gombjai).
A Beállításokban a „Napló (teszteléshez)” mutatja, mit érzékelt.

## Ellenőrzés

```bash
npm run typecheck
npx eslint src
npm test            # Idővonal-feldolgozó és megállás-felismerő tesztjei
```

## Google Places API-kulcs

Az appban: Beállítások → Google Places API-kulcs → beillesztés → „Mentés és teszt”.
Alternatíva fejlesztéshez: `.env` fájl ebben a mappában ezzel a sorral: `EXPO_PUBLIC_GOOGLE_PLACES_KEY=...` (a `.env` ne kerüljön Gitbe).

## Felépítés

```
src/app/                 képernyők (expo-router)
  (tabs)/index.tsx       Hova ma?
  (tabs)/places.tsx      Helyeim
  (tabs)/settings.tsx    Beállítások
  place/[id].tsx         Részletek, értékelés, jegyzet, látogatások
src/db/                  SQLite séma (migrations.ts), lekérdezések (repo.ts)
src/lib/                 formázás, ajánló logika, adat-hookok
src/providers/           helyszolgáltató felület (Google / OSM)
src/import/              Google Idővonal import
src/tracking/            háttér-helyfigyelés, automatikus felismerés (M3)
src/features.ts          Pro funkciók kapcsolói
```

Az adatbázis-séma módosításakor **új migrációt** adj a `src/db/migrations.ts` tömb végére, a régieket ne írd át.

## Azonosítók

Android csomagnév és iOS bundle ID: `hu.visszajaro.app` (`app.json`). Az első Play Áruházas feltöltés után a csomagnév már nem változtatható – addig átírható.
