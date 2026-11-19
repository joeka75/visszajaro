/**
 * A megállás-felismerő tesztje. Futtatás:  node scripts/test-dwell.ts
 */
import assert from 'node:assert/strict';

import { emptyState, stepMany, type Sample } from '../src/tracking/dwell.ts';

const T0 = Date.UTC(2026, 10, 19, 11, 0);
const min = (m: number) => T0 + m * 60_000;
// Budapest, ~1 m ≈ 0.000009 fok szélesség
const RESTO = { lat: 47.4979, lon: 19.0596 };
const off = (m: number) => ({ lat: RESTO.lat + m * 0.000009, lon: RESTO.lon });
const s = (m: number, metersNorth = 0, acc = 20): Sample => ({ ...off(metersNorth), t: min(m), acc });

// 1) 45 perc egy helyen, mintánként 3 perc, aztán elsétál
{
  const samples: Sample[] = [];
  for (let m = 0; m <= 45; m += 3) samples.push(s(m, (m % 2) * 10));
  samples.push(s(48, 300), s(51, 600));
  const { stays } = stepMany(emptyState(), samples);
  assert.equal(stays.length, 1, 'egy megállás');
  const st = stays[0];
  assert.ok(Math.abs(st.start - min(0)) < 1000);
  assert.ok(st.end >= min(45) && st.end <= min(48));
  assert.ok(Math.abs(st.lat - RESTO.lat) < 0.0002);
}

// 2) Rövid (10 perces) megálló nem számít
{
  const { stays } = stepMany(emptyState(), [s(0), s(5), s(10), s(13, 400), s(16, 800)]);
  assert.equal(stays.length, 0);
}

// 3) Egyetlen beltéri GPS-ugrás nem szakítja meg a megállást
{
  const { stays } = stepMany(emptyState(), [s(0), s(10), s(20, 200), s(23), s(35), s(40, 300), s(43, 600)]);
  assert.equal(stays.length, 1);
  assert.ok(stays[0].end - stays[0].start >= 35 * 60_000); // 35 percig biztosan bent volt
}

// 4) Mozdulatlan telefon: nincs minta bent, csak érkezéskor és távozáskor – a vég a távoli mintából becsülve
{
  const { stays } = stepMany(emptyState(), [s(0), s(2), s(60, 700)]);
  assert.equal(stays.length, 1);
  const durMin = (stays[0].end - stays[0].start) / 60_000;
  assert.ok(durMin > 50 && durMin < 60, `időtartam: ${durMin}`);
}

// 5) Túl hosszú (otthon / munkahely, 6 óra) nem számít
{
  const samples: Sample[] = [];
  for (let m = 0; m <= 360; m += 10) samples.push(s(m));
  samples.push(s(365, 900));
  assert.equal(stepMany(emptyState(), samples).stays.length, 0);
}

// 6) Pontatlan minták figyelmen kívül; sorrend nem számít; kötegek között folytatható
{
  const part1 = [s(10), s(0), s(5, 0, 900), s(20)];
  const r1 = stepMany(emptyState(), part1);
  assert.equal(r1.stays.length, 0);
  const r2 = stepMany(r1.state, [s(30), s(33, 600)]);
  assert.equal(r2.stays.length, 1);
  assert.ok(Math.abs(r2.stays[0].start - min(0)) < 1000);
}

// 7) Két egymás utáni étterem
{
  const other = 1000;
  const { stays } = stepMany(emptyState(), [s(0), s(15), s(30), s(33, 1000), s(40, other), s(60, other), s(75, other), s(80, 2000)]);
  assert.equal(stays.length, 2);
}

console.log('✔ Megállás-felismerő: minden teszt sikeres');
