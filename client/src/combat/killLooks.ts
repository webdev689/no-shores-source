// What a kill leaves round its body, beyond the blow's own star: a ring of dust thrown off the ground and chips of
// the body flying, and, when the killing blow carried an element, its finisher as the body dissolves in it. Blaze
// heats the body from the feet, shedding embers, then bursts in a ring and leaves ash that smoulders; Volt leaps on in
// a chain of bolts to the foes nearest; Cosmic draws a dark ring in to the chest, then pops in stars and leaves a
// swirl. Drawing only: the rules' kill is the room's.
import type { GlowLook } from '../elementGlow.ts';
import type { FightEvent } from '../network/messages.ts';
import { BODY_HEIGHT } from '../player/crosshair.ts';
import type { Bits } from './bits.ts';
import { EVENT } from './cues.ts';
import { KNOCK } from './flashes.ts';
import {
  ASH,
  CHIPS,
  DUST,
  forksSprite,
  layFlat,
  layLine,
  layUpright,
  rampFor,
  ringSprite,
  scorchSprite,
  swirlSprite,
} from './impactPixels.ts';
import { pulled } from './impacts.ts';
import { BODY, CELL_M, DARK, HOT, LIGHT, hashOf } from './spellPixels.ts';
import { jagged } from './spellLines.ts';

type Point = readonly [number, number, number];

const FRAME_S = 1 / 60;
const CHEST = (BODY_HEIGHT * 5) / 8;
/** Every kill's dust ring on the ground: its radius (metres) at each step, each held this many frames, its stop and
 *  how broken it is at each; and its chips: how many, their speed (m/s) and life (s). */
export const DUST_RING = { radii: [0.4, 0.8, 1.2, 1.6], frames: 3, stops: [2, 1, 1, 0], broken: [0, 0.15, 0.3, 0.5] };
export const CHIP_THROW = { count: 12, speed: [2, 4] as const, life: [0.8, 1.2] as const };
/** Blaze: the frames its heat climbs before it bursts; the burst's ring (metres across) and its stops, each held for
 *  its frames; its embers; and the ash it leaves (metres across, seconds, embers rising off it each second). */
export const BLAZE = {
  ignite: 24,
  ring: 1.6,
  ringStops: [HOT, HOT, HOT, LIGHT, LIGHT, LIGHT, BODY, BODY, BODY, BODY],
  embers: 20,
  ash: { across: 1.4, seconds: 10, rising: 2 },
} as const;
/** Volt: how far its chain leaps (metres) and how many leaps, each this many frames; its bolt restruck 12 times a
 *  second, a glow and a core this wide (metres). */
export const VOLT = { reach: 6, leaps: 2, frames: 8, strike: 5, glow: 0.09, core: 0.03, sparks: 10 } as const;
/** Cosmic: its dark ring closing from this radius (metres) in held steps over the frames its body is drawn in; then
 *  its pop of stars and ring (metres across), and the swirl left behind (metres across, seconds). */
export const COSMIC = { from: 0.75, steps: 5, frames: 10, stars: 16, ring: 1.2, swirl: { across: 1.2, seconds: 3 } };

/** No more than this many marks lie on the ground at once: a new one takes the oldest's place. */
const MOST_MARKS = 4;
/** What a kill leaves on the ground is drawn in cells twice a spell's: four figure pixels, chunky as ash lies. */
const DECAL_CELL_M = 2 * CELL_M;
/** What a frame's kills are told by: where each fighter stands, the element each kill came in, where the living foes
 *  stand other than one, and how to dissolve a body in an element. */
export interface KillsTold {
  readonly where: (id: number) => Point | null;
  readonly lookOf: (event: FightEvent) => GlowLook;
  readonly foesBut?: (id: number) => readonly Point[];
  readonly dissolve?: (id: number, look: GlowLook) => void;
}

interface Kill {
  readonly look: GlowLook;
  readonly feet: Point;
  readonly from: Point | null;
  readonly chain: readonly Point[];
  readonly seed: number;
  age: number;
}
interface Mark {
  readonly look: GlowLook;
  readonly place: Point;
  readonly life: number;
  readonly seed: number;
  age: number;
  embers: number;
}

