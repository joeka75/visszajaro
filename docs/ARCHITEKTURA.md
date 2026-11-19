# Visszajáró – technikai terv

> Állapot: 2026-11-19 · a [KONCEPCIO.md](KONCEPCIO.md) 12. pontjában rögzített döntésekre épül
> Elv: **saját tesztként indul, de minden úgy készül, hogy átírás nélkül üzleti termék lehessen.**

---

## 1. Áttekintés

```
┌──────────────────────── Telefon (Android + iOS, egy kódbázis) ────────────────────────┐
│                                                                                       │
│  Háttér-helyfigyelés ──► Megálló-felismerő ──► Helyszolgáltató ──► Helyi adatbázis   │
│  (expo-location)         (20 perc – 4 óra)     ┌ Google Places ┐   (SQLite)          │
│                                                └ OpenStreetMap ┘        │             │
│  Google Idővonal import ───────────────────────────┘                    │             │
│                                                                         ▼             │
│              Képernyők: Hova ma? · Helyeim · Részletek · Megosztás · Beállítások      │
└───────────────────────────────────────────┬───────────────────────────────────────────┘
                                            │ később, opt-in (2. fázis)
                                            ▼
                      Felhő (Supabase): fiók, szinkron, Google-kulcs proxy,
                      éttermi irányítópult, kampányok, kuponok
```

## 2. Technológia

| Terület | Választás | Miért |
|---|---|---|
| Keretrendszer | **React Native + Expo**, TypeScript | Egy kód Androidra és iOS-re. iOS fordítás **Mac nélkül** a felhőben (EAS Build). |
| Navigáció | expo-router | Fájl alapú képernyők, mélylinkek (megosztáshoz) beépítve. |
| Helyi adatbázis | expo-sqlite, saját migrációkkal (`src/db/migrations.ts`) | Egyszerű, nincs extra függőség; a séma később változtatás nélkül átvihető Postgresbe. |
| Helymeghatározás | expo-location + expo-task-manager | Háttérben futó helyfigyelés mindkét platformon. |
| Értesítések | expo-notifications | „Milyen volt a Pöttyös Bisztró?” evés után. |
| Import | expo-document-picker | Google Idővonal `Timeline.json` betöltése. |
| Megosztás | react-native-view-shot + expo-sharing | Megosztókártya képként, bármelyik közösségi appba. |
| Állapotkezelés | Zustand | Egyszerű, kevés kód. |
| Felhő (2. fázis) | Supabase (Postgres, Auth, Edge Functions) | Az éttermi kimutatások SQL-lel könnyen előállnak, és van ingyenes keret. |
| Előfizetés (2. fázis) | RevenueCat | Egy rendszer kezeli a Google Play és App Store előfizetéseit. |

## 3. Látogatás-felismerés

1. **Helyfigyelés** – háttérben, takarékos módban (nagyjából 50–100 m-enként vagy pár percenként egy pont).
2. **Megálló-felismerő** (a telefonon fut): ha egymás után minden pont egy ~75 m-es körön belül van **legalább 20 percig**, az egy megálló. 4 óránál hosszabb = valószínűleg otthon/munkahely → kihagyjuk.
3. **Kizárás:** az otthont és a munkahelyet az app magától megtanulja (éjszakai, ill. hétköznap nappali ismétlődő helyek), és a felhasználó kézzel is megadhat kizárt helyeket.
4. **Párosítás:** a megálló koordinátájára a helyszolgáltató visszaadja a 60 m-en belüli vendéglátóhelyeket. Ha egyértelmű → látogatás; ha 2–3 jelölt is van (pl. bevásárlóközpont) → értesítésben megkérdezzük: „Hol ettél?”.
5. **A nyers útvonalat eldobjuk**, csak a felismert látogatás marad meg.

Platformkövetelmények, amikre készülni kell:
- **Android:** „Mindig” helyhozzáférés + előtérszolgáltatás. A Google Play a háttér-helyhasználatot külön nyilatkozathoz és bemutató videóhoz köti – ezt a nyilvános indulásnál kell kitölteni, saját tesztnél nem kell.
- **iOS:** „Mindig” engedély, magyarázó szöveggel. Ha az Expo-s helyfigyelés túl sok akkut eszik, egy kis natív modullal az iOS saját „látogatás-figyelését” (`CLVisit`) használjuk – ez kifejezetten erre való és nagyon takarékos.

