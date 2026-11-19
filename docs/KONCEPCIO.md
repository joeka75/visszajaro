# Étterem-memória app – koncepció (munkaverzió)

> Munkanév: **„Visszajáró”** (további névötletek lent)
> Állapot: ötletelés, 2026-11-19

---

## 1. A probléma

- Mennél enni, de **hirtelen nem jut eszedbe, hol jártál már**, és hol volt jó.
- A Google Térkép idővonala ugyan tudja, merre jártál, de **nem étteremnaplóként** mutatja: nincs benne „tetszett / nem tetszett”, nincs „ide menjünk vissza” lista.
- A Google-értékelések másoknak szólnak (és sok a hamis); **a saját ízlésed** sehol nincs összegyűjtve.

## 2. A megoldás egy mondatban

Az app **automatikusan felismeri, melyik étteremben jártál** (helyadatok alapján), naplót vezet róla, te egy koppintással megjelölöd, hogy 👍 vagy 👎, és amikor nem tudod, hova menj, **a saját múltadból + a közeli új helyekből ajánl.**

## 3. Fő funkciók

### MVP (első kiadás)
| Funkció | Leírás |
|---|---|
| **Látogatások felismerése** | Háttérben figyeli, ha 20+ percet töltesz egy helyen, és megnézi, étterem/kávézó/bár-e. |
| **Google Idővonal importálása** | A régi előzmények egyszeri betöltése (lásd 4. pont) – így az első naptól van tartalom. |
| **Helyeim lista** | Étterem neve, címe, konyha típusa, hányszor és mikor jártál ott. |
| **👍 / 👎 / jegyzet** | Gyors értékelés + rövid megjegyzés („a gulyás isteni, a desszert gyenge”). |
| **„Hova menjünk ma?”** | Kedvencek, amikben rég jártál · közeli kedvencek · új helyek a közelben. |
| **Navigáció** | Egy gombbal Google Térkép útvonal / hívás / foglalás. |

### Később
- **Értesítés evés után:** „A Pöttyös Bisztróban voltál – milyen volt?” (ez hozza az értékeléseket).
- **Ételszintű jegyzetek, fotók** („mit ettem, mit ne rendeljek újra”).
- **Statisztika / „Év éttermei”** (Spotify Wrapped-szerű éves összefoglaló – erősen megosztható!).
- **Közös döntés:** a társaság mindegyik tagja swipe-ol a jelöltekre, az app kiírja a közös találatot.
- **Barátok kedvencei**, „ahol a hasonló ízlésűek visszajárnak” ajánló.
- **Ellenőrzött látogatás alapú értékelés** – csak az értékelhet, aki tényleg ott volt (a hamis értékelések elleni fegyver, ez erős megkülönböztető).

## 4. A legfontosabb technikai kérdés: honnan jön az adat?

⚠️ **Fontos tény:** a Google 2024–2025 során a Térkép Idővonalat (Timeline) **a telefonra költöztette**, a webes idővonal megszűnt, és **nincs nyilvános API**, amivel egy külső app kiolvashatná. Ezért három forrást kombinálunk:

1. **Saját háttér-helymeghatározás (fő forrás, ettől kezdve)**
   - iOS: `CLVisit` „visit monitoring” – az iOS maga jelzi, ha valahol huzamosabban tartózkodsz, nagyon kíméli az akkut.
   - Android: Fused Location + Activity Recognition / geofence – „megálltál egy helyen 20+ percre”.
   - Csak a **megállás koordinátáját** dolgozzuk fel, a teljes útvonalat nem tároljuk.
2. **Google Idővonal-export importálása (a múlt)**
   - Android: *Beállítások → Hely → Helyszolgáltatások → Idővonal → Idővonal-adatok exportálása* → `Timeline.json`.
   - iOS: Google Térkép → Idővonal → Beállítások → Exportálás.
   - Régi Google Takeout „Semantic Location History” fájlok (akinek még megvan).
   - Az export **helyazonosítót + koordinátát** tartalmaz, nevet általában nem → a következő lépés adja meg a nevet.
3. **Hely → étterem párosítás**
   - **Google Places API (New)** – „Nearby Search” `restaurant / cafe / bar …` típusokra. Legpontosabb, de fizetős lekérésenként → erősen gyorsítótárazni kell (ugyanaz a hely csak egyszer).
   - **OpenStreetMap / Overpass** – ingyenes, a prototípus ezt használja. Budapesten jó a lefedettség, vidéken gyengébb.
   - Alternatíva: Foursquare Places API.

További jövőbeli jelforrás: **bankkártyás tranzakciók** (Open Banking / PSD2) – az étterem neve a kártyakivonatban szerepel, és így a **költés** is látszik. Ez a cashback-modellhez is kulcs (lásd 6. pont).

