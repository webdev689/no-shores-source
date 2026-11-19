import { glowRampAt } from '../elementGlow.ts';
import type { FlyingShot } from '../network/messages.ts';
import type { Spark } from './sparks.ts';
import type { Action, Shape } from '../rules/fighters.ts';

/** A telegraphed blow's mark: its shape where it stands, how far its wind-up has run, and whether it is iron. */
export type TelegraphMark = Extract<Action, { kind: 'telegraph' }>;

/** Each shape's ground, as the combat crate's numbers have it: a lane's length and half-width, an arc's radius and
 *  half-angle, a disc's radius and how far ahead it stands, a ring's inner and outer radius. */
const GROUND: Readonly<Record<Shape, { length: number; width: number; inner: number; halfArc: number }>> = {
  lunge: { length: 4.5, width: 0.6, inner: 0, halfArc: 0 },
  sweep: { length: 3.2, width: 0, inner: 0, halfArc: (65 * Math.PI) / 180 },
  slam: { length: 1, width: 2, inner: 0, halfArc: 0 },
  ring: { length: 4, width: 0, inner: 1.6, halfArc: 0 },
  charge: { length: 9, width: 0.8, inner: 0, halfArc: 0 },
  leap: { length: 0, width: 1.8, inner: 0, halfArc: 0 },
  aimed: { length: 0, width: 0.25, inner: 0, halfArc: 0 },
};
/** A mark's colours: a plain blow's gold and an iron one's red, its fill's opacity, its edge's opacity and width, and
 *  how much brighter its last stretch is (the last 12 ticks, 0.2 s, as the combat crate's NOW). */
const GOLD = [1, 0.74, 0.22] as const;
const IRON = [0.95, 0.16, 0.1] as const;
const FILL = 0.28;
const EDGE = 0.75;
const EDGE_M = 0.06;
const NOW_TICKS = 12;
const NOW_BRIGHTER = 1.6;
/** An iron blow's edge is drawn twice, the second this far inside the first: its shape says iron, not its colour alone,
 *  for those who cannot tell red from gold. */
const IRON_INSET = 0.2;
/** How far above the ground a mark lies, so it never fights the ground for depth. */
const LIFT = 0.03;
/** An arrow's length and thickness, its colour, and the steps a curve is drawn in. */
const ARROW_M = 0.75;
const ARROW_THICK = 0.035;
const ARROW_COLOUR = [0.52, 0.38, 0.22, 1] as const;
/** A spark's streak: as long as this much of its flight (seconds), this thick (metres), white hot cooling to orange,
 *  or down its element's ramp. */
const SPARK_STREAK_S = 0.03;
const SPARK_THICK = 0.012;
const SPARK_HOT = [1, 0.92, 0.6] as const;
const SPARK_COOL = [1, 0.38, 0.06] as const;
/** An element's mote is a streak at least this long (metres), so a slow one still shows. */
const MOTE_M = 0.025;
const CURVE_STEPS = 24;
/** Each vertex's numbers: x, y, z, then red, green, blue, opacity. */
export const MARK_FLOATS = 7;

type Point = readonly [number, number];

/** The triangles of every telegraphed blow's mark, every arrow and bolt in flight, every spark and the tracers'
 *  vertices `more`, as vertices of MARK_FLOATS numbers, each place measured from `origin` (the world's own by
 *  default; the eye's keeps a mark exact far out in the world). */