## 4. Helyszolgáltató réteg (Google ⇄ OSM átkapcsolható)

Az app többi része nem tudja, melyik szolgáltató fut – csak ezt a közös felületet látja:

```ts
interface PlaceProvider {
  id: 'google' | 'osm';
  /** Vendéglátóhelyek egy pont körül, távolság szerint rendezve */
  findFoodPlacesNear(lat: number, lon: number, radiusM: number): Promise<PlaceCandidate[]>;
  /** Részletek külső azonosító alapján (pl. Idővonal-importból kapott Google placeId) */
  getPlace?(externalId: string): Promise<PlaceCandidate | null>;
}

interface PlaceCandidate {
  provider: 'google' | 'osm';
  externalId: string;       // Google placeId vagy "node/123"
  name: string;
  lat: number; lon: number;
  category: 'restaurant' | 'cafe' | 'fast_food' | 'bar' | 'pub' | 'other';
  cuisine?: string;
  address?: string;
  phone?: string; website?: string;
  distanceM?: number;
}
```

- **Beállításokban választható:** `Google` / `OpenStreetMap` / `Automatikus` (OSM, és ahol nem talál semmit, ott Google – ha van kulcs).
- **Gyorsítótár:** minden lekérdezés eredménye elmentve (180 napig) – ugyanazt a helyet nem kérdezzük le kétszer. Ez tartja alacsonyan a Google-költséget.
- **Előny Google-lal az importnál:** a Google Idővonal export **pontosan megmondja a Google helyazonosítót** (`placeId`), így ott nem kell keresgélni, egy lekérdezés megadja a nevet és a típust → nagyon pontos. (Hogy a Timeline-ből exportált azonosítókat a Places API minden esetben elfogadja-e, valódi exporttal még ki kell próbálni.)
- **Google API-kulcs:** saját tesztnél a kulcs a telefonon tárolódik (Beállítások), korlátozva csak a Places API (New)-ra, napi kvótával. Nyilvános indulásnál a hívások a saját szerverünkön (Supabase Edge Function) mennek át, hogy a kulcs ne legyen az appban és a költséget kézben tartsuk.
- **Költség (2026. novemberi árlista):** csak olcsóbb mezőket kérünk (név, hely, típus, rövid cím – telefonszámot, weboldalt nem, mert az drágább kategória).
  - Place Details Pro: 5 000 ingyenes / hó, utána ~17 USD / 1 000.
  - Nearby Search Pro: 5 000 ingyenes / hó, utána ~32 USD / 1 000.
  - Saját tesztnél bőven az ingyenes kereten belül maradunk.
- **OpenStreetMap korlát (tapasztalat, 2026-11-19):** a nyilvános Overpass szerver
  - az általános kliens-azonosítókat elutasítja (406), ezért az app saját User-Agent-tel azonosítja magát;
  - gyakran túlterhelt (502), ezért az app egyre hosszabb várakozással újrapróbál, és tartalék szerverekre vált;
  - a saját leírása szerint emberi, alacsony forgalmú használatra való. **Nyilvános induláshoz saját Overpass példány vagy szerveroldali gyorsítótár kell**, vagy a Google legyen az alap.

## 5. Adatmodell

Már most úgy, hogy változtatás nélkül felkerülhessen a felhőbe (minden azonosító UUID, minden sorban `user_id` helye, időbélyegek a szinkronhoz).

```
places          – saját UUID + google_place_id + osm_id  ← egy étterem = egy sor, bármelyik szolgáltatóból jön
                  name, address, lat, lon, category, cuisine, phone, website, updated_at
visits          – id, place_id, start_at, end_at, source (auto | import | manual), confidence, user_id
ratings         – place_id, value (up | down | null), note, rated_at, user_id
place_overrides – place_id, hidden, custom_name   (pl. „Ez nem étterem”)
excluded_zones  – lat, lon, radius, label          (otthon, munkahely, ismerős lakása)
shares          – id, place_id, channel, created_at (mérjük, mennyi ingyenes reklámot hoz)
provider_cache  – provider, query_key, payload, fetched_at
settings        – provider, értesítések, pro kapcsolók
```

