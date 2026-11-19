// A blow's course through the air, laid from the fight's own blow (when it lands, how far it reaches and how wide it
// sweeps), the way its striker's figure is drawn swinging it, so the light goes where the blade goes; and how heavy
// its weapon swings, by its class.
import type { GlowLook } from '../elementGlow.ts';
import type { StrokeDirection } from '../rules/fighters.ts';

export type Vector = readonly [number, number, number];
export type Colour = readonly [number, number, number];

/** A blow being struck, as the arcs read it. */
export interface Swing {
  /** The fighter striking it. */
  readonly id: number;
  /** The combat crate's stroke, 1 to 6. */
  readonly stroke: number;
  /** Seconds since the swing began; from its start to its blow landing; and to its end. */
  readonly elapsed: number;
  readonly strike: number;
  readonly end: number;
  /** How far the stroke reaches, feet to a body's middle, and how wide it sweeps either side of its aim (radians). */
  readonly reach: number;
  readonly halfArc: number;
  /** Where it is aimed, radians clockwise from north. */
  readonly aim: number;
  /** The way its blade goes, and the hand that swings it, as its striker's figure is drawn; and whether that figure is
   *  drawn mirrored, which turns both about: a mirrored figure swings left-handed, the other way. */
  readonly way: StrokeDirection;
  readonly leftHand: boolean;
  readonly mirrored: boolean;
  /** A riposte or a counter: drawn in gold, and brighter. */
  readonly special: boolean;
  readonly tint: Colour;
  /** The element the striking hand's weapon glows in (none unless said), and the striker's arms as the combat crate
   *  codes them, its low byte the weapon's class (a sword unless said). */
  readonly look?: GlowLook;
  readonly arms?: number;
}

/** How heavy a class swings: its streak's width and trail as shares of a sword's, its head's glint (metres), whether
 *  that head is blunt (a square flare), and whether its overhead strikes the ground. */
export interface Weight {
  readonly wide: number;
  readonly trail: number;
  readonly head: number;
  readonly blunt: boolean;
  readonly ground: boolean;
}
/** By the combat crate's class numbers: fists, dagger, sword, mace, flail, axe, warhammer, staff, greatsword. */
const WEIGHTS: readonly Weight[] = [
  { wide: 0.6, trail: 0.6, head: 0.08, blunt: true, ground: false },
  { wide: 0.7, trail: 0.7, head: 0.08, blunt: false, ground: false },
  { wide: 1, trail: 1, head: 0.1, blunt: false, ground: false },
  { wide: 1.2, trail: 1.1, head: 0.16, blunt: true, ground: false },
  { wide: 1.4, trail: 1.25, head: 0.2, blunt: true, ground: true },
  { wide: 1.6, trail: 1.4, head: 0.25, blunt: false, ground: true },
  { wide: 1.6, trail: 1.4, head: 0.25, blunt: true, ground: true },
  { wide: 1.1, trail: 1.1, head: 0.12, blunt: true, ground: false },
  { wide: 1.6, trail: 1.4, head: 0.25, blunt: false, ground: true },
];
const SWORD = 2;

/** How heavy the melee weapon of arms `arms` swings; a sword's for none known. */
export const weightOf = (arms = SWORD): Weight => WEIGHTS[arms & 0xff] ?? (WEIGHTS[SWORD] as Weight);

const DEGREE = Math.PI / 180;
/** The pivot: the striking shoulder, this high over the feet and this far to the striking hand's side (metres). */
const SHOULDER_M = 1.3;
const SHOULDER_SIDE_M = 0.18;
/** The blade within a stroke's reach: its tip this share of the reach less the body it strikes (held between these),
 *  in keeping with the figure that swings it; and its hilt this share of the tip in for a sword, the band reaching
 *  further in for a heavier class, never past this share. */
const BODY_RADIUS_M = 0.35;
const TIP_SHARE = 0.75;
const TIP_M = [0.7, 2.2] as const;
const BLADE_SHARE = 0.62;
const BLADE_MOST = 0.8;
/** The fast part of a swing begins this share of the way to its landing, and sweeps on through this share of the
 *  follow-through. The head gathers speed to the landing as an ease-in of this power. */
