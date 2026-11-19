// The camera on rails: a shot through key points, its eye and the point it looks at each carried on a Catmull-Rom
// curve, so a cutscene's camera sweeps through its keys without a corner. Times are a key's own seconds; the eye
// eases out of rest at the first key and into rest at the last unless the rail says it keeps moving.

export type Point3 = readonly [number, number, number];

/** One key of a rail: when it is reached (seconds from the rail's start), where the eye is, what it looks at (world
 *  metres, x east, y south, z up), and the lens's vertical field of view (radians) if it changes. */
export interface RailKey {
  readonly at: number;
  readonly eye: Point3;
  readonly look: Point3;
  readonly fov?: number;
}

/** A camera's shot as the game's drawers read one: its eye, the bearing it looks along (0 north, a quarter turn east),
 *  how far below the horizon, and its lens. */
export interface RailShot {
  readonly eye: [number, number, number];
  readonly yaw: number;
  readonly pitch: number;
  readonly fov: number;
}

/** Whether the camera starts and ends at rest: 'both' eases out of the first key and into the last. */
export type RailEase = 'both' | 'in' | 'out' | 'none';

/** The bearing and the drop of a look from `eye` to `target`. */
export function lookAt(eye: Point3, target: Point3): { yaw: number; pitch: number } {
  const [east, south, up] = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
  const length = Math.hypot(east, south, up) || 1;
  return { yaw: Math.atan2(east, -south), pitch: -Math.asin(up / length) };
}

/** 0 to 1 eased in and out, flat at both ends. */
export function smooth(share: number): number {
  const clamped = Math.min(1, Math.max(0, share));
  return clamped * clamped * (3 - 2 * clamped);
}

/** The time on a rail eased as it says: slow out of its first key, slow into its last, each over its first or last
 *  segment's share of the whole. */
function easedTime(keys: readonly RailKey[], time: number, ease: RailEase): number {
  const start = keys[0]?.at ?? 0;
  const end = keys[keys.length - 1]?.at ?? 0;
  const length = end - start;
  if (length <= 0 || ease === 'none') return time;
  const share = Math.min(1, Math.max(0, (time - start) / length));
  // A cubic whose slope is 0 at an eased end and 1 elsewhere, so the middle keeps the rail's own pace.
  const easeIn = ease === 'both' || ease === 'in';
  const easeOut = ease === 'both' || ease === 'out';
  const slopeStart = easeIn ? 0 : 1;
  const slopeEnd = easeOut ? 0 : 1;
  const [square, cube] = [share * share, share * share * share];
  const eased = (cube - 2 * square + share) * slopeStart + (-2 * cube + 3 * square) + (cube - square) * slopeEnd;
  return start + eased * length;
}

/** A Catmull-Rom point between `b` and `c` at `share`, `a` and `d` their neighbours (the ends doubled). */
function catmullRom(a: Point3, b: Point3, c: Point3, d: Point3, share: number): [number, number, number] {
  const [square, cube] = [share * share, share * share * share];
  const along = (axis: 0 | 1 | 2) =>
    0.5 *
    (2 * b[axis] +
      (c[axis] - a[axis]) * share +
      (2 * a[axis] - 5 * b[axis] + 4 * c[axis] - d[axis]) * square +
      (3 * b[axis] - a[axis] - 3 * c[axis] + d[axis]) * cube);
  return [along(0), along(1), along(2)];
}

/** The rail's shot at `time`: before its first key at the first, after its last at the last. */
export function railShot(keys: readonly RailKey[], time: number, fov: number, ease: RailEase = 'both'): RailShot {
  const first = keys[0];
  if (!first) throw new Error('a rail needs at least one key');
  const eased = easedTime(keys, time, ease);
  let segment = 0;
  while (segment < keys.length - 2 && eased > (keys[segment + 1]?.at ?? Infinity)) segment++;
  const at = (index: number): RailKey => keys[Math.min(keys.length - 1, Math.max(0, index))] ?? first;
  const [before, from, to, after] = [at(segment - 1), at(segment), at(segment + 1), at(segment + 2)];
  const span = to.at - from.at;
  const share = span > 0 ? Math.min(1, Math.max(0, (eased - from.at) / span)) : 1;
  const eye = catmullRom(before.eye, from.eye, to.eye, after.eye, share);
  const look = catmullRom(before.look, from.look, to.look, after.look, share);
  const lens = (key: RailKey) => key.fov ?? fov;
  return { eye, ...lookAt(eye, look), fov: lens(from) + (lens(to) - lens(from)) * smooth(share) };
}

/** How long a rail runs, seconds. */
export function railLength(keys: readonly RailKey[]): number {
  return (keys[keys.length - 1]?.at ?? 0) - (keys[0]?.at ?? 0);
}

/** A rail's keys moved by `offset` (world metres) and shifted in time by `delay` seconds. */
export function railMoved(keys: readonly RailKey[], offset: Point3, delay = 0): RailKey[] {
  const moved = (point: Point3): Point3 => [point[0] + offset[0], point[1] + offset[1], point[2] + offset[2]];
  return keys.map((key) => ({ ...key, at: key.at + delay, eye: moved(key.eye), look: moved(key.look) }));
}

/** A point `distance` metres from `centre` on the bearing `yaw` (0 north), `height` metres over it. */
export function around(centre: Point3, yaw: number, distance: number, height: number): Point3 {
  return [centre[0] + Math.sin(yaw) * distance, centre[1] - Math.cos(yaw) * distance, centre[2] + height];
}