Csak a felhőben, a 2–3. fázisban:

```
users, restaurants (claimed_by), restaurant_staff,
campaigns (célzás: korábbi 👍 vendégek, X napja nem jártak ott), offers, redemptions,
aggregált nézetek az irányítópulthoz (látogatók száma, visszatérési arány – csak anonim, hozzájárulással)
```

A kulcs üzleti elem: **a saját `places.id` köti össze a Google-, OSM- és később az étterem által „átvett” profilt.** Így egy étterem egyszer regisztrál, és minden adat hozzá fut be.

## 6. Ingyenes és Pro funkciók

A kódban már most minden extra egy **kapcsoló mögött** van (`features.ts`), saját tesztnél minden be van kapcsolva. Később csak a kapcsolót kötjük az előfizetéshez.

| Funkció | Ingyenes | Pro |
|---|---|---|
| Automatikus látogatásnapló | ✔ | ✔ |
| 👍 / 👎, jegyzet | ✔ | ✔ |
| „Hova ma?” ajánló, közeli új helyek | ✔ | ✔ |
| Megosztás közösségi hálón | ✔ (mindig ingyenes – ez hozza az új felhasználókat) | ✔ |
| Google Idővonal import | utolsó 3 hónap | teljes múlt |
| Statisztikák, „Év éttermei” | alap | részletes |
| Fotók, ételszintű jegyzetek | – | ✔ |
| Felhő szinkron, több eszköz | – | ✔ |
| Export (CSV / PDF) | – | ✔ |

Az éttermi oldal (irányítópult, kampányok) külön, webes felület lesz – nem az appban.

## 7. Megosztás

- Megjelenik, amikor 👍-t nyomsz, és a részleteknél is van rá gomb.
- Az app egy **megosztókártyát** készít képként: étterem neve, konyha, „5. alkalommal jártam itt”, opcionális saját mondat, alul az app logója és linkje.
- A telefon saját megosztás-menüje nyílik → Instagram Story, Facebook, WhatsApp, Messenger, bármi.
- A linkben egy hivatkozási kód van (`?ref=…`), így mérhető, hány új felhasználót hozott a megosztás – **ez az éttermeknek is eladható adat** („a vendégeid X-szer osztották meg a helyedet”).
- Csak akkor osztunk meg bármit, ha a felhasználó maga nyom rá. Automatikus posztolás nincs.

## 8. Adatvédelem (GDPR)

- Minden adat alapból a telefonon; a felhő csak bekapcsolás után.
- Első indításkor érthető magyarázat: miért kell a „Mindig” helyhozzáférés, mit tárolunk, mit nem.
- „Minden adatom törlése” és „Adataim exportálása” gomb a beállításokban.
- Nyilvános induláshoz kell majd: adatkezelési tájékoztató, ÁSZF, és a Play / App Store adatvédelmi űrlapjai.

## 9. Ami kell hozzá

| Mi | Mire | Költség | Mikor |
|---|---|---|---|
| **Node.js (LTS)** | Az Expo fejlesztéshez | ingyenes | **Most – ezen a gépen még nincs telepítve** |
| Android Studio + SDK | Emulátor, Android fordítás | ingyenes | **Már telepítve van** ✔ |
| Androidos telefon USB-hibakereséssel | Valós teszt (a háttér-helyfigyelés csak valódi telefonon mérhető jól) | – | Most |
| Expo fiók | Felhős fordítás (EAS Build) | ingyenes keret | Most |
| Google Cloud fiók + Places API kulcs | Google helyszolgáltató | havi ingyenes keret, utána fizetős | Amikor kipróbálod a Google-t |
| Apple Developer Program | iOS fordítás telepítéshez, TestFlight, App Store | ~99 USD/év | Amikor iPhone-on is tesztelni akarod |
| Google Play fejlesztői fiók | Play Áruház, belső / zárt tesztsáv ismerősöknek | – | **Már megvan** ✔ (két játék is fut rajta) |
| Supabase | Felhő, fiók, éttermi oldal | ingyenes keret | 2. fázis |

## 10. Projektszerkezet

