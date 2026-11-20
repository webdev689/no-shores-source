// How a ramp that covers a piece whole is laid by light. Each piece is pooled with its set (every piece of its armour
// set and the padding under it; a weapon in hand with itself put away; a garment with each of its hangs), each read in
// the move it stands in, so a piece takes one shade whatever else is worn, in every move, picture and first person.
// The ramp is laid across the set's span of light, its darkest to the first step and its brightest to the last, so a
// set the forge drew dark and one drawn light both keep all their shading.

import type { Strip } from './compose.ts';
import { type ForgeLooks, layerPath } from './looks.ts';
import { ARMOUR_PIECES } from './outfit.ts';

/** The step of a 16-step covering ramp each light, 0 to 255, takes. */
export type CoverSteps = Uint8Array;

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
/** The narrowest span of light a covering ramp is stretched across. */
const SPAN_LEAST = 24;

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

/** Each strip's span of light, kept: a published strip never changes. */
const SPANS = new WeakMap<Strip, readonly [number, number] | null>();

/** A strip's span of light: its darkest and brightest drawn texels, leaving out the fiftieth at each end; none for a
 *  strip with nothing drawn. */
function spanOf(strip: Strip): readonly [number, number] | null {
  const kept = SPANS.get(strip);
  if (kept !== undefined) return kept;
  const counts = new Uint32Array(256);
  let drawn = 0;
  for (let texel = 0; texel < strip.data.length; texel += 4) {
    if ((strip.data[texel + 3] ?? 0) < 128) continue;
    counts[lightOf(strip.data.subarray(texel, texel + 3))] += 1;
    drawn += 1;
  }
  const edge = drawn * TRIM;
  let [low, high, seen] = [0, 255, 0];
  while (low < 255 && (seen += counts[low] ?? 0) <= edge) low += 1;
  seen = 0;
  while (high > low && (seen += counts[high] ?? 0) <= edge) high -= 1;
  const span = drawn === 0 ? null : ([low, high] as const);
  SPANS.set(strip, span);
  return span;
}

/** The step each light takes on a ramp covering a group: the span from the darkest of its pieces' spans to the
 *  brightest laid across the ramp, its darkest to the first step and its brightest to the last. A span too narrow
 *  to stretch, or none, keeps the light as it is. */
export function coverSteps(strips: readonly Strip[]): CoverSteps {
  const spans = strips.map(spanOf).filter((span) => span !== null);
  const low = Math.min(...spans.map(([darkest]) => darkest));
  const high = Math.max(...spans.map(([, brightest]) => brightest));
  const steps = new Uint8Array(256);
  for (let light = 0; light < 256; light++) {
    const share = spans.length === 0 || high - low < SPAN_LEAST ? light / 255 : (light - low) / (high - low);
    steps[light] = Math.max(0, Math.min(15, Math.round(share * 15)));
  }
  return steps;
}

/** The steps of each covered layer of `layers`, its group's strips read through `strip`. */
export async function coversOf(
  body: string,
  layers: readonly string[],
  looks: ForgeLooks,
  strip: (path: string) => Promise<Strip | null>,
): Promise<Map<string, CoverSteps>> {
  const covers = new Map<string, CoverSteps>();
  for (const layer of layers) {
    const found = await Promise.all(coverPaths(body, layer, looks).map(strip));
    const strips = found.filter((each): each is Strip => each !== null);
    if (strips.length > 0) covers.set(layer, coverSteps(strips));
  }
  return covers;
}
