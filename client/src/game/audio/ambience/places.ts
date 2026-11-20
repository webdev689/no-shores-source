// Where the ambience's sounds stand, from what is cheap to know of the land: its height, its coast, its rivers, and a
// port city's harbour, streets, plaza and smith. A call is placed at a plausible spot of its kind (a bird in the
// trees, a wolf on the highest ground near, a wave on the nearest shore) or not at all where there is none, and a bed
// stands at the nearest shore, harbour, river or street. World metres, east, south and up. Pure.

import { coastPoint } from '../../../overworld/islandView.ts';
import { type Random, between } from './dsp.ts';
import type { Spot } from './scapes.ts';

type Point2 = readonly [number, number];
export type Point3 = readonly [number, number, number];

/** What the ambience knows of the land about the listener. */
export interface Lay {
  /** The ground's height, metres; the sea's floor below 0. */
  readonly heightAt: (x: number, y: number) => number;
  readonly outline: readonly Point2[];
  readonly rivers: readonly { readonly points: readonly Point2[] }[];
  /** A port city's harbour, its middle, and its plaza's bounds (west, north, east, south) and level. */
  readonly harbour: Point2 | null;
  readonly city: Point2 | null;
  readonly plaza: { readonly bounds: readonly [number, number, number, number]; readonly level: number } | null;
  /** Where its smith works: the Smith's alcove, or the Armsmith's. */
  readonly smithy: Point3 | null;
}

/** How far a shore may be for its sea to be heard, and a river, metres. */
export const SHORE_REACH_M = 450;
export const RIVER_REACH_M = 400;
/** Tries at a spot of a kind before a call is let go. */
const TRIES = 4;
/** Bearings the highest ground near is looked for on. */
const RIDGE_BEARINGS = 12;

const groundOf = (lay: Lay, x: number, y: number) => {
  const height = lay.heightAt(x, y);
  return Number.isFinite(height) ? height : 0;
};

/** The nearest point of the coast and how far it is. */
export function shoreOf(
  ear: Point2,
  outline: readonly Point2[],
): { readonly at: Point2; readonly distance: number } | null {
  if (outline.length < 2) return null;
  const point = coastPoint(ear, outline);
  return { at: point, distance: Math.hypot(point[0] - ear[0], point[1] - ear[1]) };
}

/** The nearest point on any river within `reach` metres, or null. */
export function riverNear(ear: Point2, rivers: Lay['rivers'], reach = RIVER_REACH_M): Point2 | null {
  let best: { at: Point2; distance: number } | null = null;
  for (const { points } of rivers)
    for (let nth = 1; nth < points.length; nth++) {
      const [from, to] = [points[nth - 1], points[nth]];
      if (!from || !to) continue;
      const [alongX, alongY] = [to[0] - from[0], to[1] - from[1]];
      const squared = alongX * alongX + alongY * alongY;
      const share = squared > 0 ? ((ear[0] - from[0]) * alongX + (ear[1] - from[1]) * alongY) / squared : 0;
      const clamped = Math.max(0, Math.min(1, share));
      const point: Point2 = [from[0] + alongX * clamped, from[1] + alongY * clamped];
      const distance = Math.hypot(point[0] - ear[0], point[1] - ear[1]);
      if (distance <= reach && (!best || distance < best.distance)) best = { at: point, distance };
    }
  return best?.at ?? null;
}

/** Two points on the shore near the ear, the nearest and one along the coast from it, for a shore as wide as a beach
 *  is; none past the reach, and always two within it, so its emitters stand while the ear moves. */
export function shorePoints(ear: Point2, outline: readonly Point2[]): readonly Point2[] {
  const nearest = shoreOf(ear, outline);
  if (!nearest || nearest.distance > SHORE_REACH_M) return [];
  const [awayX, awayY] = [nearest.at[0] - ear[0], nearest.at[1] - ear[1]];
  const length = Math.hypot(awayX, awayY) || 1;
  const along: Point2 = [ear[0] - (awayY / length) * 140, ear[1] + (awayX / length) * 140];
  const second = coastPoint(along, outline);
  return [nearest.at, second];
}

