// Where the spells' looks are laid: the fighters as drawn, the places on and over a figure, and what one frame of
// drawing holds. The drawers, the marks a spell leaves as it lands and the Anima's moment all lay theirs through it.
import arts from '../../../content/arts/arts.json' with { type: 'json' };
import type { GlowElement } from '../elementGlow.ts';
import type { Statuses } from '../rules/fighters.ts';
import type { Sparks } from './sparks.ts';
import { type Laid, hashOf } from './spellPixels.ts';

export type Point = readonly [number, number, number];

export const BLAZE: GlowElement = 1;
export const VOLT: GlowElement = 2;
export const COSMIC: GlowElement = 3;
/** A room tick (seconds). */
export const TICK_S = 1 / 60;
/** Lightning is struck afresh this often a second, as Volt's glow is. */
export const STRIKE_HZ = 12;
/** A fighter's chest over its feet, and its body's radius, as the combat crate has them (metres). */
export const CHEST_M = 1.1;
const BODY_RADIUS_M = 0.35;
/** A figure's card stands a body's radius toward the eye: what is drawn over it stands a little nearer still. */
const OVER_CARD_M = 0.45;
/** A chest's share of the way up `onBody` reaches. */
export const CHEST_UP = 0.6;
/** A raven's place off its caster's right shoulder, as the room keeps it (metres). */
const SHOULDER_SIDE_M = 0.45;
const SHOULDER_UP_M = 2;
/** Arc Lash's bolts, and half its cone (radians). */
export const LASH_BOLTS = 5;
const lash: { readonly key: string; readonly coneDegrees?: number } | undefined = arts.arts
  .find((one) => one.key === 'storm')
  ?.tenets.find((tenet) => tenet.key === 'arcLash');
export const LASH_HALF = ((lash?.coneDegrees ?? 0) * Math.PI) / 360;

/** A player as the spells' looks need them: their number, where their figure's feet are drawn, where they aim, and
 *  their statuses. */
export interface SeenPlayer {
  readonly id: number;
  readonly feet: Point;
  readonly aim: number;
  readonly statuses: Statuses | undefined;
}

/** A foe as the spells' looks need it: its number and where its figure's feet are drawn. */
export interface SeenFoe {
  readonly id: number;
  readonly feet: Point;
}

/** One frame of drawing: the vertices laid on the ground (drawn first) and standing up (drawn after, far to near),
 *  the eye, the frame's seconds and the effects' clock, the fight's sparks and a random source, every player and foe,
 *  and the player's own number. */
export interface Frame {
  readonly ground: Laid;
  readonly out: Laid;
  readonly eye: Point;
  readonly seconds: number;
  readonly clock: number;
  readonly sparks: Sparks;
  readonly random: () => number;
  readonly players: readonly SeenPlayer[];
  readonly foes: readonly SeenFoe[];
  readonly own: number;
}

/** Whether a way across the ground runs to the left as an eye at `eye` sees `place`: a picture facing along it is
 *  drawn mirrored. */
export function facesLeft(eye: Point, place: Point, way: readonly [number, number]): boolean {
  const [toX, toY] = [place[0] - eye[0], place[1] - eye[1]];
  return way[0] * -toY + way[1] * toX < 0;
}

/** Where a raven sits off the right shoulder of a body at `feet` aiming along `aim`, as the room seats it. */
export function shoulderOf(feet: Point, aim: number): Point {
  const [east, south] = [Math.sin(aim), -Math.cos(aim)];
  return [feet[0] - south * SHOULDER_SIDE_M, feet[1] + east * SHOULDER_SIDE_M, feet[2] + SHOULDER_UP_M];
}

/** A point over a figure standing at `feet` as an eye at `eye` sees it: `aside` of the way across it (0 to 1), `high`
 *  of the way up, just in front of its card, which stands a body's radius toward the eye; `nearer` metres nearer
 *  still. */
export function onBody(feet: Point, eye: Point, aside: number, high: number, nearer = 0): Point {
  const [toX, toY] = [eye[0] - feet[0], eye[1] - feet[1]];
  const apart = Math.hypot(toX, toY) || 1;
  const [forward, across] = [(OVER_CARD_M + nearer) / apart, ((aside - 0.5) * 2 * BODY_RADIUS_M) / apart];
  return [feet[0] + toX * forward - toY * across, feet[1] + toY * forward + toX * across, feet[2] + 0.2 + high * 1.5];
}

/** Where Arc Lash's `bolt`th bolt ends, `reach` from `from`: fanned evenly through its cone about `bearing` (radians
 *  clockwise from north), each struck a little aside, short and up or down by `strike`. */
export function lashEnd(from: Point, bearing: number, reach: number, bolt: number, strike: number): Point {
  const fan = LASH_HALF * (((bolt + 0.5) / LASH_BOLTS) * 2 - 1);
  const angle = bearing + fan + (hashOf(strike, bolt, 1) - 0.5) * 0.15;
  const length = reach * (0.75 + 0.25 * hashOf(strike, bolt, 2));
  const rise = (hashOf(strike, bolt, 3) - 0.5) * 0.6;
  return [from[0] + Math.sin(angle) * length, from[1] - Math.cos(angle) * length, from[2] + rise];
}

/** The foes within `reach` of `from` and within Arc Lash's cone about `bearing`, nearest first, at most its bolts. */
export function lashed(foes: readonly SeenFoe[], from: Point, bearing: number, reach: number): SeenFoe[] {
  const within = foes.filter(({ feet }) => {
    const [east, south] = [feet[0] - from[0], feet[1] - from[1]];
    const off = Math.atan2(east, -south) - bearing;
    const turned = Math.abs(Math.atan2(Math.sin(off), Math.cos(off)));
    return Math.hypot(east, south) <= reach && turned <= LASH_HALF;
  });
  const apart = (foe: SeenFoe) => Math.hypot(foe.feet[0] - from[0], foe.feet[1] - from[1]);
  return within.sort((first, second) => apart(first) - apart(second)).slice(0, LASH_BOLTS);
}

/** Whether the eye looks out from a figure standing at `feet`: the player's own, in first person. */
export const seenFrom = (eye: Point, feet: Point): boolean => Math.hypot(eye[0] - feet[0], eye[1] - feet[1]) < 1;

/** How far a point stands from the eye. */
export const apartFrom = (eye: Point, place: Point): number =>
  Math.hypot(place[0] - eye[0], place[1] - eye[1], place[2] - eye[2]);