### Felismerési szabályok (első verzió)
- Tartózkodás ≥ 20 perc és ≤ 4 óra
- Távolság a vendéglátóhelytől ≤ 50–60 m
- Kizárni: otthon, munkahely (az Idővonal jelöli), és ahol a felhasználó nyomott egy „Ez nem étterem” gombot
- Étkezési idősávok (11–15, 17–23) növelik a valószínűséget; ha bizonytalan, **megkérdezzük**.

## 5. Adatvédelem – ez a bizalom alapja

- A helyadat GDPR szerint személyes adat, ráadásul nagyon érzékeny → **alapból minden a telefonon marad**.
- Csak az **étterem-látogatásokat** őrizzük meg, a nyers útvonalat eldobjuk.
- Szerverre csak opt-in alapon (szinkron, barátok, értékelések megosztása).
- Éttermek felé **csak összesített, anonim** adat mehet, és csak ha a felhasználó hozzájárult.
- Ezt marketingben is hangsúlyozni kell: „A te naplód, nem a miénk.”

## 6. Bevételi modellek

### A) Felhasználói oldal
1. **Freemium + Pro előfizetés** (pl. 990–1 490 Ft/hó vagy 7 990 Ft/év)
   - Ingyenes: automatikus napló, 👍/👎, alap ajánló.
   - Pro: korlátlan múltbeli import, statisztikák (mennyit eszel házon kívül, kedvenc konyhák), fotók, export, közös döntés, „Év éttermei”, reklámmentesség.
2. **Egyszeri „Múlt importálása” vásárlás** – aki csak a régi adatait akarja betölteni.

### B) Éttermi oldal (itt a nagy pénz)
3. **„Visszahívó” kampányok (win-back)** – *a legerősebb, egyedi ötlet.*
   Az app tudja, ki járt már egy étteremben, és kinek tetszett. Az étterem fizethet azért, hogy **a korábbi elégedett vendégeinek** ajánlatot küldjön („3 hónapja nem jártál nálunk – most -15% a menüből”). Elszámolás: **beváltott kuponként / bejött vendégként (CPA)** – az étterem csak eredményért fizet, és mivel az app látja a visszatérést, a hatás **mérhető**.
4. **Kiemelt hely az ajánlóban** („Új a közelben – Szponzorált”) – kattintásonként vagy megjelenésenként; mindig jelölve, hogy ne romboljon bizalmat.
5. **Étterem-irányítópult (B2B SaaS, 9 900–29 900 Ft/hó)**
   - Hány app-felhasználó járt nálad, mekkora a visszatérési arány, mely napszakban, honnan jönnek.
   - **Ellenőrzött vendégek visszajelzései** (privát, nem nyilvános panaszláda).
   - Összehasonlítás a környékkel (anonim, aggregált).
6. **Hűségprogram-motor** – digitális pecsétkártya automatikusan („5. látogatás után ingyen desszert”), mert a látogatást az app magától érzékeli. Kis éttermeknek nincs saját appjuk – ez kész megoldás.

### C) Partneri / jutalékos bevétel
7. **Asztalfoglalás** – affiliate (pl. TheFork) vagy saját foglalási integráció → jutalék.
8. **„Ma nincs kedved kimenni?”** – a kedvenc éttermed a házhozszállító appban (Wolt / Foodora mélylink) → affiliate.
9. **Ajándékutalvány** a kedvenc éttermedbe – jutalék vagy saját értékesítés.
10. **Gasztro események** – borvacsorák, fesztiválok, főzőkurzusok jegyei a korábbi ízlésed alapján.
11. **Kártyához kötött cashback** (későbbi fázis) – az étterem finanszírozza a visszatérítést, mi jutalékot kapunk.

### D) Hirdetések
12. **Kontextuális, natív hirdetés** a témához: bor, kézműves sör, kávé, konyhai eszközök, gasztro-előfizetések, éttermi kártyák (SZÉP-kártya elfogadóhely-kereső!). Banner-spam helyett 1 jól célzott kártya a listában.

### E) Céges
13. **Üzleti étkezések naplója** – számla fotó + automatikus helyszín/időpont → költségelszámolás. KKV-knak havidíjas.

### Kerülendő
- **Egyedi helyadat eladása** adatbrókereknek – jogilag kockázatos és megölné a bizalmat. Csak aggregált, anonim elemzés jöhet szóba, és csak hozzájárulással.

## 7. Éttermek megkeresése – go-to-market