/** Where a port city's market crowd stands: between the plaza and the harbour, nearer the harbour. */
export function cityPoint(lay: Lay): Point2 | null {
  const below = lay.harbour ?? lay.city;
  if (!below) return null;
  const plaza = lay.plaza?.bounds;
  if (!plaza) return below;
  const middle: Point2 = [(plaza[0] + plaza[2]) / 2, (plaza[1] + plaza[3]) / 2];
  return [middle[0] + (below[0] - middle[0]) * 0.6, middle[1] + (below[1] - middle[1]) * 0.6];
}

/** A point `distance` away from `ear` at a random bearing. */
const aside = (ear: Point2, distance: number, random: Random): Point2 => {
  const bearing = random() * 2 * Math.PI;
  return [ear[0] + Math.sin(bearing) * distance, ear[1] - Math.cos(bearing) * distance];
};

/** Where a call of a voice at `spot` sounds from, round an ear at `ear`, or null where there is no such place near. */
export function placeCall(
  spot: Spot,
  ear: Point3,
  lay: Lay,
  range: { readonly distance: readonly [number, number]; readonly lift: readonly [number, number] },
  random: Random,
): Point3 | null {
  const reach = between(random, range.distance as [number, number]);
  const lift = between(random, range.lift as [number, number]);
  const flat: Point2 = [ear[0], ear[1]];
  switch (spot) {
    case 'hull':
    case 'rigging':
    case 'ear': {
      const [x, y] = aside(flat, reach, random);
      return [x, y, ear[2] + lift];
    }
    case 'around':
    case 'ground':
    case 'sky': {
      const [x, y] = aside(flat, reach, random);
      return [x, y, Math.max(0, groundOf(lay, spot === 'sky' ? ear[0] : x, spot === 'sky' ? ear[1] : y)) + lift];
    }
    case 'canopy':
      for (let tries = 0; tries < TRIES; tries++) {
        const [x, y] = aside(flat, reach * (1 - tries * 0.15), random);
        const ground = groundOf(lay, x, y);
        if (ground >= 0.5) return [x, y, ground + lift];
      }
      return null;
    case 'ridge': {
      let best: Point3 | null = null;
      for (let nth = 0; nth < RIDGE_BEARINGS; nth++) {
        const bearing = ((nth + random()) / RIDGE_BEARINGS) * 2 * Math.PI;
        const away = between(random, range.distance as [number, number]);
        const [x, y] = [ear[0] + Math.sin(bearing) * away, ear[1] - Math.cos(bearing) * away];
        const ground = groundOf(lay, x, y);
        if (ground >= 0.5 && (!best || ground > best[2])) best = [x, y, ground];
      }
      return best && [best[0], best[1], best[2] + lift];
    }
    case 'shore': {
      const shore = shoreOf(aside(flat, reach, random), lay.outline);
      if (!shore || Math.hypot(shore.at[0] - ear[0], shore.at[1] - ear[1]) > SHORE_REACH_M) return null;
      return [shore.at[0], shore.at[1], lift];
    }
    case 'offshore': {
      if (groundOf(lay, ear[0], ear[1]) < 0) {
        const [x, y] = aside(flat, reach, random);
        return [x, y, lift];
      }
      const shore = shoreOf(aside(flat, reach, random), lay.outline);
      if (!shore || Math.hypot(shore.at[0] - ear[0], shore.at[1] - ear[1]) > SHORE_REACH_M) return null;
      const [awayX, awayY] = [shore.at[0] - ear[0], shore.at[1] - ear[1]];
      const length = Math.hypot(awayX, awayY) || 1;
      const out = between(random, [10, 60]);
      return [shore.at[0] + (awayX / length) * out, shore.at[1] + (awayY / length) * out, lift];
    }
    case 'harbour': {
      if (!lay.harbour) return null;
      const [x, y] = aside(lay.harbour, reach, random);
      return [x, y, lift];
    }
    case 'city': {
      const middle = cityPoint(lay);
      if (!middle) return null;
      const [x, y] = aside(middle, reach, random);
      return [x, y, Math.max(0, groundOf(lay, x, y)) + lift];
    }
    case 'plaza': {
      const plaza = lay.plaza;
      if (!plaza) return null;
      const [west, north, east, south] = plaza.bounds;
      const [x, y] = aside(flat, reach, random);
      return [Math.max(west, Math.min(east, x)), Math.max(north, Math.min(south, y)), plaza.level + lift];
    }
    case 'smithy':
      return lay.smithy && [lay.smithy[0], lay.smithy[1], lay.smithy[2] + lift];
  }
}
