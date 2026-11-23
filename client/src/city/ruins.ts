// A ruined city's buildings, each broken by its place so every machine breaks it alike: one in four fallen to a heap
// of rubble in its footprint, the rest roofless and broken off at 35 to 75 % of their height, their walls scorched
// toward the break. The near models are cut in the shader; the masses and hulls are cut here.
import type { Mass } from '../models/buildingPlan.ts';
import { randomFromSeed } from '../models/random.ts';
import type { MassShape } from './cityMasses.ts';
import type { Solid } from './plan.ts';

/** One building in four falls; the rest keep this share of their height. */
const FALLEN_SHARE = 0.25;
const KEPT_LEAST = 0.35;
const KEPT_MOST = 0.75;
/** A fallen building's heap: this share of its walls' height, and never lower than this, metres. */
const HEAP_SHARE = 0.25;
const HEAP_LEAST_M = 1.5;

/** How a building stands in a ruin: fallen, or broken off at a height over its model's origin, metres. */
export type BuildingRuin = { readonly fallen: true } | { readonly fallen: false; readonly cut: number };

/** A seed from a place in the world (east, south): the place to the centimetre, as whole numbers, so every engine
 *  seeds the same. */
export function placeSeed(east: number, south: number): number {
  return Math.imul(Math.round(east * 100) | 0, 0x9e3779b1) ^ Math.imul(Math.round(south * 100) | 0, 0x85ebca77);
}

/** A building's ruin from where it stands in the world (east, south, metres) and its hull's base, eaves and ridge. */
export function buildingRuin(east: number, south: number, hull: Mass): BuildingRuin {
  const draw = randomFromSeed(placeSeed(east, south));
  if (draw.next() < FALLEN_SHARE) return { fallen: true };
  const kept = KEPT_LEAST + (KEPT_MOST - KEPT_LEAST) * draw.next();
  // never over its eaves, so no stub of its roof is left
  return { fallen: false, cut: Math.min(hull.eaves, hull.base + kept * (hull.ridge - hull.base)) };
}

/** A mass broken off at `cut` over its model's origin, roofless: none where it stood wholly above the break. */
export function brokenMass(mass: Mass, cut: number): Mass | null {
  if (mass.base >= cut) return null;
  const top = Math.min(mass.eaves, cut);
  return { ...mass, eaves: top, ridge: top, roof: 'flat' };
}

/** The heap a fallen building leaves: a low frustum of rubble over its hull's footprint, where its hull stood. */
export function fallenHeap(hull: MassShape, origin: readonly [number, number]): Solid {
  return {
    shape: 'pyramid',
    top: 0.3,
    at: [hull.east + origin[0], hull.south + origin[1], hull.base],
    size: [2 * hull.halfAlong, 2 * hull.halfAcross, Math.max(HEAP_LEAST_M, HEAP_SHARE * hull.wall)],
    turn: hull.turn,
    lean: 0,
    roll: 0,
    material: 'rubble',
  };
}
