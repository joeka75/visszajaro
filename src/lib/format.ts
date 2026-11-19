/** Távolság méterben (haversine) */
export function distanceM(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371000;
  const toR = (x: number) => (x * Math.PI) / 180;
  const dLat = toR(bLat - aLat);
  const dLon = toR(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const fmtDist = (m: number) =>
  m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;

const dayStart = (d: Date | string | number) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
};

/** Naptári napok száma a dátum óta */
export const daysSince = (iso: string) => Math.round((dayStart(Date.now()) - dayStart(iso)) / 864e5);

export function ago(iso: string | null) {
  if (!iso) return '–';
  const d = daysSince(iso);
  if (d <= 0) return 'ma';
  if (d === 1) return 'tegnap';
  if (d < 7) return `${d} napja`;
  if (d < 30) return `${Math.round(d / 7)} hete`;
  if (d < 365) return `${Math.round(d / 30)} hónapja`;
  return `${Math.round(d / 365)} éve`;
}

const WEEKDAYS = ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat'];
const MONTHS = ['jan.', 'febr.', 'márc.', 'ápr.', 'máj.', 'jún.', 'júl.', 'aug.', 'szept.', 'okt.', 'nov.', 'dec.'];
const pad = (n: number) => String(n).padStart(2, '0');

/** pl. „2026. nov. 12., szerda” – Intl nélkül, hogy minden telefonon egyforma legyen */
export function fmtDay(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}. ${MONTHS[d.getMonth()]} ${d.getDate()}., ${WEEKDAYS[d.getDay()]}`;
}

export const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const minutesBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
