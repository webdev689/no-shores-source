import type { Orbit } from '../editor/orbit.ts';

/**
 * The game's one camera, whatever drives it (a player's shoulder on foot, the Overworld's raised eye at sea): where
 * the eye is in world metres (x east, y south, z up), the bearing it looks along and how far down, and how near and
 * far it draws. Every drawer is handed the same matrices, measured from the eye, depth reversed (1 near, 0 far), as
 * the editor's orbit camera makes them.
 */
export interface Shot {
  readonly eye: readonly [number, number, number];
  /** Compass bearing looked along, radians: 0 north, a quarter turn east. */
  readonly yaw: number;
  /** How far below the horizon it looks, radians. */
  readonly pitch: number;
  /** The vertical field of view, radians. */
  readonly fov: number;
  readonly near: number;
  readonly far: number;
}

type Vector = [number, number, number];

/** A shot `share` of the way (0 to 1, eased by the caller) from `from` to `to`: its eye, pitch and lens straight, its
 *  bearing the short way round, its near plane the target's past half way, its far plane the first's. */
export function panShot(from: Shot, to: Shot, share: number): Shot {
  const mix = (start: number, end: number) => start * (1 - share) + end * share;
  const turn = Math.atan2(Math.sin(to.yaw - from.yaw), Math.cos(to.yaw - from.yaw));
  return {
    eye: [mix(from.eye[0], to.eye[0]), mix(from.eye[1], to.eye[1]), mix(from.eye[2], to.eye[2])],
    yaw: from.yaw + turn * share,
    pitch: mix(from.pitch, to.pitch),
    fov: mix(from.fov, to.fov),
    near: share > 0.5 ? to.near : from.near,
    far: from.far,
  };
}

/** The camera's directions and depth law, in the shape the land's and the water's drawers read. */
export interface CameraFrame {
  readonly eye: Vector;
  readonly forward: Vector;
  readonly right: Vector;
  readonly up: Vector;
  readonly near: number;
  readonly far: number;
  readonly depthScale: number;
  readonly depthOffset: number;
}

/** A shot's directions: right is a quarter turn clockwise of the bearing, so east is right when looking north. */
export function frameOf(shot: Shot): CameraFrame {
  const [cosYaw, sinYaw] = [Math.cos(shot.yaw), Math.sin(shot.yaw)];
  const [cosPitch, sinPitch] = [Math.cos(shot.pitch), Math.sin(shot.pitch)];
  const { near, far } = shot;
  return {
    eye: [...shot.eye],
    forward: [cosPitch * sinYaw, -cosPitch * cosYaw, -sinPitch],
    right: [cosYaw, sinYaw, 0],
    up: [sinPitch * sinYaw, -sinPitch * cosYaw, cosPitch],
    near,
    far,
    depthScale: near / (far - near),
    depthOffset: (near * far) / (far - near),
  };
}

const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** View then projection as a column-major matrix for points measured from the eye. `aspect` is width over height. */
export function fromEyeMatrix(shot: Shot, aspect: number): Float32Array {
  const { forward, right, up, depthScale, depthOffset } = frameOf(shot);
  const focal = 1 / Math.tan(shot.fov / 2);
  const rows = [
    right.map((value) => (value * focal) / aspect).concat(0),
    up.map((value) => value * focal).concat(0),
    forward.map((value) => -value * depthScale).concat(depthOffset),
    forward.map((value) => value).concat(0),
  ];
  const matrix = new Float32Array(16);
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 4; column++) matrix[column * 4 + row] = rows[row]?.[column] ?? 0;
  }
  return matrix;
}

/** A camera's matrix from the eye (column-major), taking points `offset` metres off from the eye: a point p maps as
 *  p + offset would. Worked in double precision, so a world far from its origin keeps its centimetres. */
export function shifted(fromEye: Float32Array, offset: readonly [number, number, number]): Float32Array {
  const out = Float32Array.from(fromEye);
  for (let row = 0; row < 4; row += 1) {
    const term = (column: number) => fromEye[column * 4 + row] ?? 0;
    out[12 + row] = term(0) * offset[0] + term(1) * offset[1] + term(2) * offset[2] + term(3);
  }
  return out;
}

/** Where a world point lands on the screen in pixels (x right, y down), or null behind the eye. */
export function onScreen(
  shot: Shot,
  size: { readonly width: number; readonly height: number },
  point: readonly [number, number, number],
): [number, number] | null {
  const { forward, right, up } = frameOf(shot);
  const offset: Vector = [point[0] - shot.eye[0], point[1] - shot.eye[1], point[2] - shot.eye[2]];
  const ahead = dot(offset, forward);
  if (ahead <= shot.near) return null;
  const focal = 1 / Math.tan(shot.fov / 2);
  const across = (dot(offset, right) / ahead) * focal * (size.height / size.width);
  const upward = (dot(offset, up) / ahead) * focal;
  return [((across + 1) / 2) * size.width, ((1 - upward) / 2) * size.height];
}

/** The shot a player's orbit camera takes (its eye back from its target along its look, its lens narrowed by the
 *  orbit's zoom), held `clearance` over the ground under the eye where the ground is known, so a camera pulled back up
 *  a slope never looks out from under it. */
export function shotOfOrbit(
  orbit: Orbit,
  lens: { readonly fov: number; readonly near: number; readonly far: number },
  groundAt: (x: number, y: number) => number | null,
  clearance: number,
): Shot {
  const { forward } = frameOf({ eye: [0, 0, 0], yaw: orbit.yaw, pitch: orbit.pitch, ...lens });
  const eye: [number, number, number] = [
    orbit.targetX - forward[0] * orbit.distance,
    orbit.targetY - forward[1] * orbit.distance,
    orbit.targetZ - forward[2] * orbit.distance,
  ];
  const ground = groundAt(eye[0], eye[1]);
  if (ground !== null && eye[2] < ground + clearance) eye[2] = ground + clearance;
  const fov = 2 * Math.atan(Math.tan(lens.fov / 2) / (orbit.zoom ?? 1));
  return { eye, yaw: orbit.yaw, pitch: orbit.pitch, ...lens, fov };
}

/** The look of a forward vector (east, south, up) as a bearing and a pitch below the horizon. */
export function lookOf(forward: readonly [number, number, number]): { yaw: number; pitch: number } {
  const length = Math.hypot(...forward) || 1;
  return { yaw: Math.atan2(forward[0], -forward[1]), pitch: -Math.asin(forward[2] / length) };
}
