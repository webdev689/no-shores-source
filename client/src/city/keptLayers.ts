// The layers painted so far, kept for the next city that wears them. A session that crosses every climate would
// otherwise keep every one it painted; past the most kept, the least lately worn is let go, painted again if worn.
import type { LayerLevels } from './layerImage.ts';
import { PICTURE_LAYERS } from './pictures.ts';

/** Layers kept: two cities' whole arrays, the one open and the last, some 44 MB of layers 128 texels square. */
export const MOST_KEPT = 2 * PICTURE_LAYERS;

/** A store of painted layers by their pictures' keys, holding at most `most`, the least lately worn let go first. */
export function keptLayers(most = MOST_KEPT): {
  get(key: string): LayerLevels | undefined;
  set(key: string, levels: LayerLevels): void;
} {
  // A map keeps its keys in the order they were set, so the first is the least lately worn.
  const kept = new Map<string, LayerLevels>();
  const worn = (key: string, levels: LayerLevels) => {
    kept.delete(key);
    kept.set(key, levels);
  };
  return {
    get(key) {
      const levels = kept.get(key);
      if (levels) worn(key, levels);
      return levels;
    },
    set(key, levels) {
      worn(key, levels);
      for (const oldest of kept.keys()) {
        if (kept.size <= most) break;
        kept.delete(oldest);
      }
    },
  };
}
