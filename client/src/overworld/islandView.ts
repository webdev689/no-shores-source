import type { HeightAt, HeightGrid, Point2, Vec3 } from './ground.ts';
import {
  angleDelta,
  clearView,
  eyeFor,
  FIELD_OF_VIEW,
  poseOf,
  projectPoint,
  smooth01,
  TILT,
  type Rig,
} from './overworldCamera.ts';

/**
 * The bird's-eye view of an island's side. Its nodes are those within `reachM` of the ship on the ship's side of
 * the island, or the `few` nearest when none is. The view rises when the ship is within `coastReachM` of a coast,
 * looks inland at the sea camera's own initial tilt, fills `fill` of the picture with the nodes, keeps its height
 * between `lowestM` and `highestM`, and flies in from the sea camera over `flySeconds`.
 */
export const SIDE = {
  reachM: 120_000,
  few: 3,
  coastReachM: 30_000,
  tilt: TILT.initial,
  fill: 0.8,
  lowestM: 1_500,
  highestM: 600_000,
  flySeconds: 2.5,
} as const;

/** The middle of an outline's area (a ring of points). */
export function ringCentre(ring: readonly Point2[]): Point2 {
  let [area, x, y] = [0, 0, 0];
  ring.forEach(([fromX, fromY], index) => {
    const [toX, toY] = ring[(index + 1) % ring.length];
    const cross = fromX * toY - toX * fromY;
    area += cross;
    x += (fromX + toX) * cross;
    y += (fromY + toY) * cross;
  });
  if (area === 0) {
    const count = Math.max(1, ring.length);
    return [
      ring.reduce((sum, point) => sum + point[0], 0) / count,
      ring.reduce((sum, point) => sum + point[1], 0) / count,
    ];
  }
  return [x / (3 * area), y / (3 * area)];
}

/** The middle of a grid's land (its cells above the sea), or null when it holds none. */
export function gridCentre(grid: HeightGrid): Point2 | null {
  let [count, x, y] = [0, 0, 0];
  for (let row = 0; row < grid.height; row++) {
    for (let column = 0; column < grid.width; column++) {
      if (!(grid.heights[row * grid.width + column] > 0)) continue;
      count++;
      x += grid.leftM + (column + 0.5) * grid.cellM;
      y += grid.topM + (row + 0.5) * grid.cellM;
    }
  }
  return count ? [x / count, y / count] : null;
}

/** How far a point is from an outline's nearest edge, metres. */
export function coastDistance(point: Point2, ring: readonly Point2[]): number {
  const [x, y] = coastPoint(point, ring);
  return Math.hypot(x - point[0], y - point[1]);
}

/** The point of a ring's coast nearest a point. */
export function coastPoint(point: Point2, ring: readonly Point2[]): Point2 {
  let nearest: { distance: number; at: Point2 } = { distance: Number.POSITIVE_INFINITY, at: point };
  ring.forEach(([fromX, fromY], index) => {
    const [toX, toY] = ring[(index + 1) % ring.length];
    const [edgeX, edgeY] = [toX - fromX, toY - fromY];
    const lengthSquared = edgeX * edgeX + edgeY * edgeY;
    const share = lengthSquared > 0 ? ((point[0] - fromX) * edgeX + (point[1] - fromY) * edgeY) / lengthSquared : 0;
    const clamped = Math.max(0, Math.min(1, share));
    const onEdge: Point2 = [fromX + edgeX * clamped, fromY + edgeY * clamped];
    const distance = Math.hypot(onEdge[0] - point[0], onEdge[1] - point[1]);
    if (distance < nearest.distance) nearest = { distance, at: onEdge };
  });
  return nearest.at;
}

/** The island whose coast is nearest the ship, and how far it is; null when none is within the view's reach. */
export function nearestIsland(
  ship: Point2,
  rings: readonly (readonly Point2[])[],
  reachM: number = SIDE.coastReachM,
): { readonly index: number; readonly distanceM: number } | null {
  let best: { index: number; distanceM: number } | null = null;
  rings.forEach((ring, index) => {
    const distanceM = coastDistance(ship, ring);
    if (distanceM <= reachM && (!best || distanceM < best.distanceM)) best = { index, distanceM };
  });
  return best;
}

/**
 * The nodes of the island's side the ship is on, nearest first: within reach of the ship, and on the ship's half of
 * the island (seen from its centre, the same way as the ship). With none there, the few nearest, wherever they are.
 */
