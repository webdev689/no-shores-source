import { GLOW_RAMPS } from '../elementGlow.ts';
import type { FlyingShot } from '../network/messages.ts';
import { PX_PER_M } from '../player/figures.ts';
import type { Spark } from './sparks.ts';
import type { Action, Shape } from '../rules/fighters.ts';
import { GOLD, IRON, rampOf } from './markSprites.ts';

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
/** A plain blow's mark's ramp, dark to white-hot (an iron one's is the display's iron red, `IRON`). */
/** The ground's cells a mark is dithered in: four of a figure's pixels, so its dots read as dots across a fight. */
export const DITHER_M = 4 / PX_PER_M;
/** A mark's fill is this share of its cells, and this share in its last stretch (the last 12 ticks, 0.2 s, as the
 *  combat crate's NOW), whose first ticks light its edge white-hot. */
const FILL = 0.25;
const FILL_NOW = 0.5;
const NOW_TICKS = 12;
const NOW_HOT_TICKS = 3;
/** Its edge: a bright band four figure pixels wide inside its ground and a dark line two wide outside it, raised over
 *  the fill so the two never fight for depth. */
const EDGE_M = 4 / PX_PER_M;
const OUTLINE_M = 2 / PX_PER_M;
const EDGE_LIFT = 0.006;
/** An iron blow's edge is drawn twice, the second this far inside the first: its shape says iron, not its colour alone,
 *  for those who cannot tell red from gold. */
const IRON_INSET = 0.2;
/** How far above the ground a mark lies, so it never fights the ground for depth. */
const LIFT = 0.03;
/** An arrow's length and thickness, the share of it its head and its fletching take, and their colours. */
const ARROW_M = 0.75;
const ARROW_THICK = 0.035;
const ARROW_HEAD = 0.1;
const ARROW_FLETCH = 0.2;
const ARROW_COLOURS = { shaft: [0.52, 0.38, 0.22], head: [0.81, 0.88, 1], fletch: [0.93, 0.9, 0.82] } as const;
/** A spark's streak: as long as this much of its flight (seconds), two of a figure's pixels thick, stepping down
 *  steel's sparks' ramp (white-hot, yellow, orange, ember) or its element's as it cools. */
const SPARK_STREAK_S = 0.03;
const SPARK_THICK = 2 / PX_PER_M;
const SPARK_RAMP = rampOf('#7a2a08', '#ff7a1e', '#ffd860', '#fffbe8');
/** An element's mote is a streak at least this long (metres), so a slow one still shows. */
const MOTE_M = 0.04;
const CURVE_STEPS = 24;
/** Each vertex's numbers: x, y, z, then red, green, blue, opacity. */
export const MARK_FLOATS = 7;
/** A mark dithered whole on the ground, `share` of its cells kept: its opacity's code, above 1. */
export const ditherCode = (share: number): number => 1 + Math.min(1, Math.max(0, share));

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
    // Each spark cools a whole stop at a time, solid until it is spent.
    const stop = 3 - Math.min(3, Math.floor((age / life) * 4));
    const colour = (look ? GLOW_RAMPS[look] : SPARK_RAMP)[stop] ?? SPARK_RAMP[0];
    const length = Math.max(look ? MOTE_M : 0, Math.hypot(...velocity) * SPARK_STREAK_S);
    markStreak(out, at, velocity, length, SPARK_THICK, [...colour, 1]);
  }
  for (const value of more) out.push(value);
  for (let start = 0; start < out.length; start += MARK_FLOATS)
    for (let axis = 0; axis < 3; axis += 1) out[start + axis] = (out[start + axis] ?? 0) - (origin[axis] ?? 0);
  return new Float32Array(out);
}

