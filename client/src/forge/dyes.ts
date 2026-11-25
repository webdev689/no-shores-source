import { oklab } from '../oklab.ts';

/** A colour, red, green and blue 0..255. */
export type Rgb = readonly [number, number, number];

/** Daggerfall's colours as the forge's figures take them (the forge's forgeDyes.json): the 256-colour palette every
 *  frame is snapped to, and the 16 colours, darkest first, each clothing dye and each metal lays the forge's greys on. */
export interface DyeTable {
  readonly palette: readonly Rgb[];
  readonly clothing: Readonly<Record<string, readonly Rgb[]>>;
  readonly armour: Readonly<Record<string, readonly Rgb[]>>;
}

/** The clothing dyes, in the order the forge's index numbers them. */
export const CLOTHING_DYES = [
  'Blue',
  'Grey',
  'Red',
  'DarkBrown',
  'Purple',
  'LightBrown',
  'White',
  'Aquamarine',
  'Yellow',
  'Green',
] as const;

/** The metal each armour set is coloured in. Leather's buckles and chain's mail take steel; a guild's set and a plain
 *  shield keep their own colours. */
export const METAL_OF_SET: Readonly<Record<string, string>> = {
  iron: 'Iron',
  steel: 'Steel',
  silver: 'Silver',
  elven: 'Elven',
  dwarven: 'Dwarven',
  mithril: 'Mithril',
  adamantium: 'Adamantium',
  ebony: 'Ebony',
  orcish: 'Orcish',
  daedric: 'Daedric',
  leather: 'Steel',
  chain: 'Steel',
};

/** The metal a metal layer is coloured in, by the set or metal its name ends with (`cuirass_iron`, `shield_kite_ebony`,
 *  `sheath_bow_long_elven`), or null for a set that keeps its own colours. */
export function metalOfLayer(layer: string): string | null {
  return METAL_OF_SET[layer.split('_').pop() ?? ''] ?? null;
}

/** How much more a step of hue counts than a step of light when finding the nearest palette colour. */
const HUE_WEIGHT = 4;
/** How far apart two OKLab lightnesses may be and count as one, past the rounding of the palette's kept lightness. */
export const LIGHTNESS_TOLERANCE = 1e-4;

/** Snaps pictures to Daggerfall's palette, as the forge's game lays its look on a composed frame: each drawn texel to
 *  the nearest of the palette's colours 1..255 (0 is a clear texel), nearest in OKLab with hue weighed above light. */
export class PaletteSnap {
  private readonly rgb: Uint8Array;
  private readonly lab: Float32Array;
  // Each colour texel 6 bits a channel and its nearest palette index, found as asked (-1 not yet).
  private readonly nearest = new Int16Array(1 << 18).fill(-1);

  constructor(palette: readonly Rgb[]) {
    this.rgb = new Uint8Array(256 * 3);
    this.lab = new Float32Array(256 * 3);
    palette.slice(0, 256).forEach((colour, index) => {
      this.rgb.set(colour, index * 3);
      this.lab.set(oklab(...colour), index * 3);
    });
  }

  private nearestIndex(red: number, green: number, blue: number): number {
    const [lightness, hueA, hueB] = oklab(red, green, blue);
    let best = 1;
    let bestDistance = Infinity;
    for (let index = 1; index < 256; index++) {
      const dLight = lightness - (this.lab[index * 3] ?? 0);
      const dHueA = hueA - (this.lab[index * 3 + 1] ?? 0);
      const dHueB = hueB - (this.lab[index * 3 + 2] ?? 0);
      const distance = dLight * dLight + HUE_WEIGHT * HUE_WEIGHT * (dHueA * dHueA + dHueB * dHueB);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    return best;
  }

  /** The palette colour nearest `colour` among those the snap keeps as they are and no darker than `least` (OKLab
   *  lightness), as a ramp's next step is chosen so that its light never falls; null where there is none. */
  nearestNoDarker(colour: Rgb, least: number): Rgb | null {
    const [lightness, hueA, hueB] = oklab(...colour);
    let best: Rgb | null = null;
    let bestDistance = Infinity;
    for (let index = 1; index < 256; index++) {
      if ((this.lab[index * 3] ?? 0) < least - LIGHTNESS_TOLERANCE) continue;
      const own = [this.rgb[index * 3] ?? 0, this.rgb[index * 3 + 1] ?? 0, this.rgb[index * 3 + 2] ?? 0] as const;
      const kept = Uint8Array.of(...own, 255);
      this.snap(kept);
      if (kept.subarray(0, 3).some((value, channel) => value !== own[channel])) continue;
      const dLight = lightness - (this.lab[index * 3] ?? 0);
      const dHueA = hueA - (this.lab[index * 3 + 1] ?? 0);
      const dHueB = hueB - (this.lab[index * 3 + 2] ?? 0);
      const distance = dLight * dLight + HUE_WEIGHT * HUE_WEIGHT * (dHueA * dHueA + dHueB * dHueB);
      if (distance < bestDistance) [best, bestDistance] = [own, distance];
    }
    return best;
  }

  /** Snaps an RGBA picture in place; clear texels (alpha 0) are left as they are. */
  snap(pixels: Uint8Array | Uint8ClampedArray): void {
    for (let texel = 0; texel < pixels.length; texel += 4) {
      if (!pixels[texel + 3]) continue;
      const [red, green, blue] = [
        (pixels[texel] ?? 0) >> 2,
        (pixels[texel + 1] ?? 0) >> 2,
        (pixels[texel + 2] ?? 0) >> 2,
      ];
      const key = (red << 12) | (green << 6) | blue;
      let index = this.nearest[key] ?? -1;
      if (index < 0) {
        index = this.nearestIndex(red * 4 + 2, green * 4 + 2, blue * 4 + 2);
        this.nearest[key] = index;
      }
      pixels[texel] = this.rgb[index * 3] ?? 0;
      pixels[texel + 1] = this.rgb[index * 3 + 1] ?? 0;
      pixels[texel + 2] = this.rgb[index * 3 + 2] ?? 0;
    }
  }
}
