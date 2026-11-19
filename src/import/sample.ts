/**
 * Minta-idővonal (új Android formátum) budapesti belvárosi pontokkal – kipróbáláshoz,
 * ha nincs kéznél saját export. Tartalmaz otthont, munkahelyet és túl rövid megállást is,
 * hogy a szűrés is látszódjon.
 */
export function sampleTimeline() {
  const pts: [number, number, number, number, number, string][] = [
    // lat, lon, hány napja, óra, időtartam (perc), típus
    [47.4979, 19.0596, 5, 19, 95, 'UNKNOWN'], // Gozsdu udvar környéke
    [47.498, 19.0625, 12, 13, 50, 'UNKNOWN'], // Kazinczy utca
    [47.487, 19.0617, 20, 18, 110, 'UNKNOWN'], // Ráday utca
    [47.4979, 19.0596, 40, 20, 80, 'UNKNOWN'], // Gozsdu újra
    [47.5037, 19.0631, 33, 12, 60, 'UNKNOWN'], // Liszt Ferenc tér
    [47.479, 19.051, 60, 13, 70, 'UNKNOWN'], // Bartók Béla út
    [47.515, 19.08, 1, 22, 540, 'HOME'],
    [47.496, 19.07, 2, 9, 480, 'WORK'],
    [47.499, 19.056, 3, 17, 8, 'UNKNOWN'],
  ];
  return {
    semanticSegments: pts.map(([lat, lon, daysAgo, hour, dur, type]) => {
      const s = new Date();
      s.setDate(s.getDate() - daysAgo);
      s.setHours(hour, 0, 0, 0);
      return {
        startTime: s.toISOString(),
        endTime: new Date(s.getTime() + dur * 60000).toISOString(),
        visit: {
          hierarchyLevel: 0,
          probability: 0.9,
          topCandidate: {
            // nem valódi Google azonosító → a Google mód közeli kereséssel párosít
            semanticType: type,
            probability: 0.8,
            placeLocation: { latLng: `${lat}°, ${lon}°` },
          },
        },
      };
    }),
  };
}
