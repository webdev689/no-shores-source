// A building far off, as instances of one shape the shader stands up: a box of walls from its base to its eaves, and a
// roof over it, gabled, hipped or flat. Further out than its masses, a building is one such hull.
import type { Mass } from '../models/buildingPlan.ts';
import { type Placement, toWorld } from './blocks.ts';

/** Numbers an instance takes: its middle and turn, its half sizes, height and rise, then four whole numbers. */
export const MASS_FLOATS = 12;

/** Whether a roof is hipped (its ends slope), and the tier the instance belongs to. */
export const MASS_HIP = 1;
export const MASS_TIER_MASSES = 2;
export const MASS_TIER_HULLS = 4;

/** A mass shorter than this, or smaller in plan, is a step or a ledge the far view leaves out. */
const LEAST_HEIGHT_M = 1.5;
const LEAST_AREA_M2 = 6;
/** The steepest a hull's roof rises over its half-span, as the forge pitches its roofs. */
const ROOF_PITCH = 0.9;

/** One instance: the middle of its base from the city's origin, the turn of its ridge's axis (clockwise from east),
 *  its half length along the ridge and across it, its walls' height and its roof's rise, its wall and roof layers,
 *  its cell and its flags. */
export type MassShape = {
  readonly east: number;
  readonly south: number;
  readonly base: number;
  readonly turn: number;
  readonly halfAlong: number;
  readonly halfAcross: number;
  readonly wall: number;
  readonly rise: number;
  readonly hip: boolean;
};

/** The masses worth drawing far off, the largest first. */
export function keptMasses(masses: readonly Mass[]): Mass[] {
  const area = (mass: Mass): number => (mass.east - mass.west) * (mass.north - mass.south);
  const kept = masses.filter((mass) => mass.eaves - mass.base >= LEAST_HEIGHT_M && area(mass) >= LEAST_AREA_M2);
  return (kept.length ? kept : [...masses]).sort((a, b) => area(b) * (b.eaves - b.base) - area(a) * (a.eaves - a.base));
}

/** A mass where its placement stands it, measured from the city's origin. */
export function massShape(mass: Mass, place: Placement, origin: readonly [number, number]): MassShape {
  const middle = toWorld(place, [(mass.west + mass.east) / 2, mass.base, (mass.south + mass.north) / 2]);
  const [alongX, alongZ] = [(mass.east - mass.west) / 2, (mass.north - mass.south) / 2];
  const alongModelX = mass.ridgeAlong === 'x';
  const [halfAlong, halfAcross] = alongModelX ? [alongX, alongZ] : [alongZ, alongX];
  return {
    east: middle[0] - origin[0],
    south: middle[1] - origin[1],
    base: middle[2],
    turn: alongModelX ? place.yaw : place.yaw - Math.PI / 2,
    halfAlong,
    halfAcross,
    wall: mass.eaves - mass.base,
    rise: mass.roof === 'flat' ? 0 : mass.ridge - mass.eaves,
    hip: mass.roof === 'hip',
  };
}

/** A building as one mass: the box round its kept masses, walled to its largest's eaves and roofed as that one is,
 *  the ridge along the box's longer side. Null for a building with no masses. */
export function hullOf(masses: readonly Mass[]): Mass | null {
  const kept = keptMasses(masses);
  const largest = kept[0];
  if (!largest) return null;
  const [west, east] = [Math.min(...kept.map((mass) => mass.west)), Math.max(...kept.map((mass) => mass.east))];
  const [south, north] = [Math.min(...kept.map((mass) => mass.south)), Math.max(...kept.map((mass) => mass.north))];
  const base = Math.min(...kept.map((mass) => mass.base));
  const halfSpan = Math.min(east - west, north - south) / 2;
  const rise = largest.roof === 'flat' ? 0 : Math.min(largest.ridge - largest.eaves, ROOF_PITCH * halfSpan);
  return {
    west,
    east,
    south,
    north,
    base,
    eaves: largest.eaves,
    ridge: largest.eaves + rise,
    roof: largest.roof,
    ridgeAlong: east - west >= north - south ? 'x' : 'z',
  };
}

/** A box, such as a prop standing for a building, as a flat-roofed mass. */
export function boxMass(box: { readonly min: readonly number[]; readonly max: readonly number[] }): Mass {
  const [west, base, south] = box.min,
    [east, top, north] = box.max;
  return { west, east, south, north, base, eaves: top, ridge: top, roof: 'flat', ridgeAlong: 'x' };
}

/** Writes the `place`th instance's numbers into the floats and their whole-number view. */
export function writeMass(
  floats: Float32Array,
  whole: Uint32Array,
  place: number,
  shape: MassShape,
  layers: { readonly wall: number; readonly roof: number },
  cell: number,
  tier: number,
): void {
  const base = place * MASS_FLOATS;
  floats.set(
    [shape.east, shape.south, shape.base, shape.turn, shape.halfAlong, shape.halfAcross, shape.wall, shape.rise],
    base,
  );
  whole.set([layers.wall, layers.roof, cell, (shape.hip ? MASS_HIP : 0) | tier], base + 8);
}
