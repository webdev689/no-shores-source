// The held map's layout kept between frames: what it reads, as one key, and a value made again only when that changes.
import type { HeldMapScene } from './heldMapScene.ts';
import type { Rect, View } from './heldMapLaw.ts';

/** What the map's layout reads, as one string: the map's view, the stage's ink and hands, the face's loading, how often
 *  the waters were set, the ship's point and heading, the places and islands known, the choice and the quest's. */
export function layoutKey(
  view: View,
  stage: { readonly ink: Rect; readonly sprite: Rect },
  fonts: string,
  chartings: number,
  scene: HeldMapScene,
  chosen: string | null,
): string {
  const { ship, heading, places, knownIslands, quest } = scene;
  const read = [ship, heading, places, knownIslands, chosen, quest];
  return JSON.stringify([view, stage.ink, stage.sprite, fonts, chartings, ...read]);
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
