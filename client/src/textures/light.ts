// The light a picture is finished with: a light from the top left and in front, the shadows raised parts cast, and
// hollows darkened. Every surface tiles, so each pass reads its neighbours across the picture's edges.
import { wrapIndex } from './noise.ts';
import { exp, hypot } from './portableMath.ts';
import { SCALE, type Surface } from './surface.ts';

const LIGHT_DIRECTION = [-0.5, -0.62, 0.6];

/** How a surface is lit: `strength` scales the light off its relief; a raised part casts a shadow `cast` deep, up to
 *  `reach` texels, the light falling `slope` a texel. */
export interface Lighting {
  strength: number;
  cast: number;
  reach: number;
  slope: number;
}

/**
 * Light the surface: each place's shade from the normal of its relief against the light, less what a flat place
 * would take, plus whatever shade the painters laid. A slope facing the light gains up to about +0.5, one facing
 * away loses as much, so a domed stone runs from highlight to shadow. A flat place takes only the painted shade.
 */
export function light(surf: Surface, { strength, cast, reach, slope }: Lighting): void {
  const len = hypot(LIGHT_DIRECTION[0], LIGHT_DIRECTION[1], LIGHT_DIRECTION[2]);
  const lightX = LIGHT_DIRECTION[0] / len;
  const lightY = LIGHT_DIRECTION[1] / len;
  const lightZ = LIGHT_DIRECTION[2] / len;
  const out = new Float32Array(surf.gridWidth * surf.gridHeight);
  const flatLen = hypot(lightX, lightY) || 1;
  const towardX = lightX / flatLen;
  const towardY = lightY / flatLen;
  const reliefAt = (gridX: number, gridY: number): number => surf.relief[surf.grid(gridX, gridY)];
  for (let gridY = 0; gridY < surf.gridHeight; gridY++)
    for (let gridX = 0; gridX < surf.gridWidth; gridX++) {
      const i = gridY * surf.gridWidth + gridX;
      let shade = surf.shade[i];
      if (!surf.flat[i]) {
        const slopeX = (reliefAt(gridX + 1, gridY) - reliefAt(gridX - 1, gridY)) * 0.5 * SCALE;
        const slopeY = (reliefAt(gridX, gridY + 1) - reliefAt(gridX, gridY - 1)) * 0.5 * SCALE;
        const n = hypot(slopeX, slopeY, 1);
        shade += ((-slopeX * lightX - slopeY * lightY + lightZ) / n - lightZ) * strength;
      }
      if (cast > 0) {
        const base = surf.relief[i];
        let block = 0;
        for (let step = 1; step <= reach * SCALE; step++) {
          const rise =
            reliefAt(Math.round(gridX - towardX * step), Math.round(gridY - towardY * step)) -
            base -
            (step / SCALE) * slope;
          if (rise > block) block = rise;
        }
        shade -= Math.min(1, block / 2) * cast;
      }
      out[i] = shade;
    }
  surf.shade.set(out);
}

/** A box blur of a layer over `span` sub-texels each way: a running sum along each row, then each column. */
function boxBlur(surf: Surface, src: Float32Array, span: number): Float32Array {
  const wide = surf.gridWidth;
  const tall = surf.gridHeight;
  const n = 2 * span + 1;
  const rows = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let gridY = 0; gridY < tall; gridY++) {
    const row = gridY * wide;
    let sum = 0;
    for (let k = -span; k <= span; k++) sum += src[row + wrapIndex(k, wide)];
    for (let gridX = 0; gridX < wide; gridX++) {
      rows[row + gridX] = sum / n;
      sum += src[row + wrapIndex(gridX + span + 1, wide)] - src[row + wrapIndex(gridX - span, wide)];
    }
  }
  for (let gridX = 0; gridX < wide; gridX++) {
    let sum = 0;
    for (let k = -span; k <= span; k++) sum += rows[wrapIndex(k, tall) * wide + gridX];
    for (let gridY = 0; gridY < tall; gridY++) {
      out[gridY * wide + gridX] = sum / n;
      sum +=
        rows[wrapIndex(gridY + span + 1, tall) * wide + gridX] - rows[wrapIndex(gridY - span, tall) * wide + gridX];
    }
  }
  return out;
}

/** Darken places in hollows: a place lower than the mean relief within two texels, by `amount` a texel of depth. */
export function occlude(surf: Surface, amount: number): void {
  const mean = boxBlur(surf, surf.relief, Math.max(1, Math.round(2 * SCALE)));
  for (let i = 0; i < mean.length; i++) {
    const depth = surf.relief[i] - mean[i];
    if (depth < 0) surf.shade[i] += depth * amount;
  }
}

/** Soften a layer with a small Gaussian of `radius` texels, one pass along the rows and one down the columns. */
export function soften(surf: Surface, layer: Float32Array, radius: number): void {
  if (radius <= 0) return;
  const spread = radius * SCALE;
  const span = Math.ceil(spread * 2.5);
  const kernel: number[] = [];
  for (let i = -span; i <= span; i++) kernel.push(exp(-(i * i) / (2 * spread * spread)));
  const wide = surf.gridWidth;
  const tall = surf.gridHeight;
  const total = kernel.reduce((a, b) => a + b, 0);
  const across = Int32Array.from({ length: wide + 2 * span }, (_slot, i) => wrapIndex(i - span, wide));
  const down = Int32Array.from({ length: tall + 2 * span }, (_slot, i) => wrapIndex(i - span, tall));
  const rows = new Float32Array(layer.length);
  const out = new Float32Array(layer.length);
  for (let gridY = 0; gridY < tall; gridY++) {
    const row = gridY * wide;
    for (let gridX = 0; gridX < wide; gridX++) {
      let sum = 0;
      for (let tap = 0; tap < kernel.length; tap++) sum += layer[row + across[gridX + tap]] * kernel[tap];
      rows[row + gridX] = sum / total;
    }
  }
  for (let gridX = 0; gridX < wide; gridX++)
    for (let gridY = 0; gridY < tall; gridY++) {
      let sum = 0;
      for (let tap = 0; tap < kernel.length; tap++) sum += rows[down[gridY + tap] * wide + gridX] * kernel[tap];
      out[gridY * wide + gridX] = sum / total;
    }
  layer.set(out);
}
