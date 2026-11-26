// Where the camera stands as the stranger welcomes the player (`tour.ts`): her first lines and her farewell seen from
// the side, from over the pair's heads, both whole, from the first eye whose lines to their heads clear the node's
// solids (the blocks the camera's boom keeps clear of).
import { lookAt } from '../../cinema/rail.ts';
import { blockReach } from '../../player/boom.ts';
import type { Block } from '../../rules/movementRules.ts';
import { type Shot, onScreen } from '../camera.ts';

type Point3 = readonly [number, number, number];

/** A figure's head over the ground, metres. */
export const HEAD_M = 1.7;
/** How near a line may pass a solid, metres. */
const CLEAR_M = 0.05;
/** How far down the view the pair's feet stand (a share of its height): above the dialogue box, whose top is 43% down
 *  at 960x540. */
const FEET_SHARE = 0.36;
/** The face-to-face shot: the eye's heights over the pair's feet, tried in turn, above their heads so it looks down on
 *  them a little; and how far down the view their crowns stand, clear of its top, the pair whole between. */
const FACES_UPS_M = [2.8, 3.4, 2.4];
const CROWN_SHARE = 0.14;
/** A figure's crown over its feet, metres. */
export const CROWN_M = HEAD_M + 0.2;
/** The view a framing is checked against: the widest screen the game is laid out for. */
const CHECKED = { width: 16, height: 9 };

const inBlock = (eye: Point3, blocks: readonly Block[]) =>
  blocks.some(
    (block) =>
      eye[0] > block.minX &&
      eye[0] < block.maxX &&
      eye[1] > block.minY &&
      eye[1] < block.maxY &&
      eye[2] > block.bottom &&
      eye[2] < block.top,
  );

/** Whether the line between two points clears every solid by `CLEAR_M`. */
export const lineClear =
  (blocks: readonly Block[]) =>
  (from: Point3, to: Point3): boolean =>
    blockReach(from, to, blocks, CLEAR_M) >= Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]) - 1e-6;

/** Whether a point is on a shot's view. */
function inView(shot: Shot, point: Point3): boolean {
  const spot = onScreen(shot, CHECKED, point);
  return spot !== null && spot[0] > 0 && spot[0] < CHECKED.width && spot[1] > 0 && spot[1] < CHECKED.height;
}

/** Whether a shot sees every point, each by a line clear of the solids and on its view. */
function sees(shot: Shot, points: readonly Point3[], blocks: readonly Block[]): boolean {
  if (inBlock(shot.eye, blocks)) return false;
  return points.every((point) => inView(shot, point) && lineClear(blocks)(shot.eye, point));
}

/** The first shot that sees every point; none where no shot does, so the view stays where it is. */
const firstSeeing = (shots: readonly Shot[], points: readonly Point3[], blocks: readonly Block[]): Shot | null =>
  shots.find((shot) => sees(shot, points, blocks)) ?? null;

/** How far off a pair an eye `up` metres over their feet stands, and how far below the horizon it looks, for their
 *  crowns to stand `CROWN_SHARE` and their feet `FEET_SHARE` down a view `fov` tall. */
export function facesFraming(up: number, fov: number): { readonly away: number; readonly pitch: number } {
  const half = Math.tan(fov / 2);
  // Each one's angle off the view's middle, downward: both above it, so less than nothing.
  const feet = Math.atan((FEET_SHARE - 0.5) * 2 * half);
  const crown = Math.atan((CROWN_SHARE - 0.5) * 2 * half);
  const seen = (away: number) => Math.atan(up / away) - Math.atan((up - CROWN_M) / away);
  // The nearer the eye, the taller the pair stands in the view: halved until the pair fills the span between.
  let [near, far] = [0.5, 100];
  for (let step = 0; step < 48; step++) {
    const away = (near + far) / 2;
    if (seen(away) > feet - crown) near = away;
    else far = away;
  }
  const away = (near + far) / 2;
  return { away, pitch: Math.atan(up / away) - feet };
}

/** Her first lines and her farewell seen from the side of the pair, the side nearer the player's view first, else the
 *  one a solid leaves clear, from over their heads: both whole above the dialogue box, their faces in the view. */
export function facesShot(own: Shot, stranger: Point3, player: Point3, blocks: readonly Block[]): Shot {
  const middle: Point3 = [(stranger[0] + player[0]) / 2, (stranger[1] + player[1]) / 2, (stranger[2] + player[2]) / 2];
  const [acrossX, acrossY] = [player[0] - stranger[0], player[1] - stranger[1]];
  const length = Math.hypot(acrossX, acrossY) || 1;
  const toOwn = (side: number) =>
    Math.hypot(middle[0] - (acrossY / length) * side - own.eye[0], middle[1] + (acrossX / length) * side - own.eye[1]);
  const sides = [1, -1].sort((one, two) => toOwn(one) - toOwn(two));
  const shots = sides.flatMap((side) =>
    FACES_UPS_M.map((up): Shot => {
      const { away, pitch } = facesFraming(up, own.fov);
      const eye: Point3 = [
        middle[0] - (acrossY / length) * away * side,
        middle[1] + (acrossX / length) * away * side,
        middle[2] + up,
      ];
      return { ...own, eye, yaw: lookAt(eye, middle).yaw, pitch };
    }),
  );
  const faces = [stranger, player].map((feet): Point3 => [feet[0], feet[1], feet[2] + HEAD_M]);
  return firstSeeing(shots, faces, blocks) ?? (shots[0] as Shot);
}
