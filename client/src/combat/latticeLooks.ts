// What the Lattice's pictures leave for the game to draw, since a picture's light cannot change from frame to frame:
// its death wave, tinted in the foe's crystal and scaled to its size; the
// Idol's lens glowing through its charge and its beam; the Bulwark's core flaring before it discharges; and the shards
// the Ravager throws. Drawn as the fight's effects are, cell by cell in four stops. Drawing only: the rules are the
// room's.
import { type Texels, spriteOfTexels } from './forgedBirds.ts';
import { cached, layLine, layUpright, ringSprite } from './impactPixels.ts';
import { HURL_FIRST_THROW, type Strain } from './lattice.ts';
import { type Ramp, rampOf } from './markSprites.ts';
import { BODY, CELL_M, CLEAR, DARK, HOT, LIGHT, type Sprite, sprite } from './spellPixels.ts';

type Point = readonly [number, number, number];

/** Each crystal's four stops: the purple of its shadows, its body, its light and its white-hot heart. */
export const CRYSTAL: Readonly<Record<Strain, Ramp>> = {
  red: rampOf('#3b1236', '#8c1c2c', '#d4545a', '#f4dede'),
  purple: rampOf('#24103a', '#5c2a80', '#a865d0', '#efe0f8'),
};

/** The wave as wave.py draws it: its frames, each this size with the feet at `root` (pixels), at the forge's 62 a
 *  metre; shown this long a frame. The figure fades over its first frames, its crystal flung out. */
export const WAVE = { frames: 10, cell: [320, 200] as const, root: [160, 164] as const, frameS: 1 / 15, fadeS: 0.3 };
/** Where each wave frame lies among the forge's published pictures. */
export const wavePath = (frame: number) => `@art/lattice/wave-${frame}.png`;
/** How many times a man's size the wave is as the fissure is sealed. */
export const SEAL_SCALE = 4;

/** A forge picture halved, each texel the mean of four, so a wave cell is a spell's: two figure pixels across. */
export function halved(texels: Texels): Texels {
  const width = Math.floor(texels.width / 2);
  const height = Math.floor(texels.height / 2);
  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++)
    for (let column = 0; column < width; column++)
      for (let channel = 0; channel < 4; channel++) {
        let sum = 0;
        for (const [down, across] of [
          [0, 0],
          [0, 1],
          [1, 0],
          [1, 1],
        ] as const)
          sum += texels.data[((row * 2 + down) * texels.width + column * 2 + across) * 4 + channel] ?? 0;
        data[(row * width + column) * 4 + channel] = Math.round(sum / 4);
      }
  return { width, height, data };
}

const waveFrames = new Map<number, Sprite>();

/** Fetches the wave's frames from the forge's published pictures through `strip`; until all have come no wave is
 *  drawn, and a Lattice foe killed only fades. */
export function loadLatticeWave(strip: (path: string) => Promise<Texels | null>): void {
  for (let frame = 0; frame < WAVE.frames; frame++)
    strip(wavePath(frame))
      .then((texels) => {
        if (texels) waveFrames.set(frame, spriteOfTexels(halved(texels)));
      })
      .catch(() => undefined);
}

/** Whether every frame of the wave has come. */
export const waveReady = (): boolean => waveFrames.size === WAVE.frames;

/** Lays wave frame `frame` at `feet`, `scale` times a man's size, in `ramp`, seen from `eye`; nothing before its
 *  frames have come. */
export function layWave(out: number[], frame: number, feet: Point, scale: number, ramp: Ramp, eye: Point): void {
  const picture = waveReady() ? waveFrames.get(frame) : undefined;
  if (!picture) return;
  const cell = CELL_M * scale;
  // The picture is laid about its middle: raised so its root, the feet, lands on them.
  const up = (WAVE.root[1] / 2 - picture.height / 2) * cell;
  layUpright(out, picture, ramp, [feet[0], feet[1], feet[2] + up], eye, cell);
}

interface Burst {
  readonly from: Point;
  readonly ramp: Ramp;
  readonly scale: number;
  readonly start: number;
}

/** The waves playing: each foe of the Lattice killed, and the fissure sealed. */
export class LatticeWaves {
  private bursts: Burst[] = [];

  /** A wave bursts from `from` at page time `clock`, in `strain`'s crystal, `scale` times a man's size. */
  burst(from: Point, strain: Strain, scale: number, clock: number): void {
    this.bursts.push({ from, ramp: CRYSTAL[strain], scale, start: clock });
  }

  /** Every wave still playing at `clock`, seen from `eye`; the finished are let go. */
  lay(out: number[], eye: Point, clock: number): void {
    this.bursts = this.bursts.filter((burst) => clock - burst.start < WAVE.frames * WAVE.frameS);
    for (const burst of this.bursts) {
      const frame = Math.floor((clock - burst.start) / WAVE.frameS);
      if (frame >= 0) layWave(out, frame, burst.from, burst.scale, burst.ramp, eye);
    }
  }
}

/** Every page's waves, drawn with the foes' marks (FoeFigures `overheads`). */
export const latticeWaves = new LatticeWaves();

/** The wave the fissure's closing bursts in, from `from`, at page time `clock`: the Lattice's own, four times a man's. */
export function sealWave(from: Point, clock: number): void {
  latticeWaves.burst(from, 'red', SEAL_SCALE, clock);
}

/** How far a dying Lattice foe's figure has faded, `seconds` after it fell: 0 whole to 1 gone. */
export const waveFade = (seconds: number): number => Math.min(1, Math.max(0, seconds) / WAVE.fadeS);

