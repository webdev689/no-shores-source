// The player at the Brig's helm, and the camera that shows them whole while they make themselves: in front of them on
// her quarterdeck, the figure standing in the part of the picture the creation's windows leave clear (the left on a
// wide screen, the top on a tall one), turned round them a step at a time.
import type { Point3 } from '../../cinema/rail.ts';
import type { ShipPlace } from '../../ships/shipView.ts';
import type { Actor } from './actors.ts';
import { ACTOR_IDS } from './actors.ts';
import type { Shot } from '../camera.ts';
import { deckPoint, helmSpot } from './brig.ts';
import { onDeck } from './sailing.ts';
import type { Story } from './story.ts';

/** The player's own id among the placed figures, apart from every fighter's and hand's. */
export const YOU_ID = ACTOR_IDS + 99;
/** The creation camera's lens, its least distance from the player, and how high over their feet its eye stands. */
export const CREATION_LENS = { fov: 0.75, near: 0.2, far: 30_000 } as const;
const NEAREST_M = 3.4;
/** The view a shot is framed for when none is given: a wide screen's. */
const WIDE = 16 / 9;
const EYE_M = 1.45;
/** The figure the camera keeps whole: its height and breadth with a margin (sword and shield held out), how far its
 *  nearest part stands before its feet, and the height of its middle. */
const FIGURE = { tall: 2.4, broad: 1.7, depth: 0.6, middle: 0.95 } as const;
/** Where the figure stands, clear of the creation window (creation.css): on a screen wider than tall the window has
 *  the right from 49% across, so the figure keeps the left 46%; on one taller than wide the window has the bottom
 *  from 54% down, so the figure keeps the top 51%. Each is a box of the view's -1..1 across and up. */
const CLEAR = {
  wide: { left: -1, right: -0.08, bottom: -1, top: 1 },
  tall: { left: -1, right: 1, bottom: -0.02, top: 1 },
} as const;

/** The helm in the Brig's frame as the rails read it: metres to her bow, to her starboard, up from her waterline. */
export function helmInShip(): Point3 {
  const [x, y, z] = helmSpot();
  return [-y, x, z];
}

/** The creation camera's eye and look in the Brig's frame, turned `turn` radians round the player from in front, for
 *  a view `aspect` wide to its height: back far enough that the whole figure fits the part of the view the window
 *  leaves clear, and turned so the figure stands in the middle of that part. */
export function creationEye(turn: number, aspect = WIDE): { readonly eye: Point3; readonly look: Point3 } {
  const [forward, starboard, up] = helmInShip();
  const clear = aspect <= 1 ? CLEAR.tall : CLEAR.wide;
  const half = Math.tan(CREATION_LENS.fov / 2);
  const aside = Math.atan(((clear.left + clear.right) / 2) * half * aspect);
  const above = Math.atan(((clear.bottom + clear.top) / 2) * half);
  // The figure's nearest part, not its feet, is what must fit, at its depth along the camera's look, off to one side.
  const depth = (fits: number) => (FIGURE.depth + fits) / Math.cos(aside);
  const distance = Math.max(
    NEAREST_M,
    depth(FIGURE.tall / (half * (clear.top - clear.bottom))),
    depth(FIGURE.broad / (half * aspect * (clear.right - clear.left))),
  );
  const [along, across] = [Math.cos(turn), Math.sin(turn)];
  const eye: Point3 = [forward + along * distance, starboard + across * distance, up + EYE_M];
  // The camera faces back toward the player, turned off them so they stand at the clear part's middle: to its right
  // for a figure left of the view's middle, below it for a figure above.
  const toFigure = Math.atan2(-across, -along);
  const bearing = toFigure - aside;
  const rise = Math.atan2(FIGURE.middle - EYE_M, distance) - above;
  const look: Point3 = [
    eye[0] + Math.cos(rise) * Math.cos(bearing) * distance,
    eye[1] + Math.cos(rise) * Math.sin(bearing) * distance,
    eye[2] + Math.sin(rise) * distance,
  ];
  return { eye, look };
}

/** The Brig's deck as the helm's camera rides it: all of her rise and fall but a quarter of her pitch and roll, so the
 *  figure holds still in the picture. The storm's run ends on this same frame, so the helm takes its shot up whole. */
export function helmDeck(place: ShipPlace): ShipPlace {
  return { ...place, pitch: place.pitch * 0.25, roll: place.roll * 0.25 };
}

/** The creation camera in the world, with the Brig at `place`, turned `turn` round the player. */
export function creationShot(place: ShipPlace, turn: number, aspect: number): Shot {
  const { eye, look } = creationEye(turn, aspect);
  const [eyeWorld, lookWorld] = [onDeck(place, ...eye), onDeck(place, ...look)];
  const [east, south, up] = [lookWorld[0] - eyeWorld[0], lookWorld[1] - eyeWorld[1], lookWorld[2] - eyeWorld[2]];
  return {
    ...CREATION_LENS,
    eye: eyeWorld,
    yaw: Math.atan2(east, -south),
    pitch: -Math.asin(up / (Math.hypot(east, south, up) || 1)),
  };
}

/** The player at her helm, facing her bow, in their story dress and `anim`. */
export function youAtHelm(story: Story, place: ShipPlace, anim: string, since = 0): Actor {
  const [x, y, z] = helmSpot();
  const [worldX, worldY, worldZ] = deckPoint(place, x, y, z);
  return {
    id: YOU_ID,
    dress: story.dress,
    anim,
    x: worldX,
    y: worldY,
    z: worldZ,
    facing: place.heading,
    since,
    scale: place.scale,
  };
}