function markTelegraph(out: number[], telegraph: TelegraphMark): void {
  const ground = GROUND[telegraph.shape];
  const progress = Math.min(1, telegraph.elapsed / Math.max(1, telegraph.windup));
  const left = telegraph.windup - telegraph.elapsed;
  const now = left <= NOW_TICKS;
  const hot = now && left > NOW_TICKS - NOW_HOT_TICKS;
  const ramp = telegraph.iron ? IRON : GOLD;
  // Every part is a mark on the ground, its edge dithered whole, so none of it lights the world (`LightLayer`).
  const fill = [...ramp[2], ditherCode(now ? FILL_NOW : FILL)] as const;
  const bright = [...ramp[hot ? 3 : 2], ditherCode(1)] as const;
  const dark = [...ramp[0], ditherCode(1)] as const;
  const [originX, originY, originZ] = telegraph.origin;
  const forward: Point = [Math.sin(telegraph.bearing), -Math.cos(telegraph.bearing)];
  const across: Point = [-forward[1], forward[0]];
  // A point `along` ahead of the origin and `aside` across, on the ground; an edge is raised over the fill.
  const onGround = (along: number, aside: number, lift = LIFT): [number, number, number] => [
    originX + forward[0] * along + across[0] * aside,
    originY + forward[1] * along + across[1] * aside,
    originZ + lift,
  ];
  const quad = (corners: readonly (readonly [number, number, number])[], colour: readonly number[]) => {
    const [first, second, third, fourth] = corners;
    if (!first || !second || !third || !fourth) return;
    for (const corner of [first, second, third, first, third, fourth]) out.push(...corner, ...colour);
  };
  const raised = LIFT + EDGE_LIFT;
  // A strip of edge from `from` to `to` along the lane, between two asides.
  const strip = (from: number, to: number, aside: number, other: number, colour: readonly number[]) =>
    quad(
      [
        onGround(from, aside, raised),
        onGround(to, aside, raised),
        onGround(to, other, raised),
        onGround(from, other, raised),
      ],
      colour,
    );
  const insets = telegraph.iron ? [0, IRON_INSET] : [0];
  const lane = (length: number, width: number) => {
    const far = -0.3 + (length + 0.3) * progress;
    quad([onGround(-0.3, -width), onGround(far, -width), onGround(far, width), onGround(-0.3, width)], fill);
    for (const inset of insets) {
      // A narrow lane's second edge keeps to its own half.
      const side = width - Math.min(inset, width / 2);
      const end = length - inset;
      for (const sign of [-1, 1]) {
        strip(-0.3, end, sign * side, sign * (side - EDGE_M), bright);
        strip(-0.3, end + OUTLINE_M, sign * side, sign * (side + OUTLINE_M), dark);
      }
      strip(end - EDGE_M, end, -side, side, bright);
      strip(end, end + OUTLINE_M, -side, side, dark);
    }
  };
  // A band of the circle about (ahead, 0) between two radii and two angles off the bearing.
  const band = (
    ahead: number,
    [inner, outer]: readonly [number, number],
    [from, to]: readonly [number, number],
    colour: readonly number[],
    lift = LIFT,
  ) => {
    for (let step = 0; step < CURVE_STEPS; step += 1) {
      const [first, second] = [
        from + ((to - from) * step) / CURVE_STEPS,
        from + ((to - from) * (step + 1)) / CURVE_STEPS,
      ];
      const point = (radius: number, angle: number) =>
        onGround(ahead + Math.cos(angle) * radius, Math.sin(angle) * radius, lift);
      quad([point(inner, first), point(outer, first), point(outer, second), point(inner, second)], colour);
    }
  };
  // The edge inside radius `outer` (and its iron double further in), its dark line outside it.
  const edgeIn = (ahead: number, outer: number, arc: readonly [number, number]) => {
    for (const inset of insets) {
      band(ahead, [outer - inset - EDGE_M, outer - inset], arc, bright, raised);
      band(ahead, [outer - inset, outer - inset + OUTLINE_M], arc, dark, raised);
    }
  };
  // The edge outside radius `inner`, its dark line inside it.
  const edgeOut = (inner: number) => {
    for (const inset of insets) {
      band(0, [inner + inset, inner + inset + EDGE_M], WHOLE, bright, raised);
      band(0, [inner + inset - OUTLINE_M, inner + inset], WHOLE, dark, raised);
    }
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
      band(0, [0, ground.length * progress], [-ground.halfArc, ground.halfArc], fill);
      edgeIn(0, ground.length, [-ground.halfArc, ground.halfArc]);
      break;
    case 'ring':
      band(0, [ground.length - (ground.length - ground.inner) * progress, ground.length], WHOLE, fill);
      edgeOut(ground.inner);
      edgeIn(0, ground.length, WHOLE);
      break;
    case 'slam':
    case 'leap': {
      const ahead = telegraph.shape === 'slam' ? ground.length : telegraph.ahead;
      band(ahead, [0, ground.width * progress], WHOLE, fill);
      edgeIn(ahead, ground.width, WHOLE);
      break;
    }
  }
}

