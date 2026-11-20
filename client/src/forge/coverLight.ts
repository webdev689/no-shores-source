// How a ramp that covers a piece whole is laid by light. Each piece is pooled with its set (every piece of its armour
// set and the padding under it; a weapon in hand with itself put away; a garment with each of its hangs), each read in
// the move it stands in, so a piece takes one shade whatever else is worn, in every move, picture and first person.
// The ramp is laid by the set's own light: each colour the ramp draws holds as many of its texels, so a set the forge
// drew in a narrow band of light keeps its detail across the whole ramp, and steps the palette draws alike take no more
// of a piece than any other colour does.

import type { Strip } from './compose.ts';
import type { Rgb } from './dyes.ts';
import { type ForgeLooks, layerPath } from './looks.ts';
import { ARMOUR_PIECES } from './outfit.ts';

/** Where on a covering ramp each light, 0 to 255, lies: 0 its darkest end to 255 its brightest. */
export type CoverLevels = Uint8Array;

/** A piece of an armour set, or the padding under one: its set. */
const ARMOUR = new RegExp(`^(?:${ARMOUR_PIECES.join('|')}|under)_([a-z]+)$`);
/** A weapon or shield put away, on the back or at the hip. */
const PUT_AWAY = /^(sheath|slung)_/;
/** What hangs from a garment, by what it hangs over. */
const HANG = /_(drape|plated_skirted|plated|skirted)$/;
const HANGS = ['drape', 'plated', 'skirted', 'plated_skirted'];
/** The moves a piece stands in, by what is in hand: the first the forge draws a layer in is the one it is read in. */
const STANDING = ['idle', 'idle_bow', 'idle_staff', 'guard'];
/** The share of a set's texels left out at each end of its light, so a stray glint or shadow stretches nothing. */
const TRIM = 1 / 50;

/** The layers a covered layer is pooled with, among those `drawn` for its body. */
export function coverGroup(layer: string, drawn: Readonly<Record<string, readonly string[]>>): string[] {
  const set = ARMOUR.exec(layer)?.[1];
  const own = layer.replace(PUT_AWAY, '').replace(HANG, '');
  const named = set
    ? [...ARMOUR_PIECES, 'under'].map((piece) => `${piece}_${set}`)
    : [own, `slung_${own}`, `sheath_${own}`, ...HANGS.map((hang) => `${own}_${hang}`)];
  return named.filter((each) => (drawn[each]?.length ?? 0) > 0);
}

/** The colour strips a covered layer's light is read from: each of its group's in the move it stands in. */
export function coverPaths(body: string, layer: string, looks: ForgeLooks): string[] {
  const drawn = looks.bodies[body]?.layers ?? {};
  return coverGroup(layer, drawn).map((each) => {
    const moves = drawn[each] ?? [];
    return layerPath(body, each, STANDING.find((move) => moves.includes(move)) ?? moves[0] ?? 'idle');
  });
}

/** A texel's light, 0 to 255, as the eye weighs its channels. */
export const lightOf = (rgb: ArrayLike<number>): number =>
  Math.round(0.299 * (rgb[0] ?? 0) + 0.587 * (rgb[1] ?? 0) + 0.114 * (rgb[2] ?? 0));

/** Each strip's drawn texels counted by light, kept: a published strip never changes. */
const COUNTS = new WeakMap<Strip, Uint32Array>();

function countsOf(strip: Strip): Uint32Array {
  const kept = COUNTS.get(strip);
  if (kept) return kept;
  const counts = new Uint32Array(256);
  for (let texel = 0; texel < strip.data.length; texel += 4)
    if ((strip.data[texel + 3] ?? 0) >= 128) counts[lightOf(strip.data.subarray(texel, texel + 3))] += 1;
  COUNTS.set(strip, counts);
  return counts;
}

/** Each group's levels, kept by its first strip and checked against the rest. */
const POOLED = new WeakMap<Strip, { readonly strips: readonly Strip[]; readonly levels: CoverLevels }[]>();

/** Where each light lies on a ramp covering a group, from its strips' texels pooled: the darkest and brightest
 *  fiftieth left out, and each light between at its share of the texels darker than it, so every share of the ramp
 *  holds as many. */
export function coverLevels(strips: readonly Strip[]): CoverLevels {
  const [first] = strips;
  const known = first ? POOLED.get(first) : undefined;
  const found = known?.find(
    (each) => each.strips.length === strips.length && each.strips.every((kept, index) => kept === strips[index]),
  );
  if (found) return found.levels;
  const counts = new Uint32Array(256);
  for (const strip of strips) countsOf(strip).forEach((count, light) => (counts[light] += count));
  const total = counts.reduce((sum, count) => sum + count, 0);
  const edge = total * TRIM;
  let [low, high, seen] = [0, 255, 0];
  while (low < 255 && (seen += counts[low] ?? 0) <= edge) low += 1;
  seen = 0;
  while (high > low && (seen += counts[high] ?? 0) <= edge) high -= 1;
  let kept = 0;
  for (let light = low; light <= high; light++) kept += counts[light] ?? 0;
  const levels = new Uint8Array(256);
  let below = 0;
  for (let light = 0; light < 256; light++) {
    const count = light >= low && light <= high ? (counts[light] ?? 0) : 0;
    const share =
      total === 0 ? light / 256 : light < low ? 0 : light > high ? 1 : (below + count / 2) / Math.max(1, kept);
    levels[light] = Math.min(255, Math.floor(share * 256));
    below += count;
  }
  if (first) POOLED.set(first, [...(known ?? []), { strips: [...strips], levels }]);
  return levels;
}

/** Where each light lies on the ramp of each covered layer of `layers`, its group's strips read through `strip`. */
export async function coversOf(
  body: string,
  layers: readonly string[],
  looks: ForgeLooks,
  strip: (path: string) => Promise<Strip | null>,
): Promise<Map<string, CoverLevels>> {
  const covers = new Map<string, CoverLevels>();
  for (const layer of layers) {
    const found = await Promise.all(coverPaths(body, layer, looks).map(strip));
    const strips = found.filter((each): each is Strip => each !== null);
    if (strips.length > 0) covers.set(layer, coverLevels(strips));
  }
  return covers;
}

/** Each ramp's colours in order, a run of steps the palette draws alike kept once. */
const COLOURS = new WeakMap<readonly Rgb[], readonly Rgb[]>();

/** The colour of a covering ramp at `level` (`CoverLevels`): its distinct colours each hold as much of the way. */
export function coverColour(ramp: readonly Rgb[], level: number): Rgb | undefined {
  let colours = COLOURS.get(ramp);
  if (!colours) {
    colours = ramp.filter((colour, step) => step === 0 || colour.join() !== ramp[step - 1]?.join());
    COLOURS.set(ramp, colours);
  }
  return colours[Math.min(colours.length - 1, Math.floor((level * colours.length) / 256))];
}
