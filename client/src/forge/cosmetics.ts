// The cosmetics a figure wears over its gear (content/gear/cosmetics.json): a dye laid on its armour, a coat on its
// horse and a barding over the horse, each read by its id. A dye's or a coat's look is four colours, darkest first,
// laid out as a 16-step ramp as the forge's metals and cloth dyes are; a barding's look is its forge layer.

import catalogue from '../../../content/gear/cosmetics.json' with { type: 'json' };
import factions from '../../../content/gear/factions.json' with { type: 'json' };
import { LIGHTNESS_TOLERANCE, PaletteSnap, type Rgb } from './dyes.ts';
import { oklab } from '../oklab.ts';

/** The three kinds of cosmetic. */
export type CosmeticKind = 'dye' | 'coat' | 'barding';

/** How a cosmetic is had: from the start, sold (its price and the level it is sold from), or a faction's rank. */
export interface CosmeticSource {
  readonly kind: string;
  readonly aurem?: number;
  readonly level?: number;
  readonly faction?: number;
  readonly rank?: number;
}

/** One cosmetic as the catalogue keeps it. */
export interface Cosmetic {
  readonly id: string;
  readonly kind: CosmeticKind;
  readonly name: string;
  readonly rarity: string;
  readonly source: CosmeticSource;
  readonly words: string;
  readonly look: readonly string[];
}

/** Every cosmetic, in the catalogue's order, which numbers them on the wire. */
export const COSMETICS = catalogue.cosmetics as readonly Cosmetic[];
const BY_ID = new Map(COSMETICS.map((each) => [each.id, each]));

/** The cosmetic an id names, or null for none. */
export const cosmeticOf = (id: string | null | undefined): Cosmetic | null => (id ? (BY_ID.get(id) ?? null) : null);

/** The steps of a ramp each of a look's four colours stands at. */
const ANCHOR_STEPS = [0, 5, 10, 15];

const channels = (hex: string): Rgb =>
  [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)) as unknown as Rgb;

/** A look of four colours, darkest first, as a 16-step ramp: each colour at its step, the steps between it and the
 *  next a share of the way. */
export function rampOf(look: readonly string[]): readonly Rgb[] {
  const anchors = look.map(channels);
  return Array.from({ length: 16 }, (_unused, step) => {
    const after = Math.max(
      1,
      ANCHOR_STEPS.findIndex((place) => place >= step),
    );
    const [from, to] = [ANCHOR_STEPS[after - 1] ?? 0, ANCHOR_STEPS[after] ?? 15];
    const share = (step - from) / (to - from);
    const [low, high] = [anchors[after - 1] ?? [0, 0, 0], anchors[after] ?? [0, 0, 0]];
    return low.map((value, channel) => Math.round(value + ((high[channel] ?? 0) - value) * share)) as unknown as Rgb;
  });
}

/** A look's ramp snapped to the palette, as every composed frame is, so that the figure, the first person, the
 *  Appearance screen and a keeper's swatch draw the same sixteen colours. The snap reads a colour to six bits a
 *  channel, so a few palette colours snap to a neighbour: snapping again until nothing moves leaves a ramp the
 *  composer's own snap keeps as it is. When `rising`, a step the snap would leave darker than the one before it takes
 *  the nearest kept colour no darker, so a ramp's light rises step by step, as its shading does. */
function snappedRampOf(look: readonly string[], snap: PaletteSnap, rising: boolean): readonly Rgb[] {
  const ramp = rampOf(look);
  const pixels = Uint8Array.from(ramp.flatMap((colour) => [...colour, 255]));
  for (let round = 0, before = ''; round < 8 && before !== pixels.join(); round++) {
    before = pixels.join();
    snap.snap(pixels);
  }
  const snapped: Rgb[] = [];
  if (!rising)
    for (let step = 0; step < 16; step++) snapped.push([...pixels.slice(step * 4, step * 4 + 3)] as unknown as Rgb);
  for (let step = snapped.length; step < 16; step++) {
    const own = [...pixels.slice(step * 4, step * 4 + 3)] as unknown as Rgb;
    const before = snapped[step - 1];
    const least = before ? oklab(...before)[0] : 0;
    snapped.push(
      oklab(...own)[0] >= least - LIGHTNESS_TOLERANCE
        ? own
        : (snap.nearestNoDarker(ramp[step] ?? own, least) ?? before ?? own),
    );
  }
  return snapped;
}

/** The dyes' and coats' ramps by their ids, and the factions' colours by their keys, on one palette. */
interface Ramps {
  readonly cosmetics: ReadonlyMap<string, readonly Rgb[]>;
  readonly factions: ReadonlyMap<string, readonly Rgb[]>;
}
/** Each palette's ramps, made the first time it is asked for, so each ramp is one array however often asked. */
const RAMPS = new WeakMap<readonly Rgb[], Ramps>();

