// Leaving a patrol zone finds the ship off that zone's side of the island: at its region's anchorage, where the ship
// lies off another region of the island. The sea room places it so (`Sea::came_from`, `puts_in`); the page lays it
// there first, so the room is asked by that anchorage.
import { REGIONS } from '../../../server/arrival.ts';
import type { Point2 } from '../overworld/ground.ts';
import { nearestRegion } from '../overworld/regions.ts';
import type { Foot } from './foot.ts';
import { testZoneOf } from './rooms.ts';
import type { Sea } from './sea.ts';

/** The patrol zone the player stands in on its own land, its id; null anywhere else (its dungeon, a run, a Breach's
 *  test copy of it, a passage zone, an Elite Dungeon, any other node). Launched for a Breach's real run, they stood
 *  in the zone's own room, as the room left says. */
export function zoneLeft(foot: Pick<Foot, 'node' | 'dungeon' | 'run' | 'launchedFor'> | null): string | null {
  if (foot?.node.kind !== 'patrol' || foot.dungeon || foot.run) return null;
  const copy = foot.launchedFor !== null && testZoneOf(foot.launchedFor) !== null;
  return !copy && REGIONS.some((region) => region.nodes.includes(foot.node.id)) ? foot.node.id : null;
}

/** The anchorage of the region of node `id`, where the ship at `ship`, in the waters of `island` (a continent's id;
 *  null on none), lies off another region of the node's island (the one whose centre is nearest it within that
 *  island, as the room judges); null for a node of no region, a ship off its own already, or off another island. */
export function anchorageLeft(id: string, ship: Point2, island: string | null): Point2 | null {
  const region = REGIONS.find((each) => each.nodes.includes(id));
  if (!region || region.island !== island) return null;
  const off = nearestRegion(
    REGIONS.filter((each) => each.island === island),
    ship,
  );
  return off === region ? null : [region.anchorage[0], region.anchorage[1]];
}

/** Back at sea from node `left` (null from none), the ship laid at its region's anchorage where it lies off another,
 *  facing as it did; the room, asked by that anchorage as the page joins it, places it there too. */
export function lieOffRegionLeft(
  sea: Pick<Sea, 'position' | 'heading' | 'passage' | 'waterAt'>,
  left: string | null,
): void {
  const island = sea.waterAt?.(sea.position)?.island ?? null;
  const anchorage = left === null ? null : anchorageLeft(left, sea.position, island);
  if (anchorage) sea.passage.placeAt({ x: anchorage[0], y: anchorage[1], heading: sea.heading });
}
