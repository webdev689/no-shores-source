import type { Strip } from '../forge/compose.ts';
import { RIDE_HIDE, bardingLayer, bardingLook, cosmeticRamp, hideShade } from '../forge/cosmetics.ts';
import type { Rgb } from '../forge/dyes.ts';
import { type FrameSource, type Picture, layOver, paintSet } from './fpFrames.ts';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from './fpMotion.ts';

/** How the horse goes: standing, walking or galloping. */
export type Gait = 'stand' | 'walk' | 'gallop';
/** A turn of the horse's head, toward the rider's left or right, or none. */
export type Turn = '' | 'L' | 'R';
/** One of the forged ride's shots: its strip (a gait or an ear's flick), its frame, its turn and its name. */
export interface RideShot {
  readonly strip: string;
  readonly k: number;
  readonly turn: Turn;
  readonly key: string;
}

/** Each gait's frames, and each ear flick's, as the forge drew the ride. */
const GAIT_FRAMES: Readonly<Record<Gait, number>> = { stand: 1, walk: 4, gallop: 4 };
const FIDGETS = { earL: 3, earR: 3 } as const;
/** A stride's frame lasts as long as the rider's own figure's ride frame: a walk's or a gallop's. */
const STRIDE_FRAME: Readonly<Record<Gait, number>> = { stand: 1, walk: 0.125, gallop: 0.0625 };
/** An ear flick's frame, and the seconds between flicks while the horse stands (the least and the most). */
const FIDGET_FRAME = 0.11;
const FIDGET_GAP = [3, 9] as const;
/** Radians a second of the look's turn that read as a turn, and how long a turn is held past it. */
const TURN_RATE = 0.7;
const TURN_HOLD = 0.25;

export const rideShotKey = (strip: string, k: number, turn: Turn = '') => `${strip}-${k}${turn ? `_t${turn}` : ''}`;

/** The ride's motion: which shot the horse and the hands show. A stride steps on its own clock; turning faster than
 *  a walk's look draws the head into the turn, held a moment so a stutter does not flicker it; standing still and not
 *  turning, the horse now and then flicks an ear. */
export class RideMotion {
  private readonly random: () => number;
  private clock = 0;
  private lastYaw: number | null = null;
  private turn: Turn = '';
  private held = 0;
  private fidget: { name: keyof typeof FIDGETS; seconds: number } | null = null;
  private wait: number;

  constructor(random: () => number = Math.random) {
    this.random = random;
    this.wait = this.gap();
  }

  private gap(): number {
    return FIDGET_GAP[0] + (FIDGET_GAP[1] - FIDGET_GAP[0]) * this.random();
  }

  step(seconds: number, gait: Gait, yaw: number | null): RideShot {
    this.clock += Math.max(0, seconds);
    if (yaw !== null && this.lastYaw !== null && seconds > 0) {
      const rate = Math.atan2(Math.sin(yaw - this.lastYaw), Math.cos(yaw - this.lastYaw)) / seconds;
      if (Math.abs(rate) > TURN_RATE) [this.turn, this.held] = [rate > 0 ? 'R' : 'L', TURN_HOLD];
      else if ((this.held -= seconds) <= 0) this.turn = '';
    }
    this.lastYaw = yaw;
    if (gait !== 'stand' || this.turn) this.fidget = null;
    else if (this.fidget) this.fidget.seconds += seconds;
    else if ((this.wait -= seconds) <= 0) {
      const names = Object.keys(FIDGETS) as (keyof typeof FIDGETS)[];
      this.fidget = {
        name: names[Math.min(names.length - 1, Math.floor(this.random() * names.length))] ?? 'earL',
        seconds: 0,
      };
    }
    if (this.fidget) {
      const k = Math.floor(this.fidget.seconds / FIDGET_FRAME);
      if (k < FIDGETS[this.fidget.name])
        return { strip: this.fidget.name, k, turn: '', key: rideShotKey(this.fidget.name, k) };
      [this.fidget, this.wait] = [null, this.gap()];
    }
    const count = GAIT_FRAMES[gait];
    const k = Math.floor(this.clock / STRIDE_FRAME[gait]) % count;
    return { strip: gait, k, turn: this.turn, key: rideShotKey(gait, k, this.turn) };
  }
}

/** A side of the screen a hand is on; the left is drawn as a right hand turned back about the screen's middle. */
export type Side = 'R' | 'L';
/** The beat each hand gives on through a stride, the left a beat behind the right. */
const FIST_PHASE: Readonly<Record<Side, number>> = { R: 0, L: 1 };

/** The fist a hand holds in a shot: steering in a turn (the inside hand draws in, the other gives), the stride's beat
 *  on the move, else still. */
export function fistPoseOf(shot: RideShot, side: Side): string {
  if (shot.turn) return shot.turn === side ? 'steerIn' : 'steerOut';
  if (shot.strip === 'walk' || shot.strip === 'gallop') return `${shot.strip}-${(shot.k + FIST_PHASE[side]) % 4}`;
  return 'stand-0';
}

export const ridePath = (key: string) => `@art/ride/RIDE_${key}.png`;
export const reinPath = (key: string, side: Side) => `@art/ride/REIN_${key}_${side}.png`;
export const fistPath = (pose: string, side: Side, set: string | null) =>
  `@art/ride/FIST_${pose}_${side}${set ? `_${set}` : ''}.png`;

