// The last steps every painted picture takes: its relief softened, light with cast shadows, hollows darkened, and the
// render into the palette.
import { light, occlude, soften } from './light.ts';
import { PALETTE_RGB } from './palette.ts';
import { paletteShades, type Materials } from './materials.ts';
import { render, type Rendered } from './render.ts';
import type { Surface } from './surface.ts';

/** How a recipe finishes its picture; each left out takes the usual. `spread` is how far a material's places
 *  spread over its shades, `soften` how many texels its relief is blurred over. */
export interface FinishOptions {
  strength?: number;
  cast?: number;
  occlusion?: number;
  contrast?: number;
  spread?: number;
  soften?: number;
}

/** The materials that keep their painted tones: fire and glow are their own light. */
const GLOWING = ['fire', 'glassLit', 'lava'];

/** A record's own seed for the render's accent patches. */
const recordSeed = (archive: number, record: number): number => (Math.imul(archive | 0, 1000003) + (record | 0)) | 0;

export function finish(
  surf: Surface,
  mats: Materials,
  archive: number,
  record: number,
  options: FinishOptions,
): Rendered {
  soften(surf, surf.relief, options.soften ?? 0.9);
  light(surf, { strength: options.strength ?? 1, cast: options.cast ?? 0.4, reach: 3, slope: 0.6 });
  const occlusion = options.occlusion ?? 0.2;
  if (occlusion) occlude(surf, occlusion);
  const contrast = options.contrast ?? 0.55;
  const keep = new Set<number>();
  for (const name of GLOWING) if (mats.index[name] !== undefined) keep.add(mats.index[name]);
  return render(surf, contrast, paletteShades(mats, PALETTE_RGB), recordSeed(archive, record), {
    share: options.spread ?? 0.7,
    keep,
  });
}