/** Where a body slain at `feet` by a blow from `from` comes to rest: slid along the blow as its figure is. */
export function restingAt(feet: Point, from: Point | null): Point {
  if (!from) return feet;
  const apart = Math.hypot(feet[0] - from[0], feet[1] - from[1]);
  if (apart < 1e-6) return feet;
  const slide = KNOCK.killed / apart;
  return [feet[0] + (feet[0] - from[0]) * slide, feet[1] + (feet[1] - from[1]) * slide, feet[2]];
}

/** The chests a Volt chain leaps to from a body at `feet`: the nearest of `foes` within its reach, then the nearest
 *  to that one, each once. */
export function chainOf(feet: Point, foes: readonly Point[]): Point[] {
  const chain: Point[] = [];
  const left = [...foes];
  let from = feet;
  for (let leap = 0; leap < VOLT.leaps; leap++) {
    let best = -1;
    let nearest: number = VOLT.reach;
    left.forEach((foe, index) => {
      const apart = Math.hypot(foe[0] - from[0], foe[1] - from[1]);
      if (apart <= nearest) [best, nearest] = [index, apart];
    });
    const next = left[best];
    if (!next) break;
    left.splice(best, 1);
    chain.push(next);
    from = next;
  }
  return chain;
}

/** Makes a kill's largest pictures before the first falls, so that frame does not wait on them. */
export function warmKillPictures(): void {
  DUST_RING.radii.forEach((radius, step) =>
    ringSprite(Math.round(radius / CELL_M), DUST_RING.stops[step] ?? 0, 3, DUST_RING.broken[step] ?? 0, 2),
  );
  for (const stop of new Set(BLAZE.ringStops))
    ringSprite(Math.round(BLAZE.ring / 2 / CELL_M), stop, 2, stop === BODY ? 0.4 : 0, 3);
}

/** Every kill's look still showing, and what kills leave on the ground. */
export class KillLooks {
  private readonly bits: Bits;
  private kills: Kill[] = [];
  private marks: Mark[] = [];
  private seeds = 0;

  constructor(bits: Bits) {
    this.bits = bits;
  }

  /** Runs every kill's look on by `seconds`, then starts one for each kill in `events`. */
  update(events: readonly FightEvent[], seconds: number, told: KillsTold): void {
    for (const kill of this.kills) {
      const before = Math.floor(kill.age / FRAME_S + 1e-6);
      kill.age += seconds;
      this.happen(kill, before, Math.floor(kill.age / FRAME_S + 1e-6));
    }
    this.kills = this.kills.filter((kill) => kill.age < lifeOf(kill.look) * FRAME_S);
    for (const mark of this.marks) {
      mark.age += seconds;
      this.smoulder(mark);
    }
    this.marks = this.marks.filter((mark) => mark.age < mark.life).slice(-MOST_MARKS);
    for (const event of events) {
      if (event.kind !== EVENT.killed) continue;
      const found = told.where(event.defender);
      if (!found) continue;
      const look = told.lookOf(event);
      const from = told.where(event.striker);
      const feet = restingAt(found, from);
      const chain = look === 2 ? chainOf(feet, told.foesBut?.(event.defender) ?? []) : [];
      const kill: Kill = { look, feet, from, chain, seed: this.seeds++, age: 0 };
      this.kills.push(kill);
      this.bits.throw(chest(feet), [0, 0], CHIP_THROW.count, {
        ramp: CHIPS,
        ...CHIP_THROW,
        shape: 'mote',
        stop: kill.seed % 2,
        rise: 1.2,
        floor: feet[2] + 0.02,
      });
      if (look) told.dissolve?.(event.defender, look);
      this.happen(kill, -1, 0);
    }
  }