/** The ride's texels are this much as wide as tall on the screen, as Daggerfall drew its riding picture. */
export const RIDE_TEXEL_WIDTH = 0.8;
/** How far a gallop's frames are eased toward one height: each sunk this share of the rows its ears stand above the
 *  gait's lowest. The forged gallop lifts the ears far more than Daggerfall's picture did. */
const GALLOP_EASE = 0.5;

const topRow = (pixels: ArrayLike<number>, width: number, height: number) => {
  for (let row = 0; row < height; row++)
    for (let column = 0; column < width; column++) if ((pixels[(row * width + column) * 4 + 3] ?? 0) >= 128) return row;
  return height;
};

/** How many rows the shot's horse and the hands with it are sunk. */
export async function rideSink(source: FrameSource, shot: RideShot): Promise<number> {
  if (shot.strip !== 'gallop') return 0;
  const strips = await Promise.all(
    Array.from({ length: GAIT_FRAMES.gallop }, (_unused, k) => source.strip(ridePath(rideShotKey('gallop', k)))),
  );
  const tops = strips.map((strip) => (strip ? topRow(strip.data, strip.width, strip.height) : 0));
  const lowest = Math.max(...tops);
  return Math.round((lowest - (tops[shot.k] ?? lowest)) * GALLOP_EASE);
}

/** A ride picture centred on the screen, its foot on the screen's foot and sunk `sink` rows. */
function centred(pixels: Uint8Array, width: number, height: number, sink: number): Picture {
  const corner = [(DESIGN_WIDTH - width * RIDE_TEXEL_WIDTH) / 2, DESIGN_HEIGHT - height + sink] as const;
  return { width, height, pixels, at: corner };
}

/** The horse's head and neck from the saddle in the shot, as the forge graded it, on Daggerfall's colours: its hide in
 *  the coat worn (none keeps the bay's), the barding worn laid over it. */
export async function horsePicture(
  source: FrameSource,
  shot: RideShot,
  coat: string | null = null,
  barding: string | null = null,
): Promise<Picture | null> {
  const layer = bardingLayer(barding);
  const [strip, over, sink] = await Promise.all([
    source.strip(ridePath(shot.key)),
    layer ? source.strip(ridePath(`${shot.key}_${bardingLook(layer)}`)) : Promise.resolve(null),
    rideSink(source, shot),
  ]);
  if (!strip) return null;
  const ramp = cosmeticRamp(coat, source.dyes.palette);
  const pixels = source.painter.paint(ramp ? coated(strip, ramp) : strip, null);
  if (over && over.width === strip.width && over.height === strip.height)
    layOver(pixels, source.painter.paint(over, null));
  return centred(pixels, strip.width, strip.height, sink);
}

/** A ride strip with a coat laid on the horse's hide, by its own light, as the third person's horse takes it, told
 *  from its bridle as the ride's colours tell it. */
function coated(strip: Strip, ramp: readonly Rgb[]): Strip {
  const data = Uint8ClampedArray.from(strip.data);
  const rgb = [0, 0, 0];
  for (let texel = 0; texel < data.length; texel += 4) {
    if (!data[texel + 3]) continue;
    [rgb[0], rgb[1], rgb[2]] = [data[texel] ?? 0, data[texel + 1] ?? 0, data[texel + 2] ?? 0];
    hideShade(rgb, ramp, RIDE_HIDE);
    data.set(rgb, texel);
  }
  return { ...strip, data };
}

/** A hand on the reins in the shot: its rein from the fist to the bit, undyed, with the fist over it in the gauntlets
 *  worn (the leather glove's with none, a set in its own colours keeping them). */
export async function reinPicture(
  source: FrameSource,
  shot: RideShot,
  side: Side,
  hands: string | null,
): Promise<Picture | null> {
  const pose = fistPoseOf(shot, side);
  const [rein, own, glove, sink] = await Promise.all([
    source.strip(reinPath(shot.key, side)),
    hands ? source.strip(fistPath(pose, side, hands)) : Promise.resolve(null),
    source.strip(fistPath(pose, side, null)),
    rideSink(source, shot),
  ]);
  const fist = own ?? glove;
  if (!rein || !fist || fist.width !== rein.width || fist.height !== rein.height) return null;
  const pixels = source.painter.paint(rein, null);
  const fistPixels = own ? paintSet(source, fist, hands, 'Steel') : source.painter.paint(fist, null);
  for (let texel = 0; texel < pixels.length; texel += 4)
    if (fistPixels[texel + 3]) pixels.set(fistPixels.subarray(texel, texel + 4), texel);
  return centred(pixels, rein.width, rein.height, sink);
}

/** Where a ride picture lies: at its corner, its texels narrowed to the ride's width, the left hand's turned back about
 *  the screen's middle. */
export function ridePlace(flip: boolean) {
  return (picture: Picture) => ({
    x: picture.at[0],
    y: picture.at[1],
    width: picture.width * RIDE_TEXEL_WIDTH,
    height: picture.height,
    flip,
  });
}

/** The ride's shots worth composing ahead: each gait's frames, straight on. */
export const RIDE_AHEAD: readonly RideShot[] = (Object.keys(GAIT_FRAMES) as Gait[]).flatMap((gait) =>
  Array.from({ length: GAIT_FRAMES[gait] }, (_unused, k) => ({
    strip: gait,
    k,
    turn: '' as const,
    key: rideShotKey(gait, k),
  })),
);
