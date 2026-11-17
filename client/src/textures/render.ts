// The surface as a picture in the palette. Each place's tone, moved by its light, ranks it among its material's
// places; the ranks are laid over the material's palette shades, either spread normally about their mean or in the
// proportions its counts give. A texel is the mean of its sub-texels, then the nearest of its materials' shades, so
// an edge between materials takes the in-between shades a reduced painting has.
import { clamp01, hash01, valueNoise } from './noise.ts';
import { log } from './portableMath.ts';
import { SCALE, type Surface } from './surface.ts';

/** A run kept apart from a material's own shades: a texel takes its shade nearest in light at `share`. */
export interface Accent {
  readonly share: number;
  readonly shades: Int16Array;
  readonly lum: readonly number[];
}

/** A picture's materials in the palette, each by its index. */
export interface PaletteShades {
  readonly rgb: Uint8Array;
  /** Each material's palette indices, darkest first. */
  readonly shades: readonly Int16Array[];
  readonly accents: readonly (readonly Accent[])[];
  /** Each material's share of texels for each of its shades, or null to spread them normally. */
  readonly weights: readonly (Float32Array | null)[];
  readonly lum: (index: number) => number;
}

/** How far each material's places spread over its shades: `share` of them, or none for the materials in `keep`,
 *  which stay as painted (a fire's white core stays white). */
export interface Spread {
  readonly share: number;
  readonly keep: ReadonlySet<number>;
}

/** The normal distribution's quantile (Acklam's rational approximation). */
function probit(chance: number): number {
  const clamped = Math.min(1 - 1e-6, Math.max(1e-6, chance));
  const a = [
    -39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239,
  ];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const tailA = [
    -0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968,
    2.938163982698783,
  ];
  const tailB = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const tail = (root: number): number =>
    (((((tailA[0] * root + tailA[1]) * root + tailA[2]) * root + tailA[3]) * root + tailA[4]) * root + tailA[5]) /
    ((((tailB[0] * root + tailB[1]) * root + tailB[2]) * root + tailB[3]) * root + 1);
  if (clamped < 0.02425) return tail(Math.sqrt(-2 * log(clamped)));
  if (clamped > 1 - 0.02425) return -tail(Math.sqrt(-2 * log(1 - clamped)));
  const centred = clamped - 0.5;
  const square = centred * centred;
  return (
    ((((((a[0] * square + a[1]) * square + a[2]) * square + a[3]) * square + a[4]) * square + a[5]) * centred) /
    (((((b[0] * square + b[1]) * square + b[2]) * square + b[3]) * square + b[4]) * square + 1)
  );
}

/** Places ranked darkest first, laid over a material's shades in the proportions `weights` gives them, each place
 *  set inside its shade by where it ranks there. */
function matchCounts(list: readonly number[], weights: Float32Array, pos: Float32Array): void {
  let total = 0;
  for (const weight of weights) total += weight;
  let shade = 0;
  let below = 0;
  list.forEach((i, rank) => {
    const quantile = ((rank + 0.5) / list.length) * total;
    while (shade < weights.length - 1 && below + weights[shade] < quantile) below += weights[shade++];
    pos[i] = shade - 0.5 + (quantile - below) / (weights[shade] || 1);
  });
}

/** Places a key's low bits hold; a picture holds fewer sub-texels than this. */
const PLACES = 2 ** 21;

/**
 * Sort places darkest first, a tie by place. Each is keyed by its tone's float32 bits, which order as the tones do
 * for tones in 0..1, above its place, so a plain numeric sort ranks them as comparing tone then place would.
 */
function byTone(list: number[], frac: Float32Array): void {
  if (frac.length > PLACES) {
    list.sort((a, b) => frac[a] - frac[b] || a - b);
    return;
  }
  const bits = new Uint32Array(frac.buffer, frac.byteOffset, frac.length);
  const keys = new Float64Array(list.length);
  for (let k = 0; k < list.length; k++) {
    const pattern = bits[list[k]];
    keys[k] = (pattern === 0x80000000 ? 0 : pattern) * PLACES + list[k];
  }
  keys.sort();
  for (let k = 0; k < list.length; k++) list[k] = keys[k] % PLACES;
}

/** Each place's position among its material's shades (0 the darkest). Materials sharing one set of weights (a
 *  stone and its mortar) rank as one. */
function shadePositions(surf: Surface, frac: Float32Array, palette: PaletteShades, spread: Spread): Float32Array {
  const shades = palette.shades;
  const pos = new Float32Array(frac.length);
  const groups = new Map<Float32Array | number, number[]>();
  for (let i = 0; i < frac.length; i++) {
    const key = palette.weights[surf.material[i]] ?? surf.material[i];
    const group = groups.get(key);
    if (group) group.push(i);
    else groups.set(key, [i]);
  }
  for (const list of groups.values()) {
    const material = surf.material[list[0]];
    const len = shades[material]?.length ?? 0;
    if (!len) continue;
    if (spread.keep.has(material)) {
      for (const i of list) pos[i] = frac[i] * (len - 1);
      continue;
    }
    byTone(list, frac);
    const weights = palette.weights[material];
    if (weights) {
      matchCounts(list, weights, pos);
      continue;
    }
    let mean = 0;
    for (const i of list) mean += frac[i];
    mean /= list.length;
    const sigma = (spread.share * (len - 1)) / 3.29;
    list.forEach((i, rank) => {
      pos[i] = mean * (len - 1) + probit((rank + 0.5) / list.length) * sigma;
    });
  }
  return pos;
}