function rampsOn(palette: readonly Rgb[]): Ramps {
  const found = RAMPS.get(palette);
  if (found) return found;
  // A table with no palette (a test's) snaps nothing.
  const snap = palette.length > 0 ? new PaletteSnap(palette) : null;
  // A faction's colour is snapped as it was chosen, its steps as they fall; a dye's and a coat's rise.
  const ramp = (look: readonly string[], rising = true) => (snap ? snappedRampOf(look, snap, rising) : rampOf(look));
  const made: Ramps = {
    cosmetics: new Map(
      COSMETICS.filter((each) => each.kind !== 'barding' && each.look.length === 4).map((each) => [
        each.id,
        ramp(each.look),
      ]),
    ),
    factions: new Map(factions.factions.map((faction) => [faction.key, ramp(faction.gear.look, false)])),
  };
  RAMPS.set(palette, made);
  return made;
}

/** A dye's or a coat's ramp by its id, on `palette` (the forge's, Daggerfall's), or null for one that keeps the
 *  figure's or the horse's own colours. */
export const cosmeticRamp = (id: string | null | undefined, palette: readonly Rgb[]): readonly Rgb[] | null =>
  rampsOn(palette).cosmetics.get(id ?? '') ?? null;

/** A faction's own colour as a ramp on `palette`, by its key, or null for anything else: a look no dye sells, which
 *  only its armour and weapons wear. */
export const factionRamp = (key: string | null | undefined, palette: readonly Rgb[]): readonly Rgb[] | null =>
  rampsOn(palette).factions.get(key ?? '') ?? null;

/** A barding's forge layer by its id (`horse_warhorse`), or null for the bare horse or no barding. */
export function bardingLayer(id: string | null | undefined): string | null {
  const found = cosmeticOf(id);
  return found?.kind === 'barding' ? (found.look[0] ?? null) : null;
}

/** A barding layer's look as the ride's pictures name it (`horse_warhorse` is `warhorse`). */
export const bardingLook = (layer: string): string => layer.replace(/^horse_/, '');

/** The id of the cosmetic of `kind` worn by its wire number, or null for one that changes nothing drawn (a start
 *  piece's own colours, the Bay's own hide), another kind's number or none. */
export function wornCosmetic(number: number | undefined, kind: CosmeticKind): string | null {
  const found = number === undefined ? undefined : COSMETICS[number];
  return found?.kind === kind && found.look.length > 0 ? found.id : null;
}

/** Which texels of a horse picture are the hide a coat takes, by their hue in degrees and their light, and the hide's
 *  light that takes a coat's lightest step. */
export interface HideTest {
  readonly takes: (hue: number, light: number) => boolean;
  readonly top: number;
}

/** The third person's horse: its hide's hues; its tack is redder and its blanket red, its mane grey. The bay's own
 *  catches the light no brighter than its top. */
export const FIGURE_HIDE: HideTest = { takes: (hue) => hue >= 25 && hue < 65, top: 128 };
/** The ride's horse from the saddle, measured on the forge's ride strips against their hide mask: its lit hide sits at
 *  hues 20 to 25 among its bridle's, which is darker, so there only a light that bright is hide; the redder and the
 *  grey are its tack, its mane and its ears' insides, and the shadows under 40 as much tack as hide. Those strips are
 *  lit brighter than the figure's horse (a median light of 96 to its 63, a 90th percentile of 131 to its 89), so
 *  their top is higher by as much and a coat takes the same steps from the saddle as on the figure. */
export const RIDE_HIDE: HideTest = {
  takes: (hue, light) => hue >= 20 && hue < 65 && light >= (hue < 25 ? 65 : 40),
  top: 188,
};

/**
 * Lays a coat's ramp on a texel of the horse's hide, in place, by the horse's own light, as a dyed garment's greys take
 * their dye; a texel `hide` takes for its tack, blanket or mane is left as it is.
 */
export function hideShade(rgb: number[], ramp: readonly Rgb[], hide: HideTest = FIGURE_HIDE): void {
  const [red = 0, green = 0, blue = 0] = rgb;
  const [most, least] = [Math.max(red, green, blue), Math.min(red, green, blue)];
  if (most === least || most !== red) return;
  const hue = ((green - blue) / (most - least)) * 60;
  const light = 0.299 * red + 0.587 * green + 0.114 * blue;
  if (!hide.takes(hue, light)) return;
  const shade = ramp[Math.max(0, Math.min(15, Math.floor((light / hide.top) * 16)))];
  if (shade) [rgb[0], rgb[1], rgb[2]] = shade;
}
