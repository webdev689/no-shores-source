// Daggerfall's 256 colours as the forge's colour pieces take them, for a picture the page draws itself (a dye's tile,
// a keeper's swatch) to show a ramp in the colours the forge's figures are snapped to.

import type { Rgb } from '../../forge/dyes.ts';
import { PALETTE_RGB } from '../../textures/palette.ts';

/** The palette, a colour an index. */
export const GAME_PALETTE: readonly Rgb[] = Array.from(
  { length: 256 },
  (_unused, index) => [...PALETTE_RGB.slice(index * 3, index * 3 + 3)] as unknown as Rgb,
);
