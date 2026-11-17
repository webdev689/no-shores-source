import type { Orbit } from '../editor/orbit.ts';
import type { Block } from '../rules/movementRules.ts';

/** First or third person, how far behind the head the camera is meant to sit, and how far it sits now as it eases. */
export interface ViewMode {
  readonly firstPerson: boolean;
  readonly distance: number;
  readonly shown: number;
}

/** DFO's third-person camera, as the owner chose its numbers: 2 m behind the head and 0.5 m up, 0.2 m a wheel notch,
 *  back to first person once nearer than 0.8 m, never farther than 10 m, easing in about a tenth of a second, and
 *  kept 0.25 m off a wall. */
export const CAMERA = { back: 2, up: 0.5, notch: 0.2, nearest: 0.8, farthest: 10, ease: 10, clearance: 0.25 } as const;

export const FIRST_PERSON: ViewMode = { firstPerson: true, distance: CAMERA.back, shown: 0 };

/** Aiming a ranged weapon: in third person the camera stands behind the right shoulder, offset from the middle, this
 *  far out, back and up from the head (metres), zoomed in a little; in first person the view zooms in this much, the
 *  hands still. It eases there and back about as fast as the camera eases. */
export const AIM = { shoulder: 0.65, back: 1.8, up: 0.25, thirdZoom: 1.15, firstZoom: 1.6, ease: 12 } as const;

/** How far into its aiming view a camera is, 0 to 1, eased toward aiming or not over `seconds`. */
export function aimEased(share: number, aiming: boolean, seconds: number): number {
  return share + ((aiming ? 1 : 0) - share) * Math.min(1, seconds * AIM.ease);
}

/** The view after wheel notches: positive pulls back (into third person, then farther), negative comes in (nearer, then
 *  into first person). One notch counts at a time. */
export function scrolled(view: ViewMode, notches: number): ViewMode {
  if (notches === 0) return view;
  if (view.firstPerson) return notches > 0 ? { ...view, firstPerson: false, distance: CAMERA.back } : view;
  if (notches < 0 && view.distance < CAMERA.nearest) return { ...view, firstPerson: true };
  const distance = Math.min(CAMERA.farthest, view.distance + Math.sign(notches) * CAMERA.notch);
  return { ...view, distance: Math.max(CAMERA.nearest - CAMERA.notch, distance) };
}

/** First person to third, or back. */
export const toggled = (view: ViewMode): ViewMode => ({ ...view, firstPerson: !view.firstPerson });

/** The camera's distance eased towards where it is meant to be. */
export function eased(view: ViewMode, seconds: number): ViewMode {
  const target = view.firstPerson ? 0 : view.distance;
  return { ...view, shown: view.shown + (target - view.shown) * Math.min(1, seconds * CAMERA.ease) };
}

type Point = readonly [number, number, number];

/** How far along a ray it first meets a block, as a share of its length (1 where it meets none). */
export function rayHit(from: Point, to: Point, blocks: readonly Block[]): number {
  let nearest = 1;
  for (const block of blocks) {
    const low = [block.minX, block.minY, 0];
    const high = [block.maxX, block.maxY, block.top];
    let enter = 0;
    let leave = 1;
    for (const axis of [0, 1, 2] as const) {
      const delta = to[axis] - from[axis];
      const [lowAxis, highAxis] = [low[axis] ?? 0, high[axis] ?? 0];
      if (Math.abs(delta) < 1e-9) {
        if (from[axis] < lowAxis || from[axis] > highAxis) leave = -1;
        continue;
      }
      const [first, second] = [(lowAxis - from[axis]) / delta, (highAxis - from[axis]) / delta];
      enter = Math.max(enter, Math.min(first, second));
      leave = Math.min(leave, Math.max(first, second));
    }
    if (enter <= leave && enter < nearest) nearest = enter;
  }
  return nearest;
}

/** The camera as an orbit the scene draws from: at the head in first person; behind it and up in third, pulled in
 *  short of any block between; and `aim` (0 to 1) of the way into aiming's view, over the right shoulder and zoomed.
 *  `pitch` is how far it looks down, negative looking up. */
export function cameraOrbit(
  head: Point,
  yaw: number,
  pitch: number,
  view: ViewMode,
  blocks: readonly Block[],
  aim = 0,
): Orbit {
  const forward: Point = [Math.cos(pitch) * Math.sin(yaw), -Math.cos(pitch) * Math.cos(yaw), -Math.sin(pitch)];
  const up: Point = [Math.sin(pitch) * Math.sin(yaw), -Math.sin(pitch) * Math.cos(yaw), Math.cos(pitch)];
  const right: Point = [Math.cos(yaw), Math.sin(yaw), 0];
  let eye: Point = head;
  const third = view.shown > 0.01;
  if (third) {
    const behind = (axis: 0 | 1 | 2) =>
      head[axis] - forward[axis] * view.shown + up[axis] * CAMERA.up * Math.min(1, view.shown / CAMERA.back);
    const shoulder = (axis: 0 | 1 | 2) =>
      head[axis] + right[axis] * AIM.shoulder - forward[axis] * AIM.back + up[axis] * AIM.up;
    const want: Point = [0, 1, 2].map(
      (axis) => behind(axis as 0 | 1 | 2) + (shoulder(axis as 0 | 1 | 2) - behind(axis as 0 | 1 | 2)) * aim,
    ) as unknown as Point;
    const length = Math.hypot(want[0] - head[0], want[1] - head[1], want[2] - head[2]);
    const hit = rayHit(head, want, blocks);
    // Short of a wall by the clearance; with none in the way, all the way out.
    const share = hit >= 1 ? 1 : Math.max(0, hit - CAMERA.clearance / Math.max(length, 1e-6));
    eye = [0, 1, 2].map((axis) => head[axis] + (want[axis] - head[axis]) * share) as unknown as Point;
  }
  const zoom = 1 + ((third ? AIM.thirdZoom : AIM.firstZoom) - 1) * aim;
  return {
    targetX: eye[0] + forward[0],
    targetY: eye[1] + forward[1],
    targetZ: eye[2] + forward[2],
    yaw,
    pitch,
    distance: 1,
    zoom,
  };
}
