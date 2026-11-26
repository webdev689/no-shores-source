// Each dungeon's map keeps the view it was last left at and the cells it revealed, in the browser's storage, for the
// last dungeons walked; without storage nothing is kept and the map starts afresh.
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

type Store = Pick<Storage, 'getItem' | 'setItem'> | null;

/** The browser's storage, where the page has one. */
const browserStore = (): Store => (typeof localStorage === 'undefined' ? null : localStorage);

function readAll(storage: Store): Record<string, KeptMap> {
  try {
    const all: unknown = JSON.parse(storage?.getItem(STORE) ?? '{}');
    return all && typeof all === 'object' && !Array.isArray(all) ? (all as Record<string, KeptMap>) : {};
  } catch {
    return {};
  }
}

/** What the map of the dungeon `key` kept, or null. */
export function readKept(key: string, storage: Store = browserStore()): KeptMap | null {
  const kept = readAll(storage)[key];
  return kept && Array.isArray(kept.cells) ? kept : null;
}

/** Keeps `map` for the dungeon `key`, as the newest; past the most kept, the oldest go. */
export function writeKept(key: string, map: KeptMap, storage: Store = browserStore()): void {
  try {
    const all = readAll(storage);
    // Written again, it is laid last: the order the keys were laid in is their age.
    delete all[key];
    all[key] = map;
    const keys = Object.keys(all);
    for (const oldest of keys.slice(0, Math.max(0, keys.length - KEPT_MOST))) delete all[oldest];
    storage?.setItem(STORE, JSON.stringify(all));
  } catch {
    // A storage that is full or refuses: the map is not kept.
  }
}