const SWING_FROM = 0.55;
const SWEEP_ON = 0.4;
const GATHER = 2.2;
/** The pivot stands this far ahead of the chest, so a cut sweeps in front of the figure. */
const AHEAD_M = 0.15;
/** A thrust: drawn back to this share of the tip before it drives, and back to this share after. */
export const THRUST = { from: 0.3, back: 0.6 } as const;

/** Each stroke's path, in the striker's frame (ahead, right, up) for its right hand: where the blow lands (`land`),
 *  which way the blade travels as it lands (`travel`), and how far round it sweeps before and after the landing
 *  (radians); a slant's and a sweep's widened by the stroke's own arc. */
interface Path {
  readonly land: Vector;
  readonly travel: Vector;
  readonly before: number;
  readonly after: number;
  readonly widened: boolean;
}
const PATHS: Readonly<Record<Exclude<StrokeDirection, 'up'>, Path>> = {
  down: { land: [1, 0, -0.3], travel: [0, -0.45, -1], before: 95 * DEGREE, after: 65 * DEGREE, widened: false },
  downLeft: { land: [1, 0, -0.25], travel: [0, -1, -1], before: 35 * DEGREE, after: 15 * DEGREE, widened: true },
  downRight: { land: [1, 0, -0.25], travel: [0, 1, -1], before: 35 * DEGREE, after: 15 * DEGREE, widened: true },
  left: { land: [1, 0, -0.12], travel: [0, -1, -0.2], before: 25 * DEGREE, after: 20 * DEGREE, widened: true },
  right: { land: [1, 0, -0.12], travel: [0, 1, -0.2], before: 25 * DEGREE, after: 20 * DEGREE, widened: true },
};
/** Each way as a mirror shows it. */
const MIRRORED: Readonly<Record<StrokeDirection, StrokeDirection>> = {
  down: 'down',
  downLeft: 'downRight',
  left: 'right',
  right: 'left',
  downRight: 'downLeft',
  up: 'up',
};
/** A thrust drives along this, in the striker's frame. */
const THRUST_ALONG: Vector = [1, 0, -0.1];

/** Each metal's light, by the word in a forge layer's name; bare hands and wood a warm white. */
const METALS: Readonly<Record<string, Colour>> = {
  iron: [0.62, 0.71, 0.84],
  steel: [0.74, 0.86, 1],
  silver: [0.9, 0.88, 1],
  elven: [0.84, 0.96, 0.56],
  dwarven: [1, 0.78, 0.4],
  mithril: [0.6, 0.95, 1],
  adamantium: [0.45, 1, 0.82],
  ebony: [0.7, 0.46, 1],
  orcish: [0.64, 0.9, 0.36],
  daedric: [1, 0.33, 0.22],
};
const PLAIN: Colour = [1, 0.9, 0.76];

/** The light a weapon's arc burns in, by the metal its forge layer names (`sword_daedric`); a warm white for none. */
export function weaponTint(layer: string | null): Colour {
  for (const word of layer?.split('_') ?? []) {
    const metal = METALS[word];
    if (metal) return metal;
  }
  return PLAIN;
}

export const add = (a: Vector, b: Vector, scale = 1): Vector => [
  a[0] + b[0] * scale,
  a[1] + b[1] * scale,
  a[2] + b[2] * scale,
];
export const scaled = (a: Vector, scale: number): Vector => [a[0] * scale, a[1] * scale, a[2] * scale];
export const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vector, b: Vector): Vector => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export function unit(a: Vector): Vector {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
}

/** A blow's course through the air, in the world: its pivot's place off the feet, the way it lands and the way it
 *  travels as it lands, how far round it sweeps either side of the landing, its blade's tip and hilt, its timing
 *  (seconds from its start): its fast part begins (`from`), lands (`strike`) and stops (`to`), and how heavy its
 *  weapon swings. A thrust drives along `land` instead of turning; a heavy class's overhead strikes the ground. */
export interface Course {
  readonly offset: Vector;
  readonly land: Vector;
  readonly travel: Vector;
  readonly before: number;
  readonly after: number;
  readonly tip: number;
  readonly hilt: number;
  readonly thrust: boolean;
  readonly from: number;
  readonly strike: number;
  readonly to: number;
  readonly weight: Weight;
  readonly ground: boolean;
}

