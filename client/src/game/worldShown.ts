// What the held map at sea shows: the whole world, from the first time it is raised. Every island's coast, every port
// at its city and every node, a ship sailing for each to the sea just off its island's coast nearest it.
import { insideRing } from '../editor/placeDrawing.ts';
import type { MapPlace } from '../heldmap/heldMapScene.ts';
import type { Point2 } from '../overworld/ground.ts';
import { coastDistance, coastPoint, ringCentre } from '../overworld/islandView.ts';
import type { WorldData } from './worldData.ts';

/** How far off its island's coast a node is sailed for, metres, and the steps out the sea there is looked for in, as
 *  far as `farthestM`: the sea room refuses a course that ends on a coast or crosses one, and judges both by the
 *  island's outline, so a point on the outline is no place to sail for. */
export const OFF_COAST = { clearM: 400, stepM: 50, farthestM: 5_000 } as const;

/** Where a ship sails for a place at `centre` on the island of `outline`: out from it past the outline's coast
 *  nearest it, to the first point `OFF_COAST.clearM` clear of the outline; the coast itself where none lies that
 *  way. A place standing off its island's land is sailed for out from the island's middle through it instead. */
export function offCoast(centre: Point2, outline: readonly Point2[]): Point2 {
  const shore = coastPoint(centre, outline);
  const from =
    insideRing(outline, centre) && Math.hypot(shore[0] - centre[0], shore[1] - centre[1]) > 1
      ? centre
      : ringCentre(outline);
  const length = Math.hypot(shore[0] - from[0], shore[1] - from[1]) || 1;
  const out = [(shore[0] - from[0]) / length, (shore[1] - from[1]) / length] as const;
  for (let along = 0; along <= OFF_COAST.farthestM; along += OFF_COAST.stepM) {
    const point: Point2 = [shore[0] + out[0] * along, shore[1] + out[1] * along];
    if (!insideRing(outline, point) && coastDistance(point, outline) >= OFF_COAST.clearM) return point;
  }
  return shore;
}

/** What the held map shows at sea: its places, and its islands, a bit each by their place among the continents. */
export interface WorldShown {
  readonly places: readonly MapPlace[];
  readonly knownIslands: number;
}

/** The whole world as the held map shows it at sea. */
export function worldShown(world: WorldData): WorldShown {
  const sailFor = (node: WorldData['nodes'][number]) => {
    const outline = world.continents.find((continent) => continent.id === node.continent)?.outline;
    return outline?.length ? offCoast(node.centre, outline) : node.centre;
  };
  const places: MapPlace[] = [
    ...world.cities.map((city) => {
      const outline = world.continents.find((continent) => continent.id === city.continent)?.outline;
      return {
        id: `${city.id}-port`,
        name: city.name,
        kind: 'port',
        at: city.centre,
        sail: outline?.length ? offCoast(city.centre, outline) : city.centre,
      };
    }),
    ...world.nodes.map((node) => ({
      id: node.id,
      name: node.name,
      kind: node.kind,
      at: node.centre,
      sail: sailFor(node),
    })),
  ];
  return { places, knownIslands: world.continents.reduce((bits, unused, index) => bits | (1 << index), 0) };
}
