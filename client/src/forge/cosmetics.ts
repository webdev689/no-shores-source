// The cosmetics a figure wears over its gear (content/gear/cosmetics.json): a dye laid on its armour, a coat on its
// horse and a barding over the horse, each read by its id. A dye's or a coat's look is four colours, darkest first,
// laid out as a 16-step ramp as the forge's metals and cloth dyes are; a barding's look is its forge layer.

import catalogue from '../../../content/gear/cosmetics.json' with { type: 'json' };
import type { Rgb } from './dyes.ts';

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

/** A dye's or a coat's ramp by its id, or null for one that keeps the figure's or the horse's own colours. */
export function cosmeticRamp(id: string | null | undefined): readonly Rgb[] | null {
  const found = cosmeticOf(id);
  return found && found.kind !== 'barding' && found.look.length === 4 ? rampOf(found.look) : null;
}

/** A barding's forge layer by its id (`horse_warhorse`), or null for the bare horse or no barding. */
export function bardingLayer(id: string | null | undefined): string | null {
  const found = cosmeticOf(id);
  return found?.kind === 'barding' ? (found.look[0] ?? null) : null;
}

/** A barding layer's look as the ride's pictures name it (`horse_warhorse` is `warhorse`). */
export const bardingLook = (layer: string): string => layer.replace(/^horse_/, '');

/** The id of the cosmetic of `kind` worn by its wire number, or null for the start piece (its own colours), another
 *  kind's number or none. */
export function wornCosmetic(number: number | undefined, kind: CosmeticKind): string | null {
  const found = number === undefined ? undefined : COSMETICS[number];
  return found?.kind === kind && found.source.kind !== 'start' ? found.id : null;
}

/** The hues of the horse's hide, in degrees: its tack is redder and its blanket red, its mane grey. */
const HIDE_HUES = [25, 65] as const;
/** The hide's light that takes a coat's lightest step: the bay's own catches the light no brighter. */
const HIDE_TOP = 128;

/**
 * Lays a coat's ramp on a texel of the horse's hide, in place, by the horse's own light, as a dyed garment's greys take
 * their dye; a texel of its tack, blanket or mane is left as it is.
 */
export function hideShade(rgb: number[], ramp: readonly Rgb[]): void {
  const [red = 0, green = 0, blue = 0] = rgb;
  const [most, least] = [Math.max(red, green, blue), Math.min(red, green, blue)];
  if (most === least || most !== red) return;
  const hue = ((green - blue) / (most - least)) * 60;
  if (hue < HIDE_HUES[0] || hue >= HIDE_HUES[1]) return;
  const light = 0.299 * red + 0.587 * green + 0.114 * blue;
  const shade = ramp[Math.max(0, Math.min(15, Math.floor((light / HIDE_TOP) * 16)))];
  if (shade) [rgb[0], rgb[1], rgb[2]] = shade;
}
