import { hideShade } from './cosmetics.ts';
import { type CoverLevels, coverColour, lightOf } from './coverLight.ts';
import { type Figure, type ForgeLooks, HORSE_LAYER, layerCellOf, layerPath, layersOf, lookCell } from './looks.ts';
import type { PaletteSnap, Rgb } from './dyes.ts';
import { type HairColours, type RaceSkins, hairRamp, raceSkinOf, toneSkinOf } from './skins.ts';

/** A decoded strip: RGBA, top row first. */
export interface Strip {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray | Uint8Array;
}

/** A composed frame: RGBA top row first, its size, the root (the feet) on it, each pixel's depth in metres (nearer is
 *  smaller; NaN where nothing is drawn), and a byte a pixel that is 1 where the weapon is drawn. */
export interface Frame {
  readonly width: number;
  readonly height: number;
  readonly root: readonly [number, number];
  readonly pixels: Uint8Array;
  readonly depth: Float32Array;
  readonly weapon: Uint8Array;
  /** A byte a pixel that is 1 where a layer in `held` is drawn, and nothing else of the weapon. */
  readonly held: Uint8Array;
}

/** The colour tables a frame is composed with: each race's skin and each hair colour, and the palette a finished
 *  frame is snapped to (none leaves it as composed). */
export interface Colours {
  readonly skins: RaceSkins;
  readonly hair: HairColours;
  readonly snap?: PaletteSnap;
}

/** The parts of the body a depth strip's blue names: none, torso, the arms, the head, the feet, a weapon, what hangs
 *  free, the horse under a rider, hair. */
export const PART = {
  none: 0,
  torso: 1,
  armL: 2,
  armR: 3,
  head: 6,
  footL: 7,
  footR: 8,
  weapon: 9,
  drape: 10,
  horse: 11,
  hair: 12,
} as const;
const NO_HANG = new Set<number>([PART.armL, PART.armR, PART.footL, PART.footR, PART.weapon]);
const FAR = 0x7fffffff;
/** How far behind the horse's hide a barding texel may lie and still be drawn over it, in metres: the forge renders
 *  a barding a little off the hide, while its far side and inside lie well behind the horse. */
const BARDING_CLEAR_M = 0.15;

/** Whether two layers' orders weigh where their texels meet: on one part (a shirt and the cuirass over it), or a
 *  drape over what it hangs over, never over an arm, a foot or a weapon, nor anything over a weapon. The horse is no
 *  part of the rider: depth alone decides there. */
export function ordersMeet(first: number, second: number): boolean {
  if (first === PART.horse || second === PART.horse) return false;
  if (first === PART.none || second === PART.none) return true;
  if (first === PART.weapon || second === PART.weapon) return false;
  if (first === second) return true;
  if (first === PART.drape) return !NO_HANG.has(second);
  if (second === PART.drape) return !NO_HANG.has(first);
  return false;
}

/**
 * One frame of a figure, composed as the forge's game draws it: each layer's cell (a row a view, a column a frame)
 * laid on the figure's cell by its root; at each pixel the nearest texel, a layer drawn nearer by its order where it
 * meets another on one part, armour over the clothes under it by its cover, a worn weapon and a drape by `under`.
 * The skin takes the race or the human tone, the hair its colour's ramp, a dyed layer's grey its dye's ramp (every
 * texel of a layer in `covers`, by where its light lies on the ramp), the horse's hide its coat's (its ramp under
 * HORSE_LAYER, `hideShade`); the frame is then snapped to the palette. The layers in `held` count as the weapon in
 * its mask, whatever part they name.
 */
