/**
 * Az Idővonal-feldolgozó gyors tesztje. Futtatás:  node scripts/test-timeline.ts
 * (A Node 22.18+ közvetlenül futtatja a TypeScriptet.)
 */
import assert from 'node:assert/strict';

import { extractStops, prepareImport, TimelineFormatError } from '../src/import/timeline.ts';

const day = (d: number, h: number, m = 0) => new Date(Date.UTC(2026, 9, d, h, m)).toISOString();

// 1) Új Android formátum
const android = {
  semanticSegments: [
    { startTime: day(1, 11), endTime: day(1, 12), visit: { topCandidate: { placeId: 'ChIJ_A', semanticType: 'UNKNOWN', placeLocation: { latLng: '47.4979°, 19.0596°' } } } },
    { startTime: day(8, 18), endTime: day(8, 19, 30), visit: { topCandidate: { placeId: 'ChIJ_A', semanticType: 'UNKNOWN', placeLocation: { latLng: '47.4979°, 19.0596°' } } } },
    { startTime: day(2, 20), endTime: day(3, 7), visit: { topCandidate: { placeId: 'ChIJ_HOME', semanticType: 'HOME', placeLocation: { latLng: '47.51°, 19.08°' } } } },
    { startTime: day(3, 9), endTime: day(3, 17), visit: { topCandidate: { placeId: 'ChIJ_WORK', semanticType: 'INFERRED_WORK', placeLocation: { latLng: '47.49°, 19.07°' } } } },
    { startTime: day(4, 10), endTime: day(4, 10, 8), visit: { topCandidate: { placeId: 'ChIJ_SHORT', semanticType: 'UNKNOWN', placeLocation: { latLng: '47.5°, 19.05°' } } } },
    { startTime: day(5, 10), endTime: day(5, 11), activity: { topCandidate: { type: 'WALKING' } } },
    { timelinePath: [{ point: '47.1°, 19.2°', time: day(5, 10) }] },
  ],
};
const a = prepareImport([android]);
assert.equal(a.stopsTotal, 5);
assert.equal(a.excludedHomeWork, 2);
assert.equal(a.excludedDuration, 1);
assert.equal(a.kept, 2);
assert.equal(a.groups.length, 1);
assert.equal(a.groups[0].googlePlaceId, 'ChIJ_A');
assert.equal(a.groups[0].stops.length, 2);
assert.equal(a.groups[0].lat, 47.4979);

// 2) Új iOS formátum (tömb, placeID, geo: koordináta)
const ios = [
  { startTime: day(10, 12), endTime: day(10, 13), visit: { topCandidate: { placeID: 'ChIJ_B', semanticType: 'Unknown', placeLocation: 'geo:47.487000,19.061700' } } },
  { startTime: day(10, 13), endTime: day(10, 13, 20), activity: {} },
];
const b = extractStops(ios);
assert.equal(b.length, 1);
assert.equal(b[0].googlePlaceId, 'ChIJ_B');
assert.equal(b[0].lon, 19.0617);

// 3) Régi Takeout formátum (névvel, ms időbélyeggel)
const takeout = {
  timelineObjects: [
    { placeVisit: { location: { latitudeE7: 474979000, longitudeE7: 190596000, placeId: 'ChIJ_C', name: 'Teszt Bisztró', address: 'Budapest' }, duration: { startTimestampMs: String(Date.UTC(2023, 0, 5, 11)), endTimestampMs: String(Date.UTC(2023, 0, 5, 12)) } } },
    { activitySegment: {} },
  ],
};
const c = prepareImport([takeout]);
assert.equal(c.kept, 1);
assert.equal(c.groups[0].name, 'Teszt Bisztró');
assert.equal(c.groups[0].lat, 47.4979);

// 4) Ugyanaz a fájl kétszer → nincs duplikáció
assert.equal(prepareImport([android, android]).kept, 2);

// 5) Időkorlát (ingyenes verzió: utolsó 3 hónap)
const limited = prepareImport([android, takeout], new Date(Date.UTC(2026, 0, 1)));
assert.equal(limited.excludedTooOld, 1);
assert.equal(limited.kept, 2);

// 6) Ismeretlen / nyers formátum
assert.throws(() => extractStops({ locations: [] }), TimelineFormatError);
assert.throws(() => extractStops({ foo: 1 }), TimelineFormatError);

console.log('✔ Idővonal-feldolgozó: minden teszt sikeres');
