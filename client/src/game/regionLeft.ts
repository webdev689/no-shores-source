// Leaving a patrol zone finds the ship off that zone's side of the island: at its region's anchorage, unless the ship
// lies off that region already. The sea room places it so (`Sea::came_from`, `puts_in`); the page lays it there
// first, so the room is asked by that anchorage.
import regions from '../../../content/world/regions.json' with { type: 'json' };
import type { Point2 } from '../overworld/ground.ts';
import type { Sea } from './sea.ts';

const all = regions.flatMap((island) => island.regions);

/** The anchorage of the region of node `id`, where the ship at `ship` lies off another region (the one whose centre
 *  is nearest it, as the room judges); null for a node of no region, or a ship off its own already. */
export function anchorageLeft(id: string, [x, y]: Point2): Point2 | null {
  const region = all.find((each) => each.nodes.includes(id));
  if (!region) return null;
  const apart = (each: (typeof all)[number]) => Math.hypot(each.centre[0] - x, each.centre[1] - y);
  const off = all.reduce((best, each) => (apart(each) < apart(best) ? each : best), region);
  return off === region ? null : [region.anchorage[0], region.anchorage[1]];
}

/** Back at sea from node `left` (null from none), the ship laid at its region's anchorage where it lies off another,
 *  facing as it did; the room, asked by that anchorage as the page joins it, places it there too. */
export function lieOffRegionLeft(sea: Pick<Sea, 'position' | 'heading' | 'passage'>, left: string | null): void {
  const anchorage = left === null ? null : anchorageLeft(left, sea.position);
  if (anchorage) sea.passage.placeAt({ x: anchorage[0], y: anchorage[1], heading: sea.heading });
}