/** A Lattice foe as last drawn, for what the game draws over its picture: its body, crystal and size, its move and
 *  frame, where its feet are, which way it faces, and the chest it aims at, if any. */
export interface LatticeShown {
  readonly body: string;
  readonly strain: Strain;
  readonly scale: number;
  readonly anim: string;
  readonly frame: number;
  readonly frames: number;
  readonly feet: Point;
  readonly facing: number;
  readonly target: Point | null;
}

/** A disc of `radius` cells: its heart white-hot, its body light, its edge its body's stop. */
function orb(radius: number): Sprite {
  const reach = Math.max(1, Math.round(radius));
  return cached(`orb:${reach}`, () =>
    sprite(reach * 2 + 1, reach * 2 + 1, (across, up) => {
      const out = Math.hypot(across, up) / reach;
      return out > 1 ? CLEAR : out < 0.4 ? HOT : out < 0.75 ? LIGHT : BODY;
    }),
  );
}

/** The Idol's beam and the Bulwark's flare reach this far when nothing is aimed at (metres); a beam is this wide, its
 *  glow and its core; a thrown shard's streak is this long and flies over this many frames. */
const LOOKS = { reach: 14, beam: [0.22, 0.08] as const, shard: 0.35, flight: 4 };
/** Where on a man-sized Lattice foe each thing it draws lies, forward of its feet and up (metres, scaled to it): the
 *  Idol's lens at the end of its emitter, the Bulwark's core on its shield thrust out, the Ravager's throwing hand. */
const SPOTS = { lens: [0.62, 1.34], core: [0.7, 1.24], hand: [0.4, 1.45] } as const;
/** The frames of each move its look is drawn in: the Idol's beam's first frames, the Bulwark's flare held through the
 *  discharge's tell, then its burst; the Ravager's six throws, two frames each, from the hurl's fifth. */
const FRAMES = { beam: 3, flare: [2, 6], burst: 7, throws: [HURL_FIRST_THROW, 6] } as const;

/** What a Lattice foe's move draws over it in its frame, seen from `eye`. */
export function layLatticeLooks(out: number[], shown: LatticeShown, eye: Point): void {
  const { feet, scale, facing, frame } = shown;
  const ramp = CRYSTAL[shown.strain];
  const ahead: Point = [Math.sin(facing), -Math.cos(facing), 0];
  const place = ([forward, high]: readonly [number, number], aside = 0): Point => [
    feet[0] + (ahead[0] * forward - ahead[1] * aside) * scale,
    feet[1] + (ahead[1] * forward + ahead[0] * aside) * scale,
    feet[2] + high * scale,
  ];
  const aimed = (from: Point): Point =>
    shown.target ?? [from[0] + ahead[0] * LOOKS.reach, from[1] + ahead[1] * LOOKS.reach, from[2]];
  const cell = CELL_M * scale;
  if (shown.anim === 'idol_charge' && shown.frames > 0) {
    // The lens's glow grows through the charge.
    layUpright(out, orb(1 + (3 * (frame + 1)) / shown.frames), ramp, place(SPOTS.lens), eye, cell);
  } else if (shown.anim === 'idol_fire' && frame < FRAMES.beam) {
    const from = place(SPOTS.lens);
    const to = aimed(from);
    layLine(out, eye, from, to, LOOKS.beam[0] * (frame === FRAMES.beam - 1 ? 0.5 : 1), ramp[BODY]);
    if (frame < FRAMES.beam - 1) layLine(out, eye, from, to, LOOKS.beam[1], ramp[HOT]);
    layUpright(out, orb(3 - frame), ramp, from, eye, cell);
  } else if (shown.anim === 'bulwark_discharge') {
    const core = place(SPOTS.core);
    if (frame >= FRAMES.flare[0] && frame <= FRAMES.flare[1])
      layUpright(out, orb(2 + frame - FRAMES.flare[0]), ramp, core, eye, cell);
    if (frame === FRAMES.burst || frame === FRAMES.burst + 1) {
      const radius = frame === FRAMES.burst ? 10 : 16;
      layUpright(
        out,
        ringSprite(radius, frame === FRAMES.burst ? HOT : LIGHT, 2, frame === FRAMES.burst ? 0 : 0.4, 7),
        ramp,
        core,
        eye,
        cell,
      );
    }
  } else if (shown.anim === 'ravager_hurl') {
    // Each throw's shard flies from the hand that threw it, the right first, toward what it is thrown at.
    for (let thrown = 0; thrown < FRAMES.throws[1]; thrown++) {
      const left = frame - (FRAMES.throws[0] + 2 * thrown);
      if (left < 0 || left >= LOOKS.flight) continue;
      const hand = place(SPOTS.hand, thrown % 2 === 0 ? 0.25 : -0.25);
      const to = aimed(hand);
      const along = (left + 1) / LOOKS.flight;
      const [alongX, alongY, alongZ] = [to[0] - hand[0], to[1] - hand[1], to[2] - hand[2]];
      const length = Math.hypot(alongX, alongY, alongZ) || 1;
      const head: Point = [hand[0] + alongX * along, hand[1] + alongY * along, hand[2] + alongZ * along];
      const tail: Point = [
        head[0] - (alongX / length) * LOOKS.shard,
        head[1] - (alongY / length) * LOOKS.shard,
        head[2] - (alongZ / length) * LOOKS.shard,
      ];
      layLine(out, eye, tail, head, 0.07, ramp[DARK]);
      layLine(out, eye, tail, head, 0.035, ramp[LIGHT]);
    }
  }
}
