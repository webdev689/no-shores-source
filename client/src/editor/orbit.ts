import type { TerrainData } from './terrainView.ts';

/**
 * A camera circling a point on the terrain. World axes: x east, y south (metres from the landmass window's north-west
 * corner), z up. `yaw` is the compass bearing the camera looks along (0 north, a quarter turn east), `pitch` how far
 * it looks down from the horizon, `distance` how far the camera sits from the target.
 */
export interface Orbit {
  readonly targetX: number;
  readonly targetY: number;
  readonly targetZ: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly distance: number;
}

/** A line from the camera through a screen point, in world metres. `direction` has length 1. */
export interface Ray {
  readonly origin: [number, number, number];
  readonly direction: [number, number, number];
}

/** The vertical field of view: 50 degrees. */
export const FIELD_OF_VIEW = (50 * Math.PI) / 180;

/** Just above the horizon to almost straight down. */
export const PITCH_LIMITS = { lowest: 0.05, highest: 1.5 } as const;

/** The closest and farthest the camera sits from its target: 3 m, over a walker's shoulder, to 5,000 km. */
export const DISTANCE_LIMITS = { closest: 3, farthest: 5_000_000 } as const;

type Vector = [number, number, number];

const clamp = (value: number, lowest: number, highest: number) => Math.min(highest, Math.max(lowest, value));

/**
 * The camera's position and the world directions of its forward, screen-right and screen-up. Right is built from
 * the bearing (a quarter turn clockwise of it), not from a cross product, so east is on the right when looking north
 * whatever the handedness of a south-pointing y.
 */
function cameraFrame(orbit: Orbit) {
  const cosYaw = Math.cos(orbit.yaw);
  const sinYaw = Math.sin(orbit.yaw);
  const cosPitch = Math.cos(orbit.pitch);
  const sinPitch = Math.sin(orbit.pitch);
  const forward: Vector = [cosPitch * sinYaw, -cosPitch * cosYaw, -sinPitch];
  const right: Vector = [cosYaw, sinYaw, 0];
  const up: Vector = [sinPitch * sinYaw, -sinPitch * cosYaw, cosPitch];
  const eye: Vector = [
    orbit.targetX - forward[0] * orbit.distance,
    orbit.targetY - forward[1] * orbit.distance,
    orbit.targetZ - forward[2] * orbit.distance,
  ];
  return { eye, forward, right, up };
}

const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * The camera's place and directions, the nearest and farthest it draws (metres), and how a point's distance ahead
 * maps to depth: the near plane at 1 and the far at 0, reversed so 32-bit depth keeps its precision far off. A
 * depth d lies `depthOffset / (d + depthScale)` metres ahead.
 */
export function cameraOf(orbit: Orbit) {
  const [near, far] = [Math.max(0.25, orbit.distance / 1000), orbit.distance * 20 + 50_000];
  return {
    ...cameraFrame(orbit),
    near,
    far,
    depthScale: near / (far - near),
    depthOffset: (near * far) / (far - near),
  };
}

/** How a view drawn with `viewProjection` tests depth, since its depth is reversed: cleared to the far plane's 0, a
 *  fragment kept where its depth is greater, being nearer, in 32-bit floats for the precision reversing it is for. */
export const REVERSED_DEPTH = { format: 'depth32float', clearValue: 0, compare: 'greater' } as const;

/**
 * World to clip space as a column-major 4x4 matrix, depth reversed: 1 at the near plane, 0 at the far. `aspect` is the
 * viewport's width over its height. `fromEye` takes points measured from the camera instead, so a GPU's floats keep
 * their centimetres however far the window's corner lies.
 */
export function viewProjection(orbit: Orbit, aspect: number, fromEye = false): Float32Array {
  const { eye: placed, forward, right, up, depthScale, depthOffset } = cameraOf(orbit);
  const eye: Vector = fromEye ? [0, 0, 0] : placed;
  const focal = 1 / Math.tan(FIELD_OF_VIEW / 2);
  // View space looks down its -z: x along `right`, y along `up`, z against `forward`.
  const viewRows = [
    [...right, -dot(right, eye)],
    [...up, -dot(up, eye)],
    [-forward[0], -forward[1], -forward[2], dot(forward, eye)],
  ] as const;
  const clipRows = [
    viewRows[0].map((value) => (value * focal) / aspect),
    viewRows[1].map((value) => value * focal),
    viewRows[2].map((value, column) => value * depthScale + (column === 3 ? depthOffset : 0)),
    viewRows[2].map((value) => -value),
  ];
  const matrix = new Float32Array(16);
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 4; column++) matrix[column * 4 + row] = clipRows[row]?.[column] ?? 0;
  }
  return matrix;
}

/** Turns the camera around its target; the pitch stays between `lowest` (just above the horizon, unless a swimmer
 *  looks up) and almost straight down. */
export function rotateOrbit(
  orbit: Orbit,
  yawChange: number,
  pitchChange: number,
  lowest: number = PITCH_LIMITS.lowest,
): Orbit {
  const pitch = clamp(orbit.pitch + pitchChange, lowest, PITCH_LIMITS.highest);
  return { ...orbit, yaw: orbit.yaw + yawChange, pitch };
}

/** Moves the camera toward (`factor` below 1) or away from its target, within the distance limits. */
export function zoomOrbit(orbit: Orbit, factor: number): Orbit {
  const distance = clamp(orbit.distance * factor, DISTANCE_LIMITS.closest, DISTANCE_LIMITS.farthest);
  return { ...orbit, distance };
}

