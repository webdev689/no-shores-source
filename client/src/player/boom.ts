import type { Block } from '../rules/movementRules.ts';

type Point = readonly [number, number, number];

const AXES = [0, 1, 2] as const;

/** The third-person camera's boom kept in sight: pulled in where a block or the ground stands between the head and
 *  the camera, to stand `clearance` metres off it; eased in at `inRate` and let out at `outRate` (shares a second), so
 *  it never snaps; and never nearer a block than `closest` however it eases, so the near plane (0.1 m) never cuts
 *  through a wall. The ground is felt every `groundStep` metres along the boom. */
export const BOOM = { clearance: 0.25, closest: 0.12, inRate: 20, outRate: 3, groundStep: 0.2 } as const;

/** How far along the line from `from` to `to` (metres) it first comes within `clearance` of a block: the block grown
 *  by the clearance on every side, or the block itself where `from` is already within the clearance of it, and a
 *  block `from` stands inside is passed. The whole length where it meets none. */
export function blockReach(from: Point, to: Point, blocks: readonly Block[], clearance: number): number {
  const delta = [to[0] - from[0], to[1] - from[1], to[2] - from[2]] as const;
  const length = Math.hypot(...delta);
  const [lowX, highX] = [Math.min(from[0], to[0]) - clearance, Math.max(from[0], to[0]) + clearance];
  const [lowY, highY] = [Math.min(from[1], to[1]) - clearance, Math.max(from[1], to[1]) + clearance];
  const [lowZ, highZ] = [Math.min(from[2], to[2]) - clearance, Math.max(from[2], to[2]) + clearance];
  let nearest = 1;
  for (const block of blocks) {
    // Most of a node's thousands of boxes are nowhere near the boom.
    if (block.maxX < lowX || block.minX > highX || block.maxY < lowY || block.minY > highY) continue;
    if (block.top < lowZ || block.bottom > highZ) continue;
    const lows = [block.minX, block.minY, block.bottom] as const;
    const highs = [block.maxX, block.maxY, block.top] as const;
    const inside = (grow: number) =>
      AXES.every((axis) => from[axis] > lows[axis] - grow && from[axis] < highs[axis] + grow);
    if (inside(0)) continue;
    const grow = inside(clearance) ? 0 : clearance;
    let enter = 0;
    let leave = 1;
    for (const axis of AXES) {
      const [low, high] = [lows[axis] - grow, highs[axis] + grow];
      if (Math.abs(delta[axis]) < 1e-9) {
        if (from[axis] < low || from[axis] > high) leave = -1;
        continue;
      }
      const [first, second] = [(low - from[axis]) / delta[axis], (high - from[axis]) / delta[axis]];
      enter = Math.max(enter, Math.min(first, second));
      leave = Math.min(leave, Math.max(first, second));
    }
    if (enter <= leave && enter < nearest) nearest = enter;
  }
  return nearest * length;
}

/** How far along the line from `from` to `to` (metres) it stays `clearance` over the ground, felt every
 *  `BOOM.groundStep`: the last point felt clear before the first that is not. The whole length where it all is. */
export function groundReach(
  from: Point,
  to: Point,
  groundAt: (x: number, y: number, z?: number) => number | null,
  clearance: number,
): number {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const steps = Math.ceil(length / BOOM.groundStep);
  for (let step = 1; step <= steps; step++) {
    const share = Math.min(1, step / steps);
    const [x, y, z] = AXES.map((axis) => from[axis] + (to[axis] - from[axis]) * share) as [number, number, number];
    const ground = groundAt(x, y, z);
    if (ground !== null && z < ground + clearance) return ((step - 1) / steps) * length;
  }
  return length;
}

/** How far along the line from `from` to `to` (a share, 0 to 1) it stays `clearance` under the ceiling `roof` gives
 *  over each point, felt every `BOOM.groundStep` at the point's own height; where it is not, the crossing between the
 *  last point felt clear and the first that is not, so a flat ceiling or a flight's sloped one stops it where met. */
export function roofShare(
  from: Point,
  to: Point,
  roof: (x: number, y: number, z?: number) => number | null,
  clearance: number,
): number {
  const steps = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]) / BOOM.groundStep));
  // How far over the ceiling less the clearance the line stands at a share of it; never over where there is none.
  const over = (share: number) => {
    const [x, y, z] = AXES.map((axis) => from[axis] + (to[axis] - from[axis]) * share) as [number, number, number];
    const ceiling = roof(x, y, z);
    return ceiling === null ? Number.NEGATIVE_INFINITY : z - (ceiling - clearance);
  };
  let [last, before] = [0, over(0)];
  for (let step = 1; step <= steps; step++) {
    const [share, now] = [step / steps, over(step / steps)];
    if (now > 0)
      return before > 0 || !Number.isFinite(before) ? last : last + ((share - last) * -before) / (now - before);
    [last, before] = [share, now];
  }
  return 1;
}

/** How far out the boom from `head` to `want` stands clear of the blocks and the ground by `clearance`, metres. */
export function boomReach(
  head: Point,
  want: Point,
  blocks: readonly Block[],
  groundAt: ((x: number, y: number, z?: number) => number | null) | null,
  clearance: number,
): number {
  const byBlocks = blockReach(head, want, blocks, clearance);
  return groundAt ? Math.min(byBlocks, groundReach(head, want, groundAt, clearance)) : byBlocks;
}

/** The boom's length shown next, eased from `shown` toward `clear` over `seconds`: in fast, out slowly. Infinite,
 *  meaning the boom stands as long as it is meant to, once it is out to `length` with nothing in the way. */
export function boomEased(shown: number, clear: number, length: number, seconds: number): number {
  const from = Math.min(shown, length);
  if (clear >= length && from >= length) return Number.POSITIVE_INFINITY;
  const target = Math.min(clear, length);
  const next = from + (target - from) * Math.min(1, seconds * (target < from ? BOOM.inRate : BOOM.outRate));
  return clear >= length && next >= length - 1e-3 ? Number.POSITIVE_INFINITY : next;
}
