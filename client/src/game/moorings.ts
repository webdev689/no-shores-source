// Ships lying still in the sea by an island while a player walks it, each in its own hull, its sails furled, riding
// the sea's own swell as every other ship does: the player's own where it lies docked, while it is docked at this
// island; every other player's parked there, as the land room tells; and beside a social space's pier, as the Tower's
// Hangar showed the ships that brought its Guardians, the city's sloops at the places of its plan no player's ship
// lies in.
import type { SeenShip } from '../network/messages.ts';
import { hullSails, hullWaterline, SLOOP_HULL } from '../ships/hulls.ts';
import { SailRig } from '../ships/sails.ts';
import type { DrawnShip } from '../ships/shipModels.ts';
import { poseOnSwell } from '../ships/swellPose.ts';
import type { HullMask } from '../water/hullMask.ts';
import { freePlaces } from './berths.ts';
import type { Berthed } from './docking.ts';
import type { FriendlyWater } from './friendlyShips.ts';
import type { CityPlan } from './nodes.ts';
import type { NodeInfo } from './worldData.ts';

/** A ship lying still: where, the way her bow points, and her hull. */
export interface LyingShip {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly hull: number;
}

/** The player's own ship as the frames know it: where it lies docked, if it does, where it lies, and its hull. */
export interface OwnShip {
  readonly docked: Berthed | null;
  readonly lies: { readonly x: number; readonly y: number; readonly heading: number } | undefined;
  readonly hull: number | undefined;
}

/** Each hull's sails furled: a rig never set, made once. */
const FURLED = new Map<number, SailRig>();
function furled(hull: number): SailRig {
  const rig = FURLED.get(hull) ?? new SailRig(hullSails(hull));
  FURLED.set(hull, rig);
  return rig;
}

/** Whether `node` is of the island a ship `docked` lies at: that sea island's beach (its room named for its number,
 *  `isleRoomName`), or any node of the landmass but its sea islands'. */
function onIsland(node: Pick<NodeInfo, 'id' | 'continent'>, docked: Berthed): boolean {
  const { aim } = docked;
  if (aim.kind === 'isle') return node.id.startsWith(`isle-${aim.id}-`);
  return node.continent === docked.landmass && !node.id.startsWith('isle-');
}

/** The ships lying by the island a player walks at `node`: their own where it lies, while it is docked at this island;
 *  every other player's parked here (`parked`, the land room's word); and at a social space its city's pier's sloops
 *  (`plan`), in the places of it no player's ship lies in. */
export function shipsLying(
  node: Pick<NodeInfo, 'id' | 'continent' | 'kind'>,
  plan: Pick<CityPlan, 'social'> | null,
  own: OwnShip,
  parked: readonly SeenShip[],
): LyingShip[] {
  const { docked, lies } = own;
  const ownLying = docked && lies && onIsland(node, docked) ? [{ ...lies, hull: own.hull ?? SLOOP_HULL }] : [];
  const players = [...ownLying, ...parked.map(({ x, y, heading, hull }) => ({ x, y, heading, hull }))];
  const pier = node.kind === 'social' ? (plan?.social.moorings ?? []) : [];
  return [...players, ...freePlaces(pier, players).map(([x, y, heading]) => ({ x, y, heading, hull: SLOOP_HULL }))];
}

/** The ships lying still as a frame draws them at `time` (seconds), in friendly colours, their sails furled, riding
 *  the swell, and their still footprints on the water. */
export function mooredShips(
  lying: readonly LyingShip[],
  time: number,
  water: FriendlyWater,
): { ships: DrawnShip[]; hulls: HullMask[] } {
  const drawn = lying.map(({ x, y, heading, hull }) => {
    const { lengthM, beamM } = hullWaterline(hull);
    const [halfLength, halfBeam] = [lengthM / 2, beamM / 2];
    const pose = poseOnSwell(water.swell, water.depthAt, { x, y, heading }, halfLength, halfBeam, time);
    const place = { x, y, z: pose.heave, heading, pitch: pose.pitch, roll: pose.roll };
    const ship: DrawnShip = { hull, place, rig: furled(hull), look: { side: 'friendly' } };
    return { ship, footprint: { x, y, heading, halfLength, halfBeam, way: 0 } };
  });
  return { ships: drawn.map((each) => each.ship), hulls: drawn.map((each) => each.footprint) };
}
