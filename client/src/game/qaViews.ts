// Offline QA: stands the body at a point of the loaded node, to picture many places in one page load. Only a page
// with `&spawn=` in its address installs it; online play never does.
import { insideRing, type Spot } from '../editor/placeDrawing.ts';
import { newPlayer } from '../player/player.ts';
import { FIRST_PERSON } from '../player/playerCamera.ts';
import type { MovementRules } from '../rules/movementRules.ts';

/** East and south in metres, the bearing in degrees, and the camera as `&view=` words: `first` or `third,<m>`. */
export type QaView = readonly [number, number, number, string];

/** Whether the address asks for the offline QA hook, as it asks for a spawn. */
export const askedQaViews = (search: string): boolean => new URLSearchParams(search).has('spawn');

/** The player stood at the view's point, facing its bearing, with its camera; null for a camera not understood, or
 *  where the point is outside the node's section, since the ground there is not loaded. */
export function qaViewed(movement: MovementRules, ring: readonly Spot[], [east, south, bearing, camera]: QaView) {
  if (!insideRing(ring, [east, south])) return null;
  // Not `askedView`: the wheel's 10 m limit would pull a high view down.
  const [kind, metres] = camera.split(',');
  const distance = Number(metres);
  if (kind !== 'first' && !(kind === 'third' && distance > 0)) return null;
  const view = kind === 'first' ? FIRST_PERSON : { firstPerson: false, distance, shown: distance };
  const yaw = (bearing * Math.PI) / 180;
  return { ...newPlayer(movement, east, south), view, yaw, facing: yaw };
}