export function marksMesh(
  telegraphs: readonly TelegraphMark[],
  shots: readonly FlyingShot[],
  sparks: readonly Spark[] = [],
  more: readonly number[] = [],
  origin: readonly [number, number, number] = [0, 0, 0],
): Float32Array {
  const out: number[] = [];
  for (const telegraph of telegraphs) markTelegraph(out, telegraph);
  for (const shot of shots) markArrow(out, shot.at, shot.velocity);
  for (const { at, velocity, age, life, look } of sparks) {
    const cooled = Math.min(1, age / life);
    const colour = look
      ? glowRampAt(look, cooled)
      : [0, 1, 2].map((part) => (SPARK_HOT[part] ?? 1) + ((SPARK_COOL[part] ?? 1) - (SPARK_HOT[part] ?? 1)) * cooled);
    const length = Math.max(look ? MOTE_M : 0, Math.hypot(...velocity) * SPARK_STREAK_S);
    markStreak(out, at, velocity, length, SPARK_THICK, [...colour, 1 - cooled * cooled]);
  }
  for (const value of more) out.push(value);
  for (let start = 0; start < out.length; start += MARK_FLOATS)
    for (let axis = 0; axis < 3; axis += 1) out[start + axis] = (out[start + axis] ?? 0) - (origin[axis] ?? 0);
  return new Float32Array(out);
}

function markTelegraph(out: number[], telegraph: TelegraphMark): void {
  const ground = GROUND[telegraph.shape];
  const progress = Math.min(1, telegraph.elapsed / Math.max(1, telegraph.windup));
  const now = telegraph.windup - telegraph.elapsed <= NOW_TICKS ? NOW_BRIGHTER : 1;
  const [red, green, blue] = telegraph.iron ? IRON : GOLD;
  const fill = [red, green, blue, Math.min(1, FILL * now)] as const;
  const edge = [red, green, blue, Math.min(1, EDGE * now)] as const;
  const [originX, originY, originZ] = telegraph.origin;
  const forward: Point = [Math.sin(telegraph.bearing), -Math.cos(telegraph.bearing)];
  const across: Point = [-forward[1], forward[0]];
  // A point `along` ahead of the origin and `aside` across, on the ground.
  const onGround = (along: number, aside: number): [number, number, number] => [
    originX + forward[0] * along + across[0] * aside,
    originY + forward[1] * along + across[1] * aside,
    originZ + LIFT,
  ];
  const quad = (corners: readonly (readonly [number, number, number])[], colour: readonly number[]) => {
    const [first, second, third, fourth] = corners;
    if (!first || !second || !third || !fourth) return;
    for (const corner of [first, second, third, first, third, fourth]) out.push(...corner, ...colour);
  };
  const insets = telegraph.iron ? [0, IRON_INSET] : [0];
  const lane = (length: number, width: number) => {
    quad(
      [
        onGround(-0.3, -width),
        onGround(-0.3 + (length + 0.3) * progress, -width),
        onGround(-0.3 + (length + 0.3) * progress, width),
        onGround(-0.3, width),
      ],
      fill,
    );
    for (const inset of insets) {
      // A narrow lane's second edge keeps to its own half.
      const side = width - Math.min(inset, width / 2);
      const end = length - inset;
      quad(
        [onGround(-0.3, -side), onGround(end, -side), onGround(end, -side + EDGE_M), onGround(-0.3, -side + EDGE_M)],
        edge,
      );
      quad(
        [onGround(-0.3, side - EDGE_M), onGround(end, side - EDGE_M), onGround(end, side), onGround(-0.3, side)],
        edge,
      );
      quad(
        [onGround(end - EDGE_M, -side), onGround(end, -side), onGround(end, side), onGround(end - EDGE_M, side)],
        edge,
      );
    }
  };
  // A band of the circle about (ahead, 0) from radius `inner` to `outer`, between two angles off the bearing.
  const band = (ahead: number, inner: number, outer: number, from: number, to: number, colour: readonly number[]) => {
    for (let step = 0; step < CURVE_STEPS; step += 1) {
      const [first, second] = [
        from + ((to - from) * step) / CURVE_STEPS,
        from + ((to - from) * (step + 1)) / CURVE_STEPS,
      ];
      const point = (radius: number, angle: number) =>
        onGround(ahead + Math.cos(angle) * radius, Math.sin(angle) * radius);
      quad([point(inner, first), point(outer, first), point(outer, second), point(inner, second)], colour);
    }
  };
  // An edge band inside radius `outer` (and its iron double further in), or outside `inner`.
  const edgeIn = (ahead: number, outer: number, from: number, to: number) => {
    for (const inset of insets) band(ahead, outer - EDGE_M - inset, outer - inset, from, to, edge);
  };
  const edgeOut = (inner: number) => {
    for (const inset of insets) band(0, inner + inset, inner + inset + EDGE_M, -Math.PI, Math.PI, edge);
  };
  switch (telegraph.shape) {
    case 'lunge':
    case 'charge':
      lane(ground.length, ground.width);
      break;
    case 'aimed':
      lane(telegraph.ahead, ground.width);
      break;
    case 'sweep':
      band(0, 0, ground.length * progress, -ground.halfArc, ground.halfArc, fill);
      edgeIn(0, ground.length, -ground.halfArc, ground.halfArc);
      break;
    case 'ring':
      band(0, ground.length - (ground.length - ground.inner) * progress, ground.length, -Math.PI, Math.PI, fill);
      edgeOut(ground.inner);
      edgeIn(0, ground.length, -Math.PI, Math.PI);
      break;
    case 'slam':
    case 'leap': {
      const ahead = telegraph.shape === 'slam' ? ground.length : telegraph.ahead;
      band(ahead, 0, ground.width * progress, -Math.PI, Math.PI, fill);
      edgeIn(ahead, ground.width, -Math.PI, Math.PI);
      break;
    }
  }
}

