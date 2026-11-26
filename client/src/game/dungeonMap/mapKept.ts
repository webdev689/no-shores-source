// Each dungeon's map keeps the view it was last left at and the cells it revealed, in the browser's storage, for the
// last dungeons walked; without storage nothing is kept and the map starts afresh. The cells are kept as one bit each,
// so a great dungeon's are a few thousand letters.
import type { MapView } from './mapCamera.ts';

/** How many dungeons' maps are kept; the oldest written goes first. */
export const KEPT_MOST = 30;
/** The browser storage's key all of them are kept under. */
const STORE = 'noShores.dungeonMaps';

/** One dungeon's map as kept: the view it was left at (none if never opened) and the cells revealed. */
export interface KeptMap {
  readonly view: MapView | null;
  readonly cells: readonly number[];
}

/** A map as written: its cells a bit each, in base 64. */
type Written = { readonly view: MapView | null; readonly revealed: string };
type Store = Pick<Storage, 'getItem' | 'setItem'> | null;

/** The browser's storage, where the page has one. */
const browserStore = (): Store => (typeof localStorage === 'undefined' ? null : localStorage);

function readAll(storage: Store): Record<string, Written> {
  try {
    const all: unknown = JSON.parse(storage?.getItem(STORE) ?? '{}');
    return all && typeof all === 'object' && !Array.isArray(all) ? (all as Record<string, Written>) : {};
  } catch {
    return {};
  }
}

/** The cells as a bit each, in base 64. */
function bitsOf(cells: readonly number[]): string {
  const bytes = new Uint8Array(Math.ceil((cells.reduce((most, cell) => Math.max(most, cell), -1) + 1) / 8));
  for (const cell of cells) bytes[cell >> 3] = (bytes[cell >> 3] ?? 0) | (1 << (cell & 7));
  let letters = '';
  for (const byte of bytes) letters += String.fromCharCode(byte);
  return btoa(letters);
}

function cellsOf(bits: string): number[] {
  const letters = atob(bits);
  const cells: number[] = [];
  for (let bit = 0; bit < letters.length * 8; bit++)
    if ((letters.charCodeAt(bit >> 3) >> (bit & 7)) & 1) cells.push(bit);
  return cells;
}

/** What the map of the dungeon `key` kept, or null. */
export function readKept(key: string, storage: Store = browserStore()): KeptMap | null {
  const kept = readAll(storage)[key];
  if (!kept || typeof kept.revealed !== 'string') return null;
  try {
    return { view: kept.view, cells: cellsOf(kept.revealed) };
  } catch {
    return null;
  }
}

/** Keeps `map` for the dungeon `key`, as the newest; past the most kept, or where the storage is full, the oldest go. */
export function writeKept(key: string, map: KeptMap, storage: Store = browserStore()): void {
  const all = readAll(storage);
  // Written again, it is laid last: the order the keys were laid in is their age.
  delete all[key];
  all[key] = { view: map.view, revealed: bitsOf(map.cells) };
  const keys = Object.keys(all);
  for (const oldest of keys.slice(0, Math.max(0, keys.length - KEPT_MOST))) delete all[oldest];
  for (;;) {
    try {
      storage?.setItem(STORE, JSON.stringify(all));
      return;
    } catch {
      // A full storage: the oldest goes, until only this one is left to try.
      const [oldest] = Object.keys(all);
      if (oldest === undefined || oldest === key) return;
      delete all[oldest];
    }
  }
}
