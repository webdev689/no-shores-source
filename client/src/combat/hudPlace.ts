// Where the fight's display stands things on the view: a point projected through the camera, a spot kept clear of a
// box, the veil over the display, the span a Boss's figure fills, and whether a line of sight is blocked.
import type { FighterView } from '../rules/fighters.ts';
import type { Block } from '../rules/movementRules.ts';
import { rayHit } from '../player/playerCamera.ts';
import { CALL_REACH } from './callout.ts';
import type { Box } from './hitWords.ts';
import type { HudFrame } from './hud.ts';
import { SIGHT_SKIN_M } from './plateSight.ts';

/** How long the dead lie before standing again, in ticks (crates/combat/src/tuning.rs RESPAWN). */
const RESPAWN_TICKS = 240;
/** How tall a Boss's figure stands, metres, for the span of the view the call keeps clear of. */
const BOSS_TALL_M = 2.6;

/** A point's clip coordinates through the camera: x, y up, and w (0 or less behind it). */
export function clipOf(matrix: ArrayLike<number>, point: readonly [number, number, number]): [number, number, number] {
  const [x, y, z] = point;
  const component = (row: number) =>
    (matrix[row] ?? 0) * x + (matrix[4 + row] ?? 0) * y + (matrix[8 + row] ?? 0) * z + (matrix[12 + row] ?? 0);
  return [component(0), component(1), component(3)];
}

/** Where a point falls on the canvas in CSS pixels, or null behind the camera. */
export function project(
  matrix: ArrayLike<number>,
  point: readonly [number, number, number],
  width: number,
  height: number,
) {
  const [clipX, clipY, clipW] = clipOf(matrix, point);
  if (clipW <= 1e-6) return null;
  return { x: ((clipX / clipW + 1) / 2) * width, y: ((1 - clipY / clipW) / 2) * height };
}

/** A spot on the screen's edge moved along the edge to stand `gap` above `box` (CSS pixels from the display's corner),
 *  or below it when `below`, where it would fall within `gap` of it; elsewhere as it is. */
export function clearOf<Spot extends { readonly x: number; readonly y: number }>(
  spot: Spot,
  box: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number },
  gap: number,
  below = false,
): Spot {
  const near = (value: number, from: number, to: number) => value >= from - gap && value <= to + gap;
  if (!near(spot.x, box.left, box.right) || !near(spot.y, box.top, box.bottom)) return spot;
  return { ...spot, y: below ? box.bottom + gap : box.top - gap };
}

/** The veil over the display, by what holds the player: joining the room again, the room lost (and why), or their
 *  death (the ticks they have lain, while the room will stand them again: with no revive left, it promises nothing);
 *  a link's veil is plain, death's is blood. Null while none of these holds, and for a death the section dealt too,
 *  whose own veil offers Respawn. */
export function veilOf(
  frame: Pick<HudFrame, 'own' | 'lost' | 'rejoining' | 'revivesLeft' | 'sectionDead'>,
): { readonly words: string; readonly link: boolean } | null {
  if (frame.rejoining) return { words: 'Reconnecting…', link: true };
  if (frame.lost !== null) return { words: `The link to the room was lost: ${frame.lost}.`, link: true };
  const dead = frame.own?.action.kind === 'dead' ? frame.own.action : null;
  if (!dead || frame.sectionDead) return null;
  if (frame.revivesLeft === 0) return { words: 'You fell.', link: false };
  const seconds = Math.ceil(Math.max(0, RESPAWN_TICKS - dead.elapsed) / 60);
  return { words: `You fell. Standing again in ${seconds} s`, link: false };
}

/** The span down the view a figure standing at `view` fills, where it stands within the call's reach (at `zoom`) of
 *  the view's middle across (CSS pixels); none off it or behind the eye. */
export function spanOf(
  frame: HudFrame,
  view: FighterView,
  zoom: number,
): { readonly top: number; readonly bottom: number } | null {
  const feet = project(frame.matrix, [view.x, view.y, view.z], frame.width, frame.height);
  const head = project(frame.matrix, [view.x, view.y, view.z + BOSS_TALL_M], frame.width, frame.height);
  if (!feet || !head || Math.abs(feet.x - frame.width / 2) > CALL_REACH * zoom) return null;
  return { top: head.y, bottom: feet.y };
}

/** A laid box by its sides, none for none or an empty one. */
export const sidesOf = (box: { x: number; y: number; width: number; height: number } | null): Box | null =>
  box && box.width + box.height > 0
    ? { left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height }
    : null;

/** Whether two boxes overlap. */
export const meets = (one: Box, two: Box): boolean =>
  one.left < two.right && two.left < one.right && one.top < two.bottom && two.top < one.bottom;

/** Whether the line from `from` to `to` meets one of `blocks` short of its last `SIGHT_SKIN_M`. */
export function blockedBy(
  blocks: readonly Block[],
  from: readonly [number, number, number],
  to: readonly [number, number, number],
): boolean {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  return length > SIGHT_SKIN_M && rayHit(from, to, blocks) < 1 - SIGHT_SKIN_M / length;
}