/** An arrow or a bolt flying at `velocity`, its head at `at`. */
export function markArrow(out: number[], head: readonly number[], velocity: readonly number[]): void {
  markStreak(out, head, velocity, ARROW_M, ARROW_THICK, ARROW_COLOUR);
}

/** A streak `length` long behind a point flying at `velocity` (an arrow, a bolt, a spark): two crossed strips `thick`
 *  wide along its flight, so it shows from any side. */
function markStreak(
  out: number[],
  [x, y, z]: readonly number[],
  [eastward = 0, southward = 0, upward = 0]: readonly number[],
  length: number,
  thick: number,
  colour: readonly number[],
): void {
  const speed = Math.hypot(eastward, southward, upward);
  if (speed <= 0 || speed > 1000 || x === undefined || y === undefined || z === undefined) return;
  const along = [eastward / speed, southward / speed, upward / speed] as const;
  const tail = [x - along[0] * length, y - along[1] * length, z - along[2] * length] as const;
  const flat = Math.hypot(along[0], along[1]) || 1;
  const sides = [
    [-along[1] / flat, along[0] / flat, 0],
    [0, 0, 1],
  ] as const;
  for (const side of sides) {
    const offset = (point: readonly number[], sign: number) =>
      [0, 1, 2].map((axis) => (point[axis] ?? 0) + (side[axis] ?? 0) * thick * sign);
    const corners = [offset(tail, -1), offset([x, y, z], -1), offset([x, y, z], 1), offset(tail, 1)];
    const [first, second, third, fourth] = corners;
    if (!first || !second || !third || !fourth) continue;
    for (const corner of [first, second, third, first, third, fourth]) out.push(...corner, ...colour);
  }
}

/** A ring on the ground about `centre` from radius `inner` to `outer`, in one colour: red, green, blue, opacity. */
export function markRing(
  out: number[],
  centre: readonly [number, number, number],
  inner: number,
  outer: number,
  colour: readonly [number, number, number, number],
): void {
  const [x, y, z] = centre;
  const onGround = (radius: number, angle: number) => [
    x + Math.sin(angle) * radius,
    y - Math.cos(angle) * radius,
    z + LIFT,
  ];
  for (let step = 0; step < CURVE_STEPS; step += 1) {
    const [from, to] = [(step / CURVE_STEPS) * 2 * Math.PI, ((step + 1) / CURVE_STEPS) * 2 * Math.PI];
    const corners = [onGround(inner, from), onGround(outer, from), onGround(outer, to), onGround(inner, to)];
    const [first, second, third, fourth] = corners;
    if (!first || !second || !third || !fourth) continue;
    for (const corner of [first, second, third, first, third, fourth]) out.push(...corner, ...colour);
  }
}
