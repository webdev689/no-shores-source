// The held map's layout kept between frames: what it reads, as one key, and a value made again only when that changes.
import type { HeldMapScene } from './heldMapScene.ts';
import type { Rect, View } from './heldMapLaw.ts';

/** How far the ship's arrow may move on the map, ink pixels, before the names laid clear of it are laid again: the
 *  arrow itself is drawn where the ship is now, and a ship under way otherwise lays the map out every frame. */
export const SHIP_STEP = 4;

/** What the map's layout reads, as one string: the map's view, the stage's ink and hands, the face's loading, how often
 *  the waters were set, the ship's point on the map to `SHIP_STEP` (its heading turns the arrow alone), the places and
 *  islands known, the choice and the quest's. */
export function layoutKey(
  view: View,
  stage: { readonly ink: Rect; readonly sprite: Rect },
  fonts: string,
  chartings: number,
  scene: HeldMapScene,
  chosen: string | null,
): string {
  const { ship, places, knownIslands, quest } = scene;
  const stepped = (metres: number, from: number) => Math.round(((metres - from) * view.scale) / SHIP_STEP);
  const read = [stepped(ship[0], view.left), stepped(ship[1], view.top), places, knownIslands, chosen, quest];
  return JSON.stringify([view, stage.ink, stage.sprite, fonts, chartings, ...read]);
}

/** The ship's arrow on the map showing `view`, where the ship is now, to a quarter pixel and a degree: drawn there
 *  though its names were laid as far as `SHIP_STEP` back. */
export function arrowNow(view: View, { ship, heading }: Pick<HeldMapScene, 'ship' | 'heading'>) {
  const [x, y] = [(ship[0] - view.left) * view.scale, (ship[1] - view.top) * view.scale];
  const degrees = Math.round((heading * 180) / Math.PI);
  return { x: Math.round(x * 4) / 4, y: Math.round(y * 4) / 4, heading: (degrees * Math.PI) / 180 };
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