export function sideNodes<T extends { readonly at: Vec3 }>(
  ship: Point2,
  centre: Point2,
  nodes: readonly T[],
  reachM: number = SIDE.reachM,
  few: number = SIDE.few,
): T[] {
  const away = (node: T) => Math.hypot(node.at[0] - ship[0], node.at[1] - ship[1]);
  const byDistance = nodes
    .map((node, order) => ({ node, order, distance: away(node) }))
    .sort((a, b) => a.distance - b.distance || a.order - b.order);
  const [shipX, shipY] = [ship[0] - centre[0], ship[1] - centre[1]];
  const side = byDistance.filter(
    ({ node, distance }) =>
      distance <= reachM && (node.at[0] - centre[0]) * shipX + (node.at[1] - centre[1]) * shipY >= 0,
  );
  return (side.length ? side : byDistance.slice(0, Math.max(0, few))).map(({ node }) => node);
}

/**
 * The bird's-eye rig that frames the side's nodes: looking inland from the ship at the side's middle, at the side's
 * tilt, from the lowest height (found by halving) that holds every node within the fill of a picture of `aspect`
 * (width over height). With `heightAt` it is lifted or steepened clear of the ground, and a steeper view, which shows
 * less ground, is framed again from higher up until it both clears and holds them.
 */
export function frameSide(
  ship: Point2,
  nodes: readonly { readonly at: Vec3 }[],
  aspect: number,
  heightAt?: HeightAt,
  fovY: number = FIELD_OF_VIEW,
): Rig {
  if (nodes.length === 0) return { focus: [ship[0], ship[1], 0], yaw: 0, tilt: SIDE.tilt, height: SIDE.lowestM };
  const eastings = nodes.map((node) => node.at[0]);
  const southings = nodes.map((node) => node.at[1]);
  const focus: Vec3 = [
    (Math.min(...eastings) + Math.max(...eastings)) / 2,
    (Math.min(...southings) + Math.max(...southings)) / 2,
    Math.max(0, nodes.reduce((sum, node) => sum + node.at[2], 0) / nodes.length),
  ];
  const [east, south] = [focus[0] - ship[0], focus[1] - ship[1]];
  const yaw = east || south ? Math.atan2(east, -south) : 0;
  const viewport = { width: 1000 * aspect, height: 1000 };
  const fits = (tilt: number, height: number) => {
    const pose = poseOf(eyeFor(focus, yaw, tilt, height), fovY);
    return nodes.every((node) => {
      const shown = projectPoint(pose, viewport, node.at);
      return (
        shown.front &&
        Math.abs(shown.x - viewport.width / 2) <= (SIDE.fill * viewport.width) / 2 &&
        Math.abs(shown.y - viewport.height / 2) <= (SIDE.fill * viewport.height) / 2
      );
    });
  };
  const lowestFitting = (tilt: number, lowest: number) => {
    let [low, high] = [lowest, Math.max(lowest, SIDE.highestM)];
    if (fits(tilt, low)) return low;
    for (let i = 0; i < 40 && high - low > 1; i++) {
      const middle = (low + high) / 2;
      if (fits(tilt, middle)) high = middle;
      else low = middle;
    }
    return high;
  };
  let rig: Rig = { focus, yaw, tilt: SIDE.tilt, height: lowestFitting(SIDE.tilt, SIDE.lowestM) };
  for (let pass = 0; heightAt && pass < 4; pass++) {
    const cleared = clearView(focus, yaw, rig.tilt, rig.height, heightAt);
    if (cleared.tilt === rig.tilt) return { ...rig, height: cleared.height };
    rig = { ...rig, tilt: cleared.tilt, height: lowestFitting(cleared.tilt, cleared.height) };
  }
  return rig;
}

/** The fly-in between two rigs at `t` (0 the first, 1 the second), smoothstepped: the bearing turns the short way and
 *  the height changes by even ratios, so the climb from the sea camera to the bird's-eye view reads as one steady
 *  zoom. */
export function flyRig(from: Rig, to: Rig, t: number): Rig {
  const share = smooth01(t);
  return {
    focus: [
      from.focus[0] + (to.focus[0] - from.focus[0]) * share,
      from.focus[1] + (to.focus[1] - from.focus[1]) * share,
      from.focus[2] + (to.focus[2] - from.focus[2]) * share,
    ],
    yaw: from.yaw + angleDelta(from.yaw, to.yaw) * share,
    tilt: from.tilt + (to.tilt - from.tilt) * share,
    height: from.height * (to.height / from.height) ** share,
  };
}
