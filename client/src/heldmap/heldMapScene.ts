// What the held map is asked each frame (`HeldMapScene`), the places and isles it marks, and a course as it inks it.
import type { Point2 } from '../overworld/ground.ts';
import type { MapMarks } from './landSheet.ts';

/** Something the map shows: a port or a node, where it lies, what it is, and where a ship sails for
 *  it (a node's nearest coast). */
export interface MapPlace {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly at: Point2;
  readonly sail: Point2;
}

/** A found island as the map marks it: where it lies in the world, its kind (`cove`, `ruin`, `quarry`), and whether it
 *  is an isle, which is marked with a tower. */
export interface IsleMark {
  readonly at: Point2;
  readonly kind: string;
  readonly isle: boolean;
}

/** A route as the map inks it, or why there is none. */
export type Course =
  { readonly ok: true; readonly points: readonly Point2[] } | { readonly ok: false; readonly why: string };

/** What the map is asked each frame: where the ship lies and heads (on land, the player, in the world), what it
 *  shows, the course sailed now, and the places the quest walked names, which it rings; on land, whether a
 *  keeper's coin is lit (`lit`, by its glyph): its keeper has something for the player, so its rings pulse. */
export interface HeldMapScene {
  readonly ship: Point2;
  readonly heading: number;
  readonly places: readonly MapPlace[];
  readonly knownIslands: number;
  readonly course: readonly Point2[];
  readonly quest?: readonly string[];
  readonly lit?: (glyph: string) => boolean;
  /** On land, what moves on it: the other players and the public event running (`MapMarks`), in the world. */
  readonly moving?: MapMarks;
}
