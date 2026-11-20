import type { StationInfo } from './nodes.ts';

/** A node's kind, as the edits files and the plans name it. */
export type NodeKind = 'social' | 'patrol' | 'mission' | 'dungeon' | 'boss';

type Point = readonly [number, number];

/** A node: one section of a continent's land a player lands in, and its spawns. */
export interface NodeInfo {
  readonly id: string;
  readonly kind: NodeKind;
  readonly name: string;
  readonly continent: string;
  readonly ring: readonly Point[];
  readonly spawns: readonly Point[];
  readonly centre: Point;
  /** A social space's stations (`nodes.ts`). */
  readonly stations?: readonly StationInfo[];
  /** A social space's bounty board, where a player stands to read it (the city crate's `board`). */
  readonly board?: Point | null;
}

/** A continent's port city, as its edits file names it. */
export interface CityInfo {
  readonly id: string;
  readonly name: string;
  readonly motif: string;
  readonly continent: string;
  readonly centre: Point;
}

/** A continent of the layout: its id, its painted coast, its biome, and its edits file's text (null for none). */
export interface ContinentInfo {
  readonly id: string;
  readonly outline: readonly Point[];
  readonly climate: string | null;
  readonly editsText: string | null;
}

/** Everything the game reads before it draws: the layout, each continent, its city and its drawn nodes. */
export interface WorldData {
  readonly layoutText: string;
  readonly continents: readonly ContinentInfo[];
  readonly cities: readonly CityInfo[];
  readonly nodes: readonly NodeInfo[];
}

interface EditsFile {
  readonly city?: { readonly id: string; readonly name: string; readonly centre: Point; readonly motif: string };
  readonly nodes?: readonly {
    readonly id: string;
    readonly kind: NodeKind;
    readonly name: string;
    readonly ring: readonly Point[];
    readonly spawns: readonly Point[];
  }[];
}

/** The middle of a ring: the mean of its points, which a section's star-shaped ring always holds. */
export function ringMiddle(ring: readonly Point[]): Point {
  const sum = ring.reduce((total, point) => [total[0] + point[0], total[1] + point[1]] as const, [0, 0] as const);
  return [sum[0] / ring.length, sum[1] / ring.length];
}

/** Reads a continent's city and nodes from its edits file's text. */
export function sitesOf(continent: string, editsText: string): { city: CityInfo | null; nodes: NodeInfo[] } {
  const edits = JSON.parse(editsText) as EditsFile;
  const city = edits.city ? { ...edits.city, continent } : null;
  const nodes = (edits.nodes ?? []).map((node) => ({ ...node, continent, centre: ringMiddle(node.ring) }));
  return { city, nodes };
}

/** Loads the world from the pages' `world/` folder. */
export async function loadWorld(base: string): Promise<WorldData> {
  const text = async (path: string) => {
    const response = await fetch(`${base}world/${path}`);
    if (!response.ok) throw new Error(`world/${path}: ${response.status}`);
    return response.text();
  };
  const layoutText = await text('layout.json');
  const layout = JSON.parse(layoutText) as { continents: { id: string; outline: Point[]; climate?: string }[] };
  const continents = await Promise.all(
    layout.continents.map(async (continent) => ({
      id: continent.id,
      outline: continent.outline,
      climate: continent.climate ?? null,
      editsText: await text(`land/${continent.id}.json`).catch(() => null),
    })),
  );
  const cities: CityInfo[] = [];
  const nodes: NodeInfo[] = [];
  for (const continent of continents) {
    if (continent.editsText === null) continue;
    const sites = sitesOf(continent.id, continent.editsText);
    if (sites.city) cities.push(sites.city);
    nodes.push(...sites.nodes);
  }
  return { layoutText, continents, cities, nodes };
}

/** Where a player arriving at the node `id` lands: its continent, and its id and name; a city's social space is
 *  `<city id>-social`, named for its city. Null for an id the world does not hold. */
export function arrivalAt(world: WorldData, id: string): { continent: string; node: string; name: string } | null {
  const node = world.nodes.find((each) => each.id === id);
  if (node) return { continent: node.continent, node: node.id, name: node.name };
  const city = world.cities.find((each) => `${each.id}-social` === id);
  return city ? { continent: city.continent, node: id, name: city.name } : null;
}