/** The rendered picture: RGBA, the top row first, every texel opaque. */
export interface Rendered {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

/**
 * The surface as a picture: each place's colour off its material's shades at its rank, the texel the mean of its
 * sub-texels snapped to the nearest shade of its materials, accents at their share in small patches. `contrast`
 * scales the light; `seed` places the accents' patches.
 */
export function render(
  surf: Surface,
  contrast: number,
  palette: PaletteShades,
  seed: number,
  spread: Spread,
): Rendered {
  const n = surf.gridWidth * surf.gridHeight;
  const frac = new Float32Array(n);
  for (let i = 0; i < n; i++) frac[i] = clamp01(surf.tone[i] + surf.shade[i] * contrast);
  const pos = shadePositions(surf, frac, palette, spread);
  const rgb = palette.rgb;
  const rgba = new Uint8Array(surf.width * surf.height * 4);
  const counts = new Map<number, number>();
  for (let y = 0; y < surf.height; y++)
    for (let x = 0; x < surf.width; x++) {
      let red = 0;
      let green = 0;
      let blue = 0;
      counts.clear();
      for (let j = 0; j < SCALE; j++)
        for (let i = 0; i < SCALE; i++) {
          const place = (y * SCALE + j) * surf.gridWidth + x * SCALE + i;
          const material = surf.material[place];
          const shades = palette.shades[material];
          const position = pos[place];
          const lower = Math.max(0, Math.min(shades.length - 1, Math.floor(position)));
          const upper = Math.min(shades.length - 1, lower + 1);
          const along = clamp01(position - lower);
          const from = shades[lower] * 3;
          const to = shades[upper] * 3;
          red += rgb[from] * (1 - along) + rgb[to] * along;
          green += rgb[from + 1] * (1 - along) + rgb[to + 1] * along;
          blue += rgb[from + 2] * (1 - along) + rgb[to + 2] * along;
          counts.set(material, (counts.get(material) ?? 0) + 1);
        }
      red /= SCALE * SCALE;
      green /= SCALE * SCALE;
      blue /= SCALE * SCALE;
      const out = (y * surf.width + x) * 4;
      rgba[out + 3] = 255;
      // the nearest shade among this texel's materials, the first material found taking a tie
      let best = 0;
      let bestDist = Infinity;
      let major = 0;
      let most = 0;
      for (const [material, count] of counts) {
        if (count > most) {
          most = count;
          major = material;
        }
        for (const index of palette.shades[material]) {
          const dRed = rgb[index * 3] - red;
          const dGreen = rgb[index * 3 + 1] - green;
          const dBlue = rgb[index * 3 + 2] - blue;
          const dist = dRed * dRed + dGreen * dGreen + dBlue * dBlue;
          if (dist < bestDist) {
            bestDist = dist;
            best = index;
          }
        }
      }
      best = accented(palette, major, best, seed, surf, x, y);
      rgba[out] = rgb[best * 3];
      rgba[out + 1] = rgb[best * 3 + 1];
      rgba[out + 2] = rgb[best * 3 + 2];
    }
  return { width: surf.width, height: surf.height, rgba };
}

/**
 * The texel's shade after the major material's accents: an accent run takes it at its share, its shade nearest in
 * light. Accents come in patches of about three texels, a whole number across each side so the picture still tiles.
 */
function accented(
  palette: PaletteShades,
  major: number,
  best: number,
  seed: number,
  surf: Surface,
  x: number,
  y: number,
): number {
  const accents = palette.accents[major];
  if (!accents?.length) return best;
  const across = Math.max(1, Math.round(surf.width / 3));
  const down = Math.max(1, Math.round(surf.height / 3));
  const patch = valueNoise(seed + 5, (x * across) / surf.width, (y * down) / surf.height, across, down);
  let roll = clamp01((patch - 0.5) * 1.6 + 0.5) * 0.75 + hash01(seed + 3, x, y) * 0.25;
  for (const accent of accents) {
    if (roll < accent.share) {
      const lum = palette.lum(best);
      let pick = accent.shades[0];
      let pickDist = Infinity;
      accent.lum.forEach((value, j) => {
        if (Math.abs(value - lum) < pickDist) {
          pickDist = Math.abs(value - lum);
          pick = accent.shades[j];
        }
      });
      return pick;
    }
    roll -= accent.share;
  }
  return best;
}
