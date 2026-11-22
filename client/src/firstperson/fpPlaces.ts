// Where the first person's pictures lie on the design screen: each at its own corner, mirrored for the left hand, a
// resting sword clear of the crosshair, the casting hands at the screen's edges, and each ranged weapon's muzzle.

import { DESIGN_HEIGHT, DESIGN_WIDTH } from './fpMotion.ts';
import type { Picture } from './fpFrames.ts';
import type { Holding } from './handsLaw.ts';

/** Where on each ranged weapon's picture its muzzle is, or its arrow's head drawn, in its own pixels, in the frame its
 *  shot leaves on, kicked up: where a tracer starts. Aiming zooms it with the hands, so it stays where drawn. */
export const MUZZLE: Readonly<Record<string, readonly [number, number] | undefined>> = {
  pistolet: [82, 53],
  thunderlock: [77, 42],
  crossbow: [82, 73],
  bow: [107, 150],
};

/** A point on the design screen as a view zoomed `zoom` times about the screen's middle shows it. */
export const zoomedOnScreen = (x: number, y: number, zoom: number): [number, number] => [
  DESIGN_WIDTH / 2 + (x - DESIGN_WIDTH / 2) * zoom,
  DESIGN_HEIGHT / 2 + (y - DESIGN_HEIGHT / 2) * zoom,
];

/** The casting hands step through their records and back to the first, a step every 0.04 s. */
export const CAST_SEQUENCE = [0, 1, 2, 3, 4, 5, 0] as const;
export const CAST_STEP = 0.04;
/** The casting hands are laid out on a screen 300 wide; the small records are pushed in to sit where the wide ones
 *  put the hands. */
const CAST_SCREEN_WIDTH = 300;
const CAST_SMALL_INSET = 0.134;

/** How far below its own place a sword rests, in design pixels, as the owner placed it. Its strikes keep their own
 *  places: lowered as far, they leave the screen. */
export const SWORD_DROP = 60;
/** How far right of its own place a sword rests, its blade clear of the crosshair; in the left hand, as far left. */
export const SWORD_RIGHT = 40;

/** Whether a held thing ducks below the screen while the weapon strikes: a shield or a torch, not a lantern. */
export const ducks = (held: Holding | null | undefined) =>
  held?.kind === 'shield' || (held?.kind === 'light' && held.light === 'torch');

/** A picture placed at its own corner on the design screen, mirrored about the screen's middle for the left hand,
 *  dropped `drop` design pixels and `lower` of its own height, and moved `across` design pixels after the mirror. */
export function atOwnPlace(flip: boolean, drop: number, lower = 0, across = 0) {
  return (picture: Picture) => ({
    x: (flip ? DESIGN_WIDTH - picture.at[0] - picture.width : picture.at[0]) + across,
    y: picture.at[1] + drop + lower * picture.height,
    width: picture.width,
    height: picture.height,
    flip,
  });
}

/** A casting hand placed on the casting screen: the left as drawn at the left edge, the right mirrored at the right. */
export function castPlace(record: number, element: string, right: boolean) {
  const small = record === 0 || record === 5 || (element === 'fire' && record === 4);
  const inset = small ? CAST_SMALL_INSET * DESIGN_WIDTH : 0;
  return (picture: Picture) => {
    const width = (picture.width * DESIGN_WIDTH) / CAST_SCREEN_WIDTH;
    const x = right ? DESIGN_WIDTH - inset - width : inset;
    return { x, y: DESIGN_HEIGHT - picture.height, width, height: picture.height, flip: right };
  };
}

/** Whether a hand holds something other than its own bare fist. */
export const holds = (holding: Holding | null | undefined) =>
  !!holding && !(holding.kind === 'weapon' && holding.wielded.kind === 'fists');

/** A picture placed at `quad` swayed by `sway` (design pixels across and down), never so far off an edge it is cut at
 *  (a gun's stock at the right, a shield's arm at the left, any arm at the foot) that the cut comes into sight; one
 *  held `still` stays where it is. */
export function swayedQuad<
  Quad extends { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
>(quad: Quad, sway: readonly [number, number], still = false): Quad {
  if (still) return quad;
  const [left, right] = [-quad.x, quad.x + quad.width - DESIGN_WIDTH];
  const below = quad.y + quad.height - DESIGN_HEIGHT;
  let across = sway[0];
  if (left >= 0) across = Math.min(across, left);
  if (right >= 0) across = Math.max(across, -right);
  const down = below >= 0 ? Math.max(sway[1], -below) : sway[1];
  return { ...quad, x: quad.x + across, y: quad.y + down };
}
