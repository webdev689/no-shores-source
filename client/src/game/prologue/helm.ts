// The player at the Brig's helm, and the camera that shows them whole while they make themselves: in front of them on
// her quarterdeck, the figure standing in the left of the picture so the creation's windows have the right, turned
// round them a step at a time.
import type { Point3 } from '../../cinema/rail.ts';
import type { ShipPlace } from '../../ships/shipView.ts';
import type { Actor } from './actors.ts';
import { ACTOR_IDS } from './actors.ts';
import { deckPoint, helmSpot } from './brig.ts';
import type { Story } from './story.ts';

/** The player's own id among the placed figures. */
export const YOU_ID = ACTOR_IDS + 1;
/** The creation camera: how far from the player, how high over their feet, and how far it looks to their side. */
const CREATION = { distance: 3.4, height: 1.45, lookUp: 1.05, aside: 0.95 } as const;

/** The helm in the Brig's frame as the rails read it: metres to her bow, to her starboard, up from her waterline. */
export function helmInShip(): Point3 {
  const [x, y, z] = helmSpot();
  return [-y, x, z];
}

/** The creation camera's eye and look in the Brig's frame, turned `turn` radians round the player from in front. */
export function creationEye(turn: number): { readonly eye: Point3; readonly look: Point3 } {
  const [forward, starboard, up] = helmInShip();
  const [along, across] = [Math.cos(turn), Math.sin(turn)];
  const eye: Point3 = [forward + along * CREATION.distance, starboard + across * CREATION.distance, up + CREATION.height];
  // The camera's right, looking back at the player: the figure stands left of the picture's middle.
  const look: Point3 = [forward + across * CREATION.aside, starboard - along * CREATION.aside, up + CREATION.lookUp];
  return { eye, look };
}

/** The player at her helm, facing her bow, in their story dress and `anim`. */
export function youAtHelm(story: Story, place: ShipPlace, anim: string, since = 0): Actor {
  const [x, y, z] = helmSpot();
  const [worldX, worldY, worldZ] = deckPoint(place, x, y, z);
  return { id: YOU_ID, dress: story.dress, anim, x: worldX, y: worldY, z: worldZ, facing: place.heading, since, scale: place.scale };
}