/** A whole turn, from straight behind round to straight behind. */
const WHOLE = [-Math.PI, Math.PI] as const;

/** An arrow or a bolt flying at `velocity`, its head at `head`: a steel head, a wooden shaft and pale fletching. */
export function markArrow(out: number[], head: readonly number[], velocity: readonly number[]): void {
  const speed = Math.hypot(velocity[0] ?? 0, velocity[1] ?? 0, velocity[2] ?? 0) || 1;
  const back = (share: number) =>
    [0, 1, 2].map((axis) => (head[axis] ?? 0) - ((velocity[axis] ?? 0) / speed) * ARROW_M * share);
  const { head: steel, shaft, fletch } = ARROW_COLOURS;
  markStreak(out, head, velocity, ARROW_M * ARROW_HEAD, ARROW_THICK, [...steel, 1]);
  markStreak(out, back(ARROW_HEAD), velocity, ARROW_M * (1 - ARROW_HEAD - ARROW_FLETCH), ARROW_THICK / 2, [
    ...shaft,
    1,
  ]);
  markStreak(out, back(1 - ARROW_FLETCH), velocity, ARROW_M * ARROW_FLETCH, ARROW_THICK * 1.5, [...fletch, 1]);
}

/** An arrow or a bolt stuck where it stopped at `place`, flying `way`: its head sunk out of sight, its shaft and
 *  fletching standing out behind. */
export function markStuckArrow(out: number[], place: readonly number[], way: readonly number[]): void {
  const shown = 1 - ARROW_HEAD - ARROW_FLETCH;
  const { shaft, fletch } = ARROW_COLOURS;
  const length = Math.hypot(way[0] ?? 0, way[1] ?? 0, way[2] ?? 0) || 1;
  const tail = [0, 1, 2].map((axis) => (place[axis] ?? 0) - ((way[axis] ?? 0) / length) * ARROW_M * shown);
  markStreak(out, place, way, ARROW_M * shown, ARROW_THICK / 2, [...shaft, 1]);
  markStreak(out, tail, way, ARROW_M * ARROW_FLETCH, ARROW_THICK * 1.5, [...fletch, 1]);
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

/** A ring on the ground about `centre` from radius `inner` to `outer`, in one colour: red, green, blue, opacity; only
 *  the arc between two bearings (radians clockwise from north) with `arc`. */
export function markRing(
  out: number[],
  centre: readonly [number, number, number],
  inner: number,
  outer: number,
  colour: readonly [number, number, number, number],
  arc: readonly [number, number] = [0, 2 * Math.PI],
): void {
  const [x, y, z] = centre;
  const onGround = (radius: number, angle: number) => [
    x + Math.sin(angle) * radius,
    y - Math.cos(angle) * radius,
    z + LIFT,
  ];
  const [start, end] = arc;
  const steps = Math.max(1, Math.ceil((CURVE_STEPS * Math.abs(end - start)) / (2 * Math.PI)));
  for (let step = 0; step < steps; step += 1) {
    const [from, to] = [start + ((end - start) * step) / steps, start + ((end - start) * (step + 1)) / steps];
    const corners = [onGround(inner, from), onGround(outer, from), onGround(outer, to), onGround(inner, to)];
    const [first, second, third, fourth] = corners;
    if (!first || !second || !third || !fourth) continue;
    for (const corner of [first, second, third, first, third, fourth]) out.push(...corner, ...colour);
  }
}