/** A blow's course, from the swing as seen. */
export function courseOf(swing: Swing): Course {
  const direction = swing.mirrored ? MIRRORED[swing.way] : swing.way;
  const forward: Vector = [Math.sin(swing.aim), -Math.cos(swing.aim), 0];
  const right: Vector = [Math.cos(swing.aim), Math.sin(swing.aim), 0];
  const up: Vector = [0, 0, 1];
  const world = (local: Vector): Vector => add(add(scaled(forward, local[0]), right, local[1]), up, local[2]);
  const hand = swing.leftHand !== swing.mirrored ? -1 : 1;
  const offset = world([AHEAD_M, SHOULDER_SIDE_M * hand, SHOULDER_M]);
  const tip = Math.min(TIP_M[1], Math.max(TIP_M[0], (swing.reach - BODY_RADIUS_M) * TIP_SHARE));
  const weight = weightOf(swing.arms);
  const hilt = tip * (1 - Math.min(BLADE_MOST, BLADE_SHARE * weight.wide));
  const strike = Math.max(swing.strike, 1e-3);
  const timing = { from: strike * SWING_FROM, strike, to: strike + Math.max(swing.end - strike, 0) * SWEEP_ON };
  if (direction === 'up') {
    const land = unit(world(THRUST_ALONG));
    return {
      offset,
      land,
      travel: land,
      before: 0,
      after: 0,
      tip,
      hilt,
      thrust: true,
      ...timing,
      weight,
      ground: false,
    };
  }
  const path = PATHS[direction];
  const land = unit(world(path.land));
  // An overhead drifts toward the striking hand's far side.
  const drift = direction === 'down' ? path.travel[1] * hand : path.travel[1];
  const raw = world([path.travel[0], drift, path.travel[2]]);
  const travel = unit(add(raw, land, -dot(raw, land)));
  const widen = path.widened ? swing.halfArc : 0;
  return {
    offset,
    land,
    travel,
    before: path.before + widen,
    after: path.after + widen,
    tip,
    hilt,
    thrust: false,
    ...timing,
    weight,
    ground: weight.ground && direction === 'down',
  };
}

/** Where a blow's head is `time` seconds into it, and how fast it goes there as a share of its speed as it lands: an
 *  angle round from the landing for a cut, a distance out from the pivot for a thrust. It gathers speed to the landing
 *  and sheds it through the sweep, its speed unbroken as it lands. */
export function headAt(course: Course, time: number): { readonly along: number; readonly speed: number } {
  const { from, strike, to } = course;
  const span = Math.max(strike - from, 1e-6);
  const start = course.thrust ? course.tip * THRUST.from : -course.before;
  const landed = course.thrust ? course.tip : 0;
  const finish = course.thrust ? course.tip * THRUST.back : course.after;
  if (time <= from) return { along: start, speed: 0 };
  if (time < strike) {
    const share = (time - from) / span;
    return { along: start + (landed - start) * share ** GATHER, speed: share ** (GATHER - 1) };
  }
  // The sweep after the landing eases out at the power that keeps its speed unbroken as it lands.
  const landing = (GATHER * Math.abs(landed - start)) / span;
  const sweep = Math.max(to - strike, 1e-6);
  const turn = Math.abs(finish - landed);
  const power = turn > 1e-9 ? Math.min(6, Math.max(1.2, (landing * sweep) / turn)) : 1;
  const share = Math.min(1, (time - strike) / sweep);
  const left = (1 - share) ** power;
  return {
    along: landed + (finish - landed) * (1 - left),
    speed: share >= 1 || landing <= 0 ? 0 : (power * turn * (1 - share) ** (power - 1)) / sweep / landing,
  };
}

/** The way out from the pivot to a cut's head at angle `turn` round from its landing. */
export const outward = (course: Course, turn: number): Vector =>
  add(scaled(course.land, Math.cos(turn)), course.travel, Math.sin(turn));

/** Where a blow's tip is `time` seconds into it, struck from feet at `feet`. */
export function tipAt(course: Course, feet: Vector, time: number): Vector {
  const pivot = add(feet, course.offset);
  const { along } = headAt(course, time);
  return course.thrust ? add(pivot, course.land, along) : add(pivot, outward(course, along), course.tip);
}
