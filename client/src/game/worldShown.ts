// What the held map at sea shows: the whole world, from the first time it is raised. Every island's coast, every port
// at its city and every node, a ship sailing for a node to its island's coast nearest it.
import type { MapPlace } from '../heldmap/heldMapScene.ts';
import { coastPoint } from '../overworld/islandView.ts';
import type { WorldData } from './worldData.ts';

/** What the held map shows at sea: its places, and its islands, a bit each by their place among the continents. */
export interface WorldShown {
  readonly places: readonly MapPlace[];
  readonly knownIslands: number;
}

/** The whole world as the held map shows it at sea. */
export function worldShown(world: WorldData): WorldShown {
  const sailFor = (node: WorldData['nodes'][number]) => {
    const outline = world.continents.find((continent) => continent.id === node.continent)?.outline;
    return outline?.length ? coastPoint(node.centre, outline) : node.centre;
  };
  const places: MapPlace[] = [
    ...world.cities.map((city) => ({
      id: `${city.id}-port`,
      name: city.name,
      kind: 'port',
      at: city.centre,
      sail: city.centre,
    })),
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