```
C:\Etterem\app\              ← Git: github.com/joeka75/visszajaro (privát)
├─ docs\
│  ├─ KONCEPCIO.md, ARCHITEKTURA.md
│  └─ prototipus\            ← a korai böngészős prototípus
├─ plugins\                  ← Expo config pluginok (pl. CMake-verzió)
├─ scripts\                  ← Node-tesztek (Idővonal, megállás-felismerő)
└─ src\
   ├─ app\                   ← képernyők (expo-router)
   │  ├─ (tabs)\index.tsx       Hova ma?
   │  ├─ (tabs)\places.tsx      Helyeim
   │  ├─ (tabs)\settings.tsx    Beállítások, felismerés, import, szolgáltató
   │  ├─ place\[id].tsx         Részletek, értékelés, jegyzet
   │  ├─ share\[id].tsx         Megosztókártya
   │  └─ import.tsx             Idővonal import
   ├─ components\            közös UI, felfedezés, megosztókártya
   ├─ db\                    séma, migrációk (expo-sqlite), lekérdezések
   ├─ tracking\              háttérfigyelés, megállás-felismerő, értesítés
   ├─ providers\             google.ts, osm.ts, index.ts (választó + gyorsítótár)
   ├─ import\                Google Idővonal feldolgozó
   ├─ lib\                   formázás, „Hova ma?” logika, hookok
   └─ features.ts            Pro kapcsolók
```

## 11. Az 1. fázis lépései (saját teszt)

| # | Mérföldkő | Eredmény, amit kipróbálhatsz |
|---|---|---|
| M1 | Expo projekt, adatbázis, Helyeim / Részletek / 👍👎 képernyők | Az app fut a telefonodon, demó adatokkal |
| M2 | Google Idővonal import + OSM és Google szolgáltató, átkapcsolható | A saját múltbeli éttermeid megjelennek, összehasonlíthatod a két szolgáltatót |
| M3 | Háttér-felismerés + „Milyen volt?” értesítés | Elmész ebédelni, és az app magától felismeri |
| M4 | „Hova ma?” ajánló + közeli új helyek + megosztókártya | A teljes élmény, megosztással |
| M5 | iOS fordítás felhőben (EAS) | Az iOS-verzió elkészül; iPhone-ra telepítéshez Apple fejlesztői fiók kell |

**M3 megvalósítás (2026-11-19):**
- Androidon előtérszolgáltatás fut (állandó értesítés „Visszajáró – Figyelem, ha vendéglátóhelyen jársz”), 3 percenként egy minta, Balanced pontossággal.
- A megállás-felismerő (`src/tracking/dwell.ts`) 80 m-es kör, 20–240 perc. Egy kiugró GPS-minta nem szakít meg megállást.
- A megálló helyét a kiválasztott szolgáltató 75 m-en belül keresi. Ha nincs net, a megállás sorban vár (`pending_stays`), és később újra próbálja.
- „Milyen volt?” értesítés 👍 / 👎 / „Nem itt voltam” gombokkal. Az otthon és a munkahely kizárható zónaként.
- Az Idővonal-export sok telefonon nem elérhető: a Google kikapcsolta, vagy nincs adat. Ezért a valódi belépő az automatikus felismerés, az import csak kiegészítő.
- Nyilvános induláshoz még kell: akkumulátor-mérés, és a Google Play háttér-helyhozzáférési nyilatkozata (videóval, indoklással).

**M4 megvalósítás (2026-11-19):**
- „Hova ma?” → **Új helyek a közelben**: vendéglátóhelyek 800 m-en belül, ahol még nem jártál.
  - A helyzetet ~100 m-re kerekítve küldi a szolgáltatónak, és 14 napig gyorsítótárazza.
- **🔖 Kipróbálnám** lista (`places.wish_at`). Ha később felismeri az első látogatást, az értesítés címe: „Végre kipróbáltad”.
- **Megosztókártya**: 1080×1350 PNG (react-native-view-shot), a telefon saját megosztó menüjével (expo-sharing).
  - 👍 után a részletek oldalon felajánlja. A jegyzet csak kérésre kerül rá, időpont és helyzet soha.
  - A megosztások a `shares` táblába kerülnek. Később: link vagy QR a kártyán, ami az app letöltéséhez visz (vírusos növekedés).
