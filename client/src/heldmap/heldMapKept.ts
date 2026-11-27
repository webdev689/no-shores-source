// The held map's layout kept between frames: what it reads, as one key, and a value made again only when that changes.
import type { HeldMapScene, MapPlace } from './heldMapScene.ts';
import type { Rect, View } from './heldMapLaw.ts';

/** What the map's layout reads, as one string: the map's view, the stage's ink and hands, the face's loading, how often
 *  the waters were set, the places and islands known, the choice and the quest's: not the ship's point or heading,
 *  which move under way, its arrow painted where it is while the layout keeps room for it (`shipRoomLost`). */
export function layoutKey(
  view: View,
  stage: { readonly ink: Rect; readonly sprite: Rect },
  fonts: string,
  chartings: number,
  scene: Pick<HeldMapScene, 'places' | 'knownIslands' | 'quest'>,
  chosen: string | null,
): string {
  const { places, knownIslands, quest } = scene;
  const read = [placesKey(places), knownIslands, chosen, quest];
  return JSON.stringify([view, stage.ink, stage.sprite, fonts, chartings, ...read]);
}

/** The places as the key reads them: written out once for each list, which stays the same while the world does. */
const PLACES = new WeakMap<readonly MapPlace[], string>();
function placesKey(places: readonly MapPlace[]): string {
  let key = PLACES.get(places);
  if (key === undefined) PLACES.set(places, (key = JSON.stringify(places)));
  return key;
}

/** A value made again only when its key changes: the held map's layout, keyed by `layoutKey`. */
export class Kept<Value> {
  private key: string | null = null;
  private value: Value | undefined;

  made(key: string, make: () => Value): Value {
    if (key !== this.key || this.value === undefined) [this.value, this.key] = [make(), key];
    return this.value;
  }
}