  /** What a kill throws as it reaches each frame after `from` up to `to`. */
  private happen(kill: Kill, from: number, to: number): void {
    const { look, feet } = kill;
    for (let frame = from + 1; frame <= to; frame++) {
      if (look === 1 && frame < BLAZE.ignite && frame % 2 === 0) {
        const high = feet[2] + ((frame + 2) / BLAZE.ignite) * BODY_HEIGHT * 0.9;
        const aside = (hashOf(kill.seed, frame) - 0.5) * 0.4;
        const place: Point = [feet[0] + aside, feet[1] - aside, high];
        this.bits.throw(place, [0, 0], 1, {
          ramp: rampFor(1),
          speed: [0.4, 0.9],
          life: [0.35, 0.6],
          lift: 11,
          shape: 'mote',
          rise: 1,
          spread: 0.3,
        });
      }
      if (look === 1 && frame === BLAZE.ignite) {
        this.bits.throw(chest(feet), [0, 0], BLAZE.embers, {
          ramp: rampFor(1),
          speed: [1.5, 4],
          life: [0.5, 1],
          lift: 5,
          shape: 'mote',
          rise: 0.8,
        });
        this.marks.push({ look, place: feet, life: BLAZE.ash.seconds, seed: kill.seed, age: 0, embers: 0 });
      }
      if (look === 2)
        for (const [leap, end] of kill.chain.entries())
          if (frame === leap * VOLT.frames)
            this.bits.throw(chest(end), [0, 0], VOLT.sparks, {
              ramp: rampFor(2),
              speed: [4, 8],
              life: [0.12, 0.3],
              rise: 0.8,
            });
      if (look === 2 && frame === 0)
        this.bits.throw(chest(feet), [0, 0], VOLT.sparks, {
          ramp: rampFor(2),
          speed: [4, 8],
          life: [0.12, 0.3],
          rise: 0.8,
        });
      if (look === 3 && frame === COSMIC.frames) {
        this.bits.throw(chest(feet), [0, 0], COSMIC.stars, {
          ramp: rampFor(3),
          speed: [1, 3],
          life: [0.5, 0.9],
          lift: 9.81,
          shape: 'glint',
          rise: 0.6,
        });
        this.marks.push({ look, place: feet, life: COSMIC.swirl.seconds, seed: kill.seed, age: 0, embers: 0 });
      }
    }
  }

  /** Embers rising off Blaze's ash, so many a second. */
  private smoulder(mark: Mark): void {
    if (mark.look !== 1) return;
    const due = Math.floor(mark.age * BLAZE.ash.rising);
    for (; mark.embers < due; mark.embers++) {
      const angle = hashOf(mark.seed, mark.embers) * Math.PI * 2;
      const out = Math.sqrt(hashOf(mark.seed, mark.embers, 1)) * (BLAZE.ash.across / 2) * 0.8;
      const place: Point = [
        mark.place[0] + Math.cos(angle) * out,
        mark.place[1] + Math.sin(angle) * out,
        mark.place[2] + 0.05,
      ];
      this.bits.throw(place, [0, 0], 1, {
        ramp: rampFor(1),
        speed: [0.2, 0.5],
        life: [0.8, 1.2],
        lift: 10.3,
        shape: 'mote',
        rise: 1,
        spread: 0.2,
      });
    }
  }

  /** Every kill's look and mark, seen from `eye`, as mark vertices: all fully opaque. */
  lay(out: number[], eye: Point): void {
    for (const kill of this.kills) {
      const frame = Math.floor(kill.age / FRAME_S + 1e-6);
      layDust(out, kill.feet, frame);
      const { place, shrink } = pulled(chest(kill.feet), eye, kill.from);
      const cell = CELL_M * shrink;
      if (kill.look === 1) layBlaze(out, frame, place, eye, cell);
      if (kill.look === 2) layVolt(out, kill, frame, place, eye, cell);
      if (kill.look === 3) layCosmic(out, frame, place, eye, cell);
    }
    for (const mark of this.marks) {
      // The last of its time it shrinks away in four held steps.
      const left = mark.life - mark.age;
      const fading = mark.look === 1 ? 1 : 0.75;
      const share = left >= fading ? 1 : Math.ceil((left / fading) * 4) / 4;
      if (mark.look === 1) {
        const radius = Math.max(1, Math.round((share * BLAZE.ash.across) / 2 / DECAL_CELL_M));
        layFlat(out, scorchSprite(radius, DARK), ASH, mark.place, DECAL_CELL_M);
      } else {
        const radius = Math.max(1, Math.round((share * COSMIC.swirl.across) / 2 / DECAL_CELL_M));
        layFlat(out, swirlSprite(radius, Math.floor(mark.age / 0.2)), rampFor(3), mark.place, DECAL_CELL_M);
      }
    }
  }
}

