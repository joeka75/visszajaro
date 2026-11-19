import { useColorScheme } from 'react-native';

const light = {
  bg: '#fffaf5',
  card: '#ffffff',
  text: '#2b2420',
  muted: '#7a6d64',
  line: '#eadfd5',
  accent: '#d9480f',
  accentText: '#ffffff',
  accentSoft: '#ffe8dc',
  good: '#2b8a3e',
  goodSoft: '#e3f6e7',
  bad: '#c92a2a',
  badSoft: '#fde4e4',
};

const dark: typeof light = {
  bg: '#1c1816',
  card: '#26201d',
  text: '#f3ebe4',
  muted: '#a8998e',
  line: '#3a312c',
  accent: '#ff7a3d',
  accentText: '#1c1816',
  accentSoft: '#3d2418',
  good: '#69db7c',
  goodSoft: '#1e3324',
  bad: '#ff8787',
  badSoft: '#3d1f1f',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24 } as const;
export const radius = { s: 10, m: 14, l: 18 } as const;