/**
 * Moves the target over the ground by a drag of `dxPixels`, `dyPixels` (screen y down), so the ground at the centre
 * follows the pointer: across the view by the metres a pixel covers at the target, along it by that over the sine of
 * the pitch, since a tilted view foreshortens the ground ahead.
 */
export function panOrbit(orbit: Orbit, dxPixels: number, dyPixels: number, viewportHeight: number): Orbit {
  const metresPerPixel = (2 * orbit.distance * Math.tan(FIELD_OF_VIEW / 2)) / viewportHeight;
  const across = -dxPixels * metresPerPixel;
  const along = (dyPixels * metresPerPixel) / Math.sin(orbit.pitch);
  const cosYaw = Math.cos(orbit.yaw);
  const sinYaw = Math.sin(orbit.yaw);
  return {
    ...orbit,
    targetX: orbit.targetX + across * cosYaw + along * sinYaw,
    targetY: orbit.targetY + across * sinYaw - along * cosYaw,
  };
}

/** A view from the south of a window `widthM` by `heightM` metres that shows all of it. */
export function fitOrbit(widthM: number, heightM: number, aspect: number): Orbit {
  const span = Math.max(widthM / aspect, heightM);
  const distance = clamp((span * 0.7) / Math.tan(FIELD_OF_VIEW / 2), DISTANCE_LIMITS.closest, DISTANCE_LIMITS.farthest);
  return { targetX: widthM / 2, targetY: heightM / 2, targetZ: 0, yaw: 0, pitch: 0.9, distance };
}

/** The ray from the camera through a screen point given in normalised device coordinates (-1..1, y up). */
export function rayAt(orbit: Orbit, aspect: number, ndcX: number, ndcY: number): Ray {
  const { eye, forward, right, up } = cameraFrame(orbit);
  const halfHeight = Math.tan(FIELD_OF_VIEW / 2);
  const across = ndcX * halfHeight * aspect;
  const upward = ndcY * halfHeight;
  const raw: Vector = [0, 1, 2].map((axis) => forward[axis] + right[axis] * across + up[axis] * upward) as Vector;
  const length = Math.hypot(...raw);
  return { origin: eye, direction: [raw[0] / length, raw[1] / length, raw[2] / length] };
}

/** The drawn surface over a cell before exaggeration: land, a lake's surface, or the sea at 0. */
function cellTop(data: TerrainData, column: number, row: number): number {
  const index = row * data.width + column;
  return Math.max(data.heights[index], data.lakes[index], 0);
}

/** The drawn surface at a world point, blended between the four nearest cell centres as the mesh is. */
function surfaceAt(data: TerrainData, x: number, y: number): number {
  const column = clamp(x / data.cellM - 0.5, 0, data.width - 1);
  const row = clamp(y / data.cellM - 0.5, 0, data.height - 1);
  const left = Math.floor(column);
  const top = Math.floor(row);
  const right = Math.min(left + 1, data.width - 1);
  const bottom = Math.min(top + 1, data.height - 1);
  const across = column - left;
  const down = row - top;
  const north = cellTop(data, left, top) * (1 - across) + cellTop(data, right, top) * across;
  const south = cellTop(data, left, bottom) * (1 - across) + cellTop(data, right, bottom) * across;
  return north * (1 - down) + south * down;
}

/**
 * The stretch of the ray over the window, cut where it drops below sea level since nothing drawn lies lower. Null
 * if it misses the window or never ends there (a ray straight up).
 */
function windowSpan(ray: Ray, data: TerrainData): { enter: number; leave: number } | null {
  let enter = 0;
  let leave = Infinity;
  const sizes = [data.width * data.cellM, data.height * data.cellM];
  for (const axis of [0, 1]) {
    const start = ray.origin[axis];
    const step = ray.direction[axis];
    const size = sizes[axis];
    if (step === 0) {
      if (start < 0 || start > size) return null;
      continue;
    }
    const first = -start / step;
    const second = (size - start) / step;
    enter = Math.max(enter, Math.min(first, second));
    leave = Math.min(leave, Math.max(first, second));
  }
  if (ray.direction[2] < 0) leave = Math.min(leave, -ray.origin[2] / ray.direction[2]);
  return enter <= leave && Number.isFinite(leave) ? { enter, leave } : null;
}

/**
 * The first point where a ray meets the drawn terrain (heights times `exaggeration`, water at its surface), or null
 * if it misses the window. Marches half a cell at a time, then halves the last step until it is a millimetre long.
 */
export function pickTerrain(ray: Ray, data: TerrainData, exaggeration: number): { x: number; y: number } | null {
  const span = windowSpan(ray, data);
  if (!span) return null;
  const [originX, originY, originZ] = ray.origin;
  const [directionX, directionY, directionZ] = ray.direction;
  const pointAt = (t: number) => ({ x: originX + directionX * t, y: originY + directionY * t });
  const clearance = (t: number) => {
    const point = pointAt(t);
    return originZ + directionZ * t - surfaceAt(data, point.x, point.y) * exaggeration;
  };
  if (clearance(span.enter) <= 0) return pointAt(span.enter);
  let above = span.enter;
  for (let t = above + data.cellM / 2; above < span.leave; t += data.cellM / 2) {
    let below = Math.min(t, span.leave);
    if (clearance(below) > 0) {
      above = below;
      continue;
    }
    while (below - above > 0.001) {
      const middle = (above + below) / 2;
      if (clearance(middle) > 0) above = middle;
      else below = middle;
    }
    return pointAt(below);
  }
  return null;
}
