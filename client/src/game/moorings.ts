// Ships lying moored beside a social space's pier while a player walks it, as the Tower's Hangar showed the ships
// that brought its Guardians: each at her place from the city's plan, her sails furled, riding the sea's own swell as
// every other ship does.
import { hullSails, hullWaterline, SLOOP_HULL } from '../ships/hulls.ts';
import { SailRig } from '../ships/sails.ts';
import type { DrawnShip } from '../ships/shipModels.ts';
import { poseOnSwell } from '../ships/swellPose.ts';
import type { HullMask } from '../water/hullMask.ts';
import type { FriendlyWater } from './friendlyShips.ts';

/** Furled sails: a rig never set. */
const FURLED = new SailRig(hullSails(SLOOP_HULL));

/** The moored ships as a frame draws them at `time` (seconds), friendly sloops with their sails furled riding the
 *  swell, and their still footprints on the water. */
export function mooredShips(
  moorings: readonly (readonly [number, number, number])[],
  time: number,
  water: FriendlyWater,
): { ships: DrawnShip[]; hulls: HullMask[] } {
  const { lengthM, beamM } = hullWaterline(SLOOP_HULL);
  const [halfLength, halfBeam] = [lengthM / 2, beamM / 2];
  const ships = moorings.map(([x, y, heading]): DrawnShip => {
    const pose = poseOnSwell(water.swell, water.depthAt, { x, y, heading }, halfLength, halfBeam, time);
    const place = { x, y, z: pose.heave, heading, pitch: pose.pitch, roll: pose.roll };
    return { hull: SLOOP_HULL, place, rig: FURLED, look: { side: 'friendly' } };
  });
  const hulls = moorings.map(([x, y, heading]) => ({ x, y, heading, halfLength, halfBeam, way: 0 }));
  return { ships, hulls };
}
