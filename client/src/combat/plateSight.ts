// Which plates over foes show, and how big, after DFO's law for the names over other players: a plate shows near the
// crosshair and fades in and out at the cone's edge, while the foes the player fought in the last minute always show;
// it shrinks with distance as the figure under it does, and never grows; and it is never seen through a block, nor
// past the reach names had. So a crowd off to the side, or behind a wall, puts nothing over the world.

type Point = readonly [number, number, number];

/** The cone round the crosshair: whole within `degrees - band / 2`, none past `degrees + band / 2`; and how long a
 *  plate takes to fade all the way in or out, in seconds. */
export const CONE = { degrees: 20, band: 6, fadeSeconds: 0.25 } as const;
/** Plates farther than this from the eye, across the ground, are not drawn, in metres. */
export const PLATE_RANGE_M = 60;
/** How long the line to a foe's head must stay blocked before its plate goes, in seconds (it comes back at once), and
 *  how far short of the head the line stops, so the ground or a lintel at the head blinds nothing, in metres. */
export const SIGHT_HOLD_SECONDS = 0.15;
export const SIGHT_SKIN_M = 0.2;
/** The size law: a plate is drawn whole as near as `reference / most` metres through a lens of `lens` radians, and
 *  shrinks as its figure does out to `reference / least` metres; its name's letters (`letters` pixels whole) are
 *  never drawn under `fewestLetters` pixels. */
export const PLATE_SIZE = { reference: 18, least: 0.55, most: 1.5, lens: Math.PI / 3, letters: 12, fewestLetters: 9 };

/** How much of a plate the cone shows at `off` degrees from the crosshair: all of it for a foe the player fought. */
export function coneWant(off: number, fought: boolean): number {
  if (fought || !Number.isFinite(off)) return 1;
  const inner = CONE.degrees - CONE.band / 2;
  return Math.max(0, Math.min(1, 1 - (off - inner) / CONE.band));
}

/** One frame's step from `was` toward `want`, `seconds` on, never more than the fade allows; a plate with nothing
 *  shown before (null) starts at its want, so one past the cone starts hidden and pops in from nowhere. */
export function coneStep(was: number | null, want: number, seconds: number): number {
  if (was === null) return want;
  const most = Math.max(0, seconds) / CONE.fadeSeconds;
  return was + Math.max(-most, Math.min(most, want - was));
}

/** A plate's size as a share of its whole, its figure `depth` metres before the eye through a lens of focal length
 *  `focal` (1 over the tangent of half its height's angle). */
export function plateScale(depth: number, focal: number): number {
  const { reference, least, most, lens, letters, fewestLetters } = PLATE_SIZE;
  const byDepth = Number.isFinite(depth) && depth > 0 ? Math.min(most, Math.max(least, reference / depth)) : most;
  const byLens = Number.isFinite(focal) && focal > 0 ? focal * Math.tan(lens / 2) : 1;
  return Math.min(1, Math.max(fewestLetters / letters, (byDepth * byLens) / most));
}

/** What a camera's matrix (clip = matrix × point, column by column) says of it: where the eye stands, the way it looks
 *  (a unit vector) and its focal length; null for a matrix that is no camera's. */
export function cameraOf(matrix: ArrayLike<number>): { eye: Point; forward: Point; focal: number } | null {
  const cell = (index: number) => matrix[index] ?? 0;
  // The eye is the one point every clip x, y and w is nought at.
  const rows = [
    [cell(0), cell(4), cell(8), -cell(12)],
    [cell(1), cell(5), cell(9), -cell(13)],
    [cell(3), cell(7), cell(11), -cell(15)],
  ] as const;
  const det3 = (one: Point, two: Point, three: Point) =>
    one[0] * (two[1] * three[2] - two[2] * three[1]) -
    one[1] * (two[0] * three[2] - two[2] * three[0]) +
    one[2] * (two[0] * three[1] - two[1] * three[0]);
  const column = (index: number) => [rows[0][index], rows[1][index], rows[2][index]] as const;
  const whole = det3(column(0), column(1), column(2));
  const forwardLength = Math.hypot(cell(3), cell(7), cell(11));
  if (Math.abs(whole) < 1e-12 || forwardLength < 1e-12) return null;
  const eye = [0, 1, 2].map((swapped) => {
    const columns = [0, 1, 2].map((index) => column(index === swapped ? 3 : index));
    return det3(columns[0] ?? [0, 0, 0], columns[1] ?? [0, 0, 0], columns[2] ?? [0, 0, 0]) / whole;
  });
  const forward = [cell(3) / forwardLength, cell(7) / forwardLength, cell(11) / forwardLength] as const;
  return { eye: [eye[0] ?? 0, eye[1] ?? 0, eye[2] ?? 0], forward, focal: Math.hypot(cell(1), cell(5), cell(9)) };
}

/** Degrees between the way a camera looks and a point, seen from its eye. */
export function offDegrees(camera: { readonly eye: Point; readonly forward: Point }, point: Point): number {
  const toward = [point[0] - camera.eye[0], point[1] - camera.eye[1], point[2] - camera.eye[2]] as const;
  const length = Math.hypot(...toward);
  if (length < 1e-9) return 0;
  const cosine =
    (toward[0] * camera.forward[0] + toward[1] * camera.forward[1] + toward[2] * camera.forward[2]) / length;
  return (Math.acos(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI;
}

/** Each plate's sight, kept from frame to frame: how long the line to its head has stayed blocked. */
export class PlateSight {
  private readonly blockedFor = new Map<number, number>();

  /** Whether plate `id` is hidden, its line `blocked` now, `seconds` after the last frame: once it has been blocked
   *  for the hold, and never on a frame it is seen, so a railing crossing the line for a frame takes nothing away. */
  hidden(id: number, blocked: boolean, seconds: number): boolean {
    if (!blocked) {
      this.blockedFor.delete(id);
      return false;
    }
    const was = this.blockedFor.get(id);
    const now = was === undefined ? 0 : was + seconds;
    this.blockedFor.set(id, now);
    return now >= SIGHT_HOLD_SECONDS;
  }

  /** Forgets every plate not in `kept`. */
  keep(kept: ReadonlySet<number>): void {
    for (const id of this.blockedFor.keys()) if (!kept.has(id)) this.blockedFor.delete(id);
  }
}
