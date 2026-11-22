// The pictures an Ammo box and an Ammo crate stand as on the ground, and each island's resource as the screens show
// it (and as the Test Ground marks its nodes): baked from Blender models (`resourcePictures.ts`, `ammoBoxPictures.ts`,
// `ammoCratePictures.ts`). The gear screens draw the same rows as their glyphs, so a drop looks on the ground as it
// does in the pack; a Vestige is its crystal (`vestigeCrystal.ts`).

import { RESOURCE_PICTURES } from './resourcePictures.ts';

/** A picture: rows of letters, each a colour of `colours` ('a' the first) and a dot none, each pixel `pixelM` metres
 *  in the world (a glyph's 0.035 m when not given). */
export interface PixelPicture {
  readonly rows: readonly string[];
  readonly colours: readonly string[];
  readonly pixelM?: number;
}

/** Every glyph's outline. */
export const OUTLINE = '#120e0a';

export { AMMO_BOX } from './ammoBoxPictures.ts';
export { AMMO_CRATE } from './ammoCratePictures.ts';

/** An island's resource as its picture, by its place in the catalogue; none past its end. */
export function resourcePicture(place: number): PixelPicture | null {
  return RESOURCE_PICTURES[place] ?? null;
}
