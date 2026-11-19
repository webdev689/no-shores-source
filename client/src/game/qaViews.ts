// Offline QA: stands the body at a point of the loaded node, to picture many places in one page load. Only an offline
// page with `&spawn=` in its address installs it; online play never does.
import { insideRing, type Spot } from '../editor/placeDrawing.ts';
import { newPlayer, type Player } from '../player/player.ts';
import { FIRST_PERSON } from '../player/playerCamera.ts';
import type { MovementRules } from '../rules/movementRules.ts';

/** East and south in metres, the bearing in degrees, and the camera: `first`, or `third,<m>[,<degrees looking
 *  down>]`. */
export type QaView = readonly [number, number, number, string];

/** The player stood at the view's point, facing its bearing, with its camera; null for a camera not understood, or
 *  where the point is outside the node's section, since the ground there is not loaded. */
export function qaViewed(
  movement: MovementRules,
  ring: readonly Spot[],
  [east, south, bearing, camera]: QaView,
): Player | null {
  if (!insideRing(ring, [east, south])) return null;
  // Not `askedView`: the wheel's 10 m limit would pull a high view down.
  const [kind, metres, down] = camera.split(',');
  const distance = Number(metres);
  const pitch = down === undefined ? 0.1 : (Number(down) * Math.PI) / 180;
  if (kind !== 'first' && !(kind === 'third' && distance > 0 && Number.isFinite(pitch))) return null;
  const view = kind === 'first' ? FIRST_PERSON : { firstPerson: false, distance, shown: distance };
  const yaw = (bearing * Math.PI) / 180;
  return { ...newPlayer(movement, east, south), view, yaw, facing: yaw, pitch };
}

/** Puts `__qaView(view)` on `target` for the picture driver, when the page plays alone (`offline`) and asks for a
 *  spawn; it answers whether it stood the body. `ring` is the section of the node the player is on foot in. */
export function installQaViews(
  target: object,
  search: string,
  offline: boolean,
  movement: MovementRules,
  walker: { player: Player },
  ring: () => readonly Spot[] | null,
): void {
  if (!offline || !new URLSearchParams(search).has('spawn')) return;
  (target as { __qaView?: (view: QaView) => boolean }).__qaView = (view) => {
    const section = ring();
    const moved = section && qaViewed(movement, section, view);
    if (moved) walker.player = moved;
    return Boolean(moved);
  };
}