1. **Először felhasználók, aztán éttermek.** Az éttermeknek akkor éri meg fizetni, ha már van mit mutatni: „A múlt hónapban 140 app-felhasználó járt nálad, 38%-uk visszatérő.”
2. **Egy városrész fókusz** (pl. Budapest VII.–VIII. kerület vagy egy egyetemi város) – sűrű étteremhálózat, sok fiatal okostelefonos felhasználó.
3. **Ingyenes „Vedd át a profilod” (claim)** – az étterem ingyen láthat alapstatisztikát → ebből upsell a kampányokra.
4. **„Első 3 hónap ingyen” alapítói csomag** az első 50 étteremnek, cserébe matrica az ajtón / QR a számlán („Mentsd el, hogy itt jártál”).
5. **Személyes bejárás** – kis családi éttermek nem e-mailre, hanem személyes látogatásra reagálnak; a tulajdonosnak egy kinyomtatott mini-riport a saját helyéről erős belépő.
6. **Gasztro-influencerek / food bloggerek** – megosztható „Év éttermei” összefoglaló a natív növekedés motorja.
7. **Partnerség** étterem-POS rendszerekkel, SZÉP-kártya kibocsátókkal, foglalási platformokkal.

## 8. Hasonló megoldások (amitől különbözünk)

| Termék | Mit tud | Miben vagyunk mások |
|---|---|---|
| Google Térkép (Idővonal, mentett listák) | Tudja, merre jártál | Nem étteremnapló, nincs saját értékelés-lista, nincs ajánló a múltad alapján |
| Beli (USA) | Éttermek rangsorolása, barátok | Kézi rögzítés; nálunk **automatikus** |
| Foursquare Swarm | Check-in napló | Kézi check-in, a hangsúly a játékosításon |
| TheFork / Wolt | Foglalás / rendelés | Nem a te múltadra épít – partnerek lehetnek |

**A versenyelőny:** automatikus, ellenőrzött látogatás-adat + személyes ízlés → **ez az, amit senki más nem lát egyben**, és ezért fizetnének az éttermek.

## 9. Technológiai javaslat

- **Mobil:** React Native + Expo – egy kódbázis Androidra és iOS-re (döntés: lásd 12. pont).
- **Helyi tárolás:** SQLite a telefonon.
- **Backend (később):** Supabase vagy Firebase – fiók, szinkron, barátok, éttermi irányítópult.
- **Helyadat-szolgáltató:** Google Places API (pontosság) + OSM (költségcsökkentés), gyorsítótárral.

## 10. Ütemterv

| Fázis | Tartalom | Cél |
|---|---|---|
| 0. Validálás (most) | Prototípus, saját Idővonal-adat betöltése | Működik-e a felismerés, érdekes-e az ajánló? |
| 1. Saját teszt | Android + iOS app egy kódbázisból, Androidon tesztelve: háttér-felismerés, import, 👍/👎, ajánló, megosztás | Saját magad és pár ismerős napi használata |
| 2. Nyilvános indulás | Fiók + felhő szinkron, Pro funkciók bekapcsolása, áruházi megjelenés (Play + App Store) | 500 aktív felhasználó egy városban |
| 3. Éttermi oldal | Irányítópult, win-back kampányok, hűségprogram | Első 50 fizető étterem |
| 4. Bővítés | Barátok, foglalás/házhozszállítás affiliate, kártyás cashback | Országos lefedettség |

## 11. Névötletek

Visszajáró · Jártam itt · Ízmemória · Falatnapló · Hova menjünk? · TányérTérkép · Kedvenc Asztal

## 12. Döntések (2026-11-19)

| Kérdés | Döntés | Mit jelent a fejlesztésben |
|---|---|---|
| Saját vagy üzleti? | **Saját tesztként indul, de üzleti termékre kész felépítéssel.** | Már most rendes adatmodell, felhasználói fiókra előkészítve, éttermi azonosítók egységesen; a felhő később kapcsolható be átírás nélkül. |
| Platform | **Android és iOS párhuzamosan, egy kódbázisból; tesztelés Androidon.** | React Native + Expo. iOS-t Mac nélkül, felhős fordítással (EAS Build) lehet előállítani. |
| Google Places vagy OSM? | **Mindkettő benne lesz, átkapcsolható; később döntesz.** | Egy közös „helyszolgáltató” réteg, a beállításokban választható. A Google-hoz API-kulcs kell, az OSM ingyenes. |
| Közösségi funkciók | **Privát napló, de jó élmény után megosztási lehetőség közösségi hálókra.** | 👍 után „Oszd meg!” – szép megosztókártya képpel (Instagram, Facebook, WhatsApp stb.), benne az app neve/linkje → ingyenes reklám. |
| Bevétel | **A felhasználónak ingyenes alap + fizetős extrák; a fő bevétel az éttermektől jön.** | Már most „Pro” kapcsolók a kódban (még nem fizetős); az adatmodell az éttermi kampányokhoz is előkészítve. |

A részletes technikai terv: [ARCHITEKTURA.md](ARCHITEKTURA.md).

---

Prototípus: [prototipus/index.html](prototipus/index.html) – böngészőben megnyitható, telefon nézetben is.
