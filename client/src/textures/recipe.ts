// What a recipe is handed and what it answers: the record to paint, and a surface with its materials for the
// picture to finish.
import type { FinishOptions } from './finish.ts';
import type { Materials } from './materials.ts';
import type { Surface } from './surface.ts';

/** What the forged world names a picture for: a building's wall, roof or window, a door, a room kit's wall, floor,
 *  ceiling or slope, a prop's picture, or a bed's cloth. */
export type PictureUse = 'wall' | 'roof' | 'window' | 'door' | 'floor' | 'ceiling' | 'slope' | 'prop' | 'cloth';

/** The record a recipe paints: its archive (a winter set's summer one), record, frame of `frames`, size, seed and
 *  the uses the forged world names it for. */
export interface RecipeContext {
  readonly archive: number;
  readonly record: number;
  readonly frame: number;
  readonly frames: number;
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly uses: ReadonlySet<PictureUse>;
}

/** A painted surface to finish; `window` when it holds a window's panes. */
export interface Job {
  readonly surf: Surface;
  readonly mats: Materials;
  readonly finish: FinishOptions;
  readonly window?: boolean;
}
