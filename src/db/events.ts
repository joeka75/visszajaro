import { useSyncExternalStore } from 'react';

/**
 * Egyszerű „adat megváltozott” jelzés: minden írás után bump(),
 * a képernyők a useDataVersion() értékére frissítenek.
 */
let version = 0;
const listeners = new Set<() => void>();

export function bump() {
  version++;
  listeners.forEach((l) => l());
}

export function useDataVersion() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
}
