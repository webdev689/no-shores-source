import type { FlyingShot } from '../network/messages.ts';
import type { Action, Shape } from './fighter.ts';

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
/** How far above the ground a mark lies, so it never fights the ground for depth. */
const LIFT = 0.03;
/** An arrow's length and thickness, its colour, and the steps a curve is drawn in. */
const ARROW_M = 0.75;
const ARROW_THICK = 0.035;
const ARROW_COLOUR = [0.52, 0.38, 0.22, 1] as const;
const CURVE_STEPS = 24;
/** Each vertex's numbers: x, y, z, then red, green, blue, opacity. */
export const MARK_FLOATS = 7;

type Point = readonly [number, number];

/** The triangles of every telegraphed blow's mark and every arrow in flight, as vertices of MARK_FLOATS numbers. */
export function marksMesh(telegraphs: readonly TelegraphMark[], shots: readonly FlyingShot[]): Float32Array {
  const out: number[] = [];
  for (const telegraph of telegraphs) markTelegraph(out, telegraph);
  for (const shot of shots) markShot(out, shot);
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
    quad(
      [
        onGround(-0.3, -width),
        onGround(length, -width),
        onGround(length, -width + EDGE_M),
        onGround(-0.3, -width + EDGE_M),
      ],
      edge,
    );
    quad(
      [
        onGround(-0.3, width - EDGE_M),
        onGround(length, width - EDGE_M),
        onGround(length, width),
        onGround(-0.3, width),
      ],
      edge,
    );
    quad(
      [
        onGround(length - EDGE_M, -width),
        onGround(length, -width),
        onGround(length, width),
        onGround(length - EDGE_M, width),
      ],
      edge,
    );
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
      band(0, ground.length - EDGE_M, ground.length, -ground.halfArc, ground.halfArc, edge);
      break;
    case 'ring':
      band(0, ground.length - (ground.length - ground.inner) * progress, ground.length, -Math.PI, Math.PI, fill);
      band(0, ground.inner, ground.inner + EDGE_M, -Math.PI, Math.PI, edge);
      band(0, ground.length - EDGE_M, ground.length, -Math.PI, Math.PI, edge);
      break;
    case 'slam':
    case 'leap': {
      const ahead = telegraph.shape === 'slam' ? ground.length : telegraph.ahead;
      band(ahead, 0, ground.width * progress, -Math.PI, Math.PI, fill);
      band(ahead, ground.width - EDGE_M, ground.width, -Math.PI, Math.PI, edge);
      break;
    }
  }
}

/** An arrow or a bolt: two thin crossed strips along its flight, so it shows from any side. */
function markShot(out: number[], shot: FlyingShot): void {
  const [x, y, z] = shot.at;
  const [eastward, southward, upward] = shot.velocity;
  const speed = Math.hypot(eastward, southward, upward);
  if (speed <= 0 || speed > 1000) return;
  const along = [eastward / speed, southward / speed, upward / speed] as const;
  const tail = [x - along[0] * ARROW_M, y - along[1] * ARROW_M, z - along[2] * ARROW_M] as const;
  const flat = Math.hypot(along[0], along[1]) || 1;
  const sides = [
    [-along[1] / flat, along[0] / flat, 0],
    [0, 0, 1],
  ] as const;
  for (const side of sides) {
    const offset = (point: readonly number[], sign: number) =>
      [0, 1, 2].map((axis) => (point[axis] ?? 0) + (side[axis] ?? 0) * ARROW_THICK * sign);
    const corners = [offset(tail, -1), offset([x, y, z], -1), offset([x, y, z], 1), offset(tail, 1)];
    const [first, second, third, fourth] = corners;
    if (!first || !second || !third || !fourth) continue;
    for (const corner of [first, second, third, first, third, fourth]) out.push(...corner, ...ARROW_COLOUR);
  }
}