export async function composeFrame(
  figure: Figure,
  anim: string,
  view: number,
  frame: number,
  looks: ForgeLooks,
  colours: Colours,
  ramps: Readonly<Record<string, readonly Rgb[]>>,
  strip: (path: string) => Promise<Strip | null>,
  held: ReadonlySet<string> = new Set(),
  covers: ReadonlyMap<string, CoverLevels> = new Map(),
): Promise<Frame | null> {
  const box = lookCell(figure, anim, looks);
  if (!box) return null;
  const [width, height] = box.cell;
  const scale = looks.depth?.scale ?? 10000;
  const bardingClear = Math.round(BARDING_CLEAR_M * scale);
  const weigh = (table: Readonly<Record<string, number>> | undefined, layer: string) =>
    Math.round((table?.[layer] ?? 0) * scale);
  const pixels = new Uint8Array(width * height * 4);
  const best = new Int32Array(width * height).fill(FAR);
  const bestBias = new Int32Array(width * height);
  const bestCover = new Int32Array(width * height);
  const bestUnder = new Int32Array(width * height);
  const bestPart = new Uint8Array(width * height);
  const bestHeld = new Uint8Array(width * height);
  const bestHorse = new Uint8Array(width * height);
  const worn = new Int32Array(width * height).fill(FAR);
  // From the side round to the back, a drape shows only its outside.
  const outside = view >= 2;
  const onBody = (spot: number, lies: number) => worn[spot] !== FAR && lies < (worn[spot] ?? FAR);
  const over = (spot: number, lies: number) => outside || onBody(spot, lies);
  const dyeable = new Set(looks.dye ?? []);
  const rgb = [0, 0, 0];
  for (const layer of layersOf(figure, anim, looks)) {
    const [colour, depth] = await Promise.all([
      strip(layerPath(figure.body, layer, anim)),
      strip(layerPath(figure.body, layer, anim, true)),
    ]);
    const own = layerCellOf(looks, figure.body, layer, anim);
    if (!colour || !depth || !own) continue;
    const [cellW, cellH] = own.cell;
    const shiftX = own.root[0] - box.root[0];
    const shiftY = own.root[1] - box.root[1];
    const bias = weigh(looks.order, layer);
    const cover = weigh(looks.cover, layer);
    const under = weigh(looks.under, layer);
    const holding = held.has(layer) ? 1 : 0;
    const horse = layer === HORSE_LAYER ? 1 : 0;
    const barding = layer === figure.barding;
    const hair =
      figure.hair?.layer === layer ? hairRamp(colours.hair, figure.body, figure.race, figure.hair.colour) : null;
    const ramp = hair ?? (dyeable.has(layer) ? (ramps[layer] ?? null) : null);
    const coat = layer === HORSE_LAYER ? (ramps[layer] ?? null) : null;
    const levels = ramp ? (covers.get(layer) ?? null) : null;
    const skin =
      figure.tone === null
        ? raceSkinOf(colours.skins, layer, figure.body, figure.race, view)
        : toneSkinOf(colours.skins, layer, figure.body, figure.tone, view);
    const column = Math.min(frame, own.frames - 1) * cellW;
    for (let row = 0; row < height; row++) {
      const cellY = row + shiftY;
      if (cellY < 0 || cellY >= cellH) continue;
      const line = (view * cellH + cellY) * colour.width + column;
      for (let across = 0; across < width; across++) {
        const cellX = across + shiftX;
        if (cellX < 0 || cellX >= cellW) continue;
        const source = (line + cellX) * 4;
        if (!colour.data[source + 3]) continue;
        const spot = row * width + across;
        const lies = (depth.data[source] ?? 0) * 256 + (depth.data[source + 1] ?? 0);
        const part = depth.data[source + 2] ?? 0;
        if (part !== PART.drape && part !== PART.horse && !under && lies < (worn[spot] ?? FAR)) worn[spot] = lies;
        const there = best[spot] ?? FAR;
        if (there !== FAR) {
          const theirPart = bestPart[spot] ?? 0;
          const meet = ordersMeet(part, theirPart);
          let mine = meet ? bias : 0;
          let theirs = meet ? (bestBias[spot] ?? 0) : 0;
          if (part === PART.torso && theirPart === PART.torso) {
            if (cover && (bestBias[spot] ?? 0) < bias) mine = cover;
            else if (bestCover[spot] && bias < (bestBias[spot] ?? 0)) theirs = bestCover[spot] ?? 0;
          }
          // A barding lies on the horse's hide, rendered a little clear of it: over the horse it is drawn unless it
          // lies further behind than that, as its far side and inside do.
          // A drape and a worn weapon: whether this texel is drawn, whatever the depths.
          let wins: boolean | null = barding && bestHorse[spot] ? lies - there <= bardingClear : null;
          const bare = worn[spot] === FAR;
          if (part === PART.drape && bestUnder[spot]) {
            if (bias <= (bestBias[spot] ?? 0)) {
              if (onBody(spot, there)) wins = false;
              else if (bare) theirs += bestUnder[spot] ?? 0;
            } else if (over(spot, lies)) wins = true;
          }
          if (theirPart === PART.drape && under) {
            if (bias >= (bestBias[spot] ?? 0)) {
              if (onBody(spot, lies)) wins = true;
              else if (bare) mine += under;
            } else if (over(spot, there)) wins = false;
          }
          if (wins === false || (wins === null && lies - mine >= there - theirs)) continue;
        }
        best[spot] = lies;
        bestBias[spot] = bias;
        bestCover[spot] = cover;
        bestUnder[spot] = under;
        bestPart[spot] = part;
        bestHeld[spot] = holding;
        bestHorse[spot] = horse;
        rgb[0] = colour.data[source] ?? 0;
        rgb[1] = colour.data[source + 1] ?? 0;
        rgb[2] = colour.data[source + 2] ?? 0;
        skin?.(rgb);
        if (coat) hideShade(rgb, coat);
        const grey = rgb[0] === rgb[1] && rgb[1] === rgb[2];
        // A ramp lies on a layer's greys, as the forge draws them for it; one that covers the layer lies on every texel
        // by its light, laid by its set's (`coverLevels`).
        const dyed = !ramp
          ? null
          : levels
            ? coverColour(ramp, levels[lightOf(rgb)] ?? 0)
            : grey
              ? ramp[Math.max(0, Math.min(15, ((rgb[0] ?? 0) * 16) >> 8))]
              : null;
        const out = spot * 4;
        pixels[out] = dyed?.[0] ?? rgb[0] ?? 0;
        pixels[out + 1] = dyed?.[1] ?? rgb[1] ?? 0;
        pixels[out + 2] = dyed?.[2] ?? rgb[2] ?? 0;
        pixels[out + 3] = 255;
      }
    }
  }
  colours.snap?.snap(pixels);
  const base = looks.depth?.base ?? -3;
  const metres = Float32Array.from(best, (lies) => (lies === FAR ? Number.NaN : lies / scale + base));
  const weapon = Uint8Array.from(bestPart, (part, spot) => (part === PART.weapon || bestHeld[spot] ? 1 : 0));
  return { width, height, root: box.root, pixels, depth: metres, weapon, held: bestHeld };
}
