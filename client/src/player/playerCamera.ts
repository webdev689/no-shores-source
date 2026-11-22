import { FIELD_OF_VIEW, type Orbit } from '../editor/orbit.ts';
import type { Block } from '../rules/movementRules.ts';
import { BOOM, boomEased, boomReach } from './boom.ts';

/** First or third person, how far behind the head the camera is meant to sit, and how far it sits now as it eases;
 *  and how far out its boom stands as it eases clear of what is in the way (`boom.ts`), unset or infinite where
 *  nothing is. */
export interface ViewMode {
  readonly firstPerson: boolean;
  readonly distance: number;
  readonly shown: number;
  readonly boom?: number;
}

/** DFO's third-person camera, as the owner chose its numbers: 2 m behind the head and 0.5 m up, 0.2 m a wheel notch,
 *  back to first person once nearer than 0.8 m, never farther than 10 m, and easing in about a tenth of a second. */
export const CAMERA = { back: 2, up: 0.5, notch: 0.2, nearest: 0.8, farthest: 10, ease: 10 } as const;

export const FIRST_PERSON: ViewMode = { firstPerson: true, distance: CAMERA.back, shown: 0 };

/** Aiming a ranged weapon: in third person the camera stands behind the right shoulder, offset from the middle, this
 *  far out, back and up from the head (metres), zoomed in a little; in first person the view zooms in this much, the
 *  hands with it. It eases there and back about as fast as the camera eases. */
export const AIM = { shoulder: 0.8, back: 3, up: 0.25, thirdZoom: 1.3, firstZoom: 1.6, ease: 12 } as const;

/** How far the view is zoomed `aim` (0 to 1) of the way into aiming, in third person once it stands back more than
 *  `shown` 0.01, else in first; the first person's hands zoom with it. */
export const aimZoom = (shown: number, aim: number, place: AimPlace = AIM): number =>
  1 + ((shown > 0.01 ? place.thirdZoom : AIM.firstZoom) - 1) * aim;

/** First person's view is this tall, wider than the lens's 50° that third person keeps. */
const FIRST_PERSON_FOV = (65 * Math.PI) / 180;

/** How far the view is widened, a zoom under 1, as the camera comes into the head (`shown` metres behind it) from
 *  the nearest third person stands, to first person's 65° at the head: third person keeps the lens's 50°. */
export function widened(shown: number): number {
  const first = Math.tan(FIELD_OF_VIEW / 2) / Math.tan(FIRST_PERSON_FOV / 2);
  return first + (1 - first) * Math.min(1, Math.max(0, shown) / (CAMERA.nearest - CAMERA.notch));
}

/** How far the first person's hands zoom with `orbit`'s view, `view` as it is shown: by aiming (and any push in),
 *  never by first person's widening, so the weapon keeps its size. */
export const handsZoom = (orbit: Orbit, view: ViewMode): number => (orbit.zoom ?? 1) / widened(view.shown);

/** Where third person's aiming view stands and how far it zooms, as `AIM` has it unless the Test Ground's panel sets
 *  its own. */
export interface AimPlace {
  readonly shoulder: number;
  readonly back: number;
  readonly up: number;
  readonly thirdZoom: number;
}

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

/** The view an address asks to arrive with, as `&spawn=` asks where: `&view=first`, or `&view=third[,<metres>]`
 *  behind the head (2 m unless said, within the wheel's reach); null when it asks none. A way to picture a place,
 *  rooms from inside among them, without a wheel or a mouse button. */
export function askedView(search: string): ViewMode | null {
  const [kind, metres] = new URLSearchParams(search).get('view')?.split(',') ?? [];
  if (kind === 'first') return FIRST_PERSON;
  if (kind !== 'third') return null;
  const asked = Number(metres || CAMERA.back);
  const distance = Number.isFinite(asked) ? Math.min(CAMERA.farthest, Math.max(CAMERA.nearest, asked)) : CAMERA.back;
  return { firstPerson: false, distance, shown: distance };
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
    const low = [block.minX, block.minY, block.bottom];
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

/** Where the camera's boom reaches from the head with nothing in the way: nowhere in first person; behind the head
 *  and up in third, and `aim` (0 to 1) of the way to aiming's `place` over the shoulder. */
function boomEnd(head: Point, yaw: number, pitch: number, view: ViewMode, aim: number, place: AimPlace): Point | null {
  if (view.shown <= 0.01) return null;
  const forward = forwardOf(yaw, pitch);
  const up: Point = [Math.sin(pitch) * Math.sin(yaw), -Math.sin(pitch) * Math.cos(yaw), Math.cos(pitch)];
  const right: Point = [Math.cos(yaw), Math.sin(yaw), 0];
  const end = (axis: 0 | 1 | 2) => {
    const behind =
      head[axis] - forward[axis] * view.shown + up[axis] * CAMERA.up * Math.min(1, view.shown / CAMERA.back);
    const shoulder = head[axis] + right[axis] * place.shoulder - forward[axis] * place.back + up[axis] * place.up;
    return behind + (shoulder - behind) * aim;
  };
  return [end(0), end(1), end(2)];
}

const forwardOf = (yaw: number, pitch: number): Point => [
  Math.cos(pitch) * Math.sin(yaw),
  -Math.cos(pitch) * Math.cos(yaw),
  -Math.sin(pitch),
];

const lengthOf = (from: Point, to: Point) => Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);

/** The view with its boom eased over `seconds` toward how far it stands clear of `blocks` and the ground now. */
export function boomFollowed(
  head: Point,
  yaw: number,
  pitch: number,
  view: ViewMode,
  blocks: readonly Block[],
  aim: number,
  place: AimPlace,
  groundAt: ((x: number, y: number) => number | null) | null,
  seconds: number,
): ViewMode {
  const end = boomEnd(head, yaw, pitch, view, aim, place);
  if (!end) return view.boom === undefined ? view : { ...view, boom: Number.POSITIVE_INFINITY };
  const clear = boomReach(head, end, blocks, groundAt, BOOM.clearance);
  return { ...view, boom: boomEased(view.boom ?? Number.POSITIVE_INFINITY, clear, lengthOf(head, end), seconds) };
}

/** The camera as an orbit the scene draws from: at the head in first person; in third at the end of its boom as far
 *  out as it has eased (`boomFollowed`), and never nearer a block or the ground than `BOOM.closest`, so a boom easing
 *  in behind a sudden wall never shows through it; and `aim` (0 to 1) of the way into aiming's view, at `place` over
 *  the shoulder and zoomed. `pitch` is how far it looks down, negative looking up. */
export function cameraOrbit(
  head: Point,
  yaw: number,
  pitch: number,
  view: ViewMode,
  blocks: readonly Block[],
  aim = 0,
  place: AimPlace = AIM,
  groundAt: ((x: number, y: number) => number | null) | null = null,
): Orbit {
  const forward = forwardOf(yaw, pitch);
  const end = boomEnd(head, yaw, pitch, view, aim, place);
  let eye: Point = head;
  if (end) {
    const length = lengthOf(head, end);
    // A view never followed (a caller that does not ease the boom) stands clear at once.
    const shown =
      view.boom === undefined
        ? boomReach(head, end, blocks, groundAt, BOOM.clearance)
        : Math.min(view.boom, boomReach(head, end, blocks, groundAt, BOOM.closest));
    const share = length > 1e-6 ? Math.min(1, Math.max(0, shown) / length) : 0;
    eye = [0, 1, 2].map((axis) => head[axis] + (end[axis] - head[axis]) * share) as unknown as Point;
  }
  const zoom = aimZoom(view.shown, aim, place) * widened(view.shown);
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