const chest = (feet: Point): Point => [feet[0], feet[1], feet[2] + CHEST];

/** How many frames each element's look lasts. */
function lifeOf(look: GlowLook): number {
  const dust = DUST_RING.radii.length * DUST_RING.frames;
  if (look === 1) return Math.max(dust, BLAZE.ignite + BLAZE.ringStops.length);
  if (look === 2) return Math.max(dust, VOLT.leaps * VOLT.frames);
  if (look === 3) return Math.max(dust, COSMIC.frames + 6);
  return dust;
}

function layDust(out: number[], feet: Point, frame: number): void {
  const step = Math.floor(frame / DUST_RING.frames);
  const radius = DUST_RING.radii[step];
  if (radius === undefined) return;
  const ring = ringSprite(Math.round(radius / CELL_M), DUST_RING.stops[step] ?? 0, 3, DUST_RING.broken[step] ?? 0, 2);
  layFlat(out, ring, DUST, feet);
}

function layBlaze(out: number[], frame: number, place: Point, eye: Point, cell: number): void {
  const stop = BLAZE.ringStops[frame - BLAZE.ignite];
  if (stop === undefined) return;
  const broken = stop === BODY ? 0.4 : 0;
  layUpright(out, ringSprite(Math.round(BLAZE.ring / 2 / CELL_M), stop, 2, broken, 3), rampFor(1), place, eye, cell);
}

function layVolt(out: number[], kill: Kill, frame: number, place: Point, eye: Point, cell: number): void {
  if (frame < 6) layUpright(out, forksSprite(20, kill.seed + (frame >> 1), frame >> 1), rampFor(2), place, eye, cell);
  const ramp = rampFor(2);
  const leap = Math.floor(frame / VOLT.frames);
  const end = kill.chain[leap];
  if (!end) return;
  const start = leap === 0 ? chest(kill.feet) : chest(kill.chain[leap - 1] ?? kill.feet);
  const strike = Math.floor(frame / VOLT.strike);
  const points = jagged(start, chest(end), 6, 0.22, kill.seed * 31 + strike);
  for (const [width, stop] of [
    [VOLT.glow, BODY],
    [VOLT.core, HOT],
  ] as const)
    for (let index = 0; index + 1 < points.length; index++) {
      const [from, to] = [points[index], points[index + 1]];
      if (from && to) layLine(out, eye, from, to, width, ramp[stop]);
    }
  if (frame % VOLT.frames < 3) layUpright(out, forksSprite(12, kill.seed + leap, 0), ramp, chest(end), eye, cell);
}

function layCosmic(out: number[], frame: number, place: Point, eye: Point, cell: number): void {
  const ramp = rampFor(3);
  if (frame < COSMIC.frames) {
    const step = Math.floor((frame / COSMIC.frames) * COSMIC.steps);
    const radius = Math.max(1, Math.round((COSMIC.from * (1 - step / COSMIC.steps)) / CELL_M));
    layUpright(out, ringSprite(radius, DARK, 2), ramp, place, eye, cell);
    return;
  }
  const since = frame - COSMIC.frames;
  const radius = Math.round(COSMIC.ring / 2 / CELL_M);
  if (since < 3) layUpright(out, ringSprite(radius, LIGHT, 2), ramp, place, eye, cell);
  else if (since < 6) layUpright(out, ringSprite(radius + 2, BODY, 1, 0.4, 5), ramp, place, eye, cell);
}
