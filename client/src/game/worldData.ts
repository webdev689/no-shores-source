import { ruinedName } from '../ruinedName.ts';
import { type MapRegion, regionsOf } from '../overworld/regions.ts';
import { type Post, type StationInfo, type Ways, socialLocked } from './nodes.ts';

/** A node's kind, as the edits files and the plans name it. */
export type NodeKind = 'social' | 'patrol' | 'mission' | 'dungeon' | 'boss' | 'outpost';

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
  /** A social space's stations (`nodes.ts`), and where Shape may stand in it, one a week. */
  readonly stations?: readonly StationInfo[];
  readonly visitorSpots?: readonly Point[];
  /** A social space's plaza (west, north, east, south): its ring reaches past it, a hub's along its ways. */
  readonly plazaBounds?: readonly [number, number, number, number];
  /** A social space's bounty board, where a player stands to read it, and where the board itself stands (the city
   *  crate's `board`). */
  readonly board?: Point | null;
  readonly boardAt?: Point | null;
  /** A social space's ways its townsfolk walk, and the posts they keep and visit (`life/`). */
  readonly ways?: Ways;
  readonly posts?: readonly Post[];
  /** A patrol area or mission no one may enter until a pass is done on it (`sitesOf`). */
  readonly locked?: boolean;
  /** A patrol area's resource places (where, and the island's resource they hold), where its room's nodes stand, in
   *  its layout's order. */
  readonly resources?: readonly { readonly at: Point; readonly holds?: string }[];
  /** A sea's island: its kind (cove, ruin, quarry), and its wrecks where they lie, in its plan's order. */
  readonly isle?: string;
  readonly wrecks?: readonly Point[];
  /** A patrol area's foes' sites, in its caverns and on its runs' beats, where its room stands groups (`laidNodes`). */
  readonly foes?: readonly Point[];
  /** The places its layout names, which a quest's goals stand at (layouts.ts `placesOf`); none for a node not laid. */
  readonly places?: readonly { readonly name: string; readonly at: Point; readonly radius: number }[];
  /** Its runs' sealed doors by name (layouts.ts `doorsOf`), where its room lays the passages' mouths. */
  readonly doors?: readonly { readonly name: string; readonly at: Point; readonly radius: number }[];
  /** Its layout's paths, each its points, along which its room lays where the fallen stand again (respawns.rs). */
  readonly paths?: readonly (readonly Point[])[];
  /** A patrol area's chest places and its props, of which a room playing alone keeps those that hold things
   *  (layouts.ts `findsOf`). */
  readonly chests?: readonly (readonly [number, number, number])[];
  readonly holderProps?: readonly (readonly [number, number, number, number, number, number])[];
  /** Gone to across a crossing gate, the patrol area crossed from: its room stands the player at its gate toward it. */
  readonly across?: string;
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
  /** Every island's three regions (`content/world/regions.json`), as the held map lights and sails for them. */
  readonly regions?: readonly MapRegion[];
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

/** The kinds of node locked until a pass is done on them: each opens once the open list names it. */
const LOCKABLE: readonly NodeKind[] = ['patrol', 'mission'];

/** What a locked node says when it is chosen or its gate is tried. */
export function lockedWords(name: string): string {
  return `${name} is locked`;
}

/** Reads a continent's city and nodes from its edits file's text; a patrol area or mission is locked unless `open`
 *  (the open list, `content/world/open.json`) names it. */
export function sitesOf(
  continent: string,
  editsText: string,
  open: readonly string[],
): { city: CityInfo | null; nodes: NodeInfo[] } {
  const edits = JSON.parse(editsText) as EditsFile;
  const city = edits.city ? { ...edits.city, continent } : null;
  const nodes = (edits.nodes ?? []).map((node) => ({
    ...node,
    continent,
    centre: ringMiddle(node.ring),
    locked: LOCKABLE.includes(node.kind) && !open.includes(node.id),
  }));
  return { city, nodes };
}

/** The ports the sea's waters and its room are opened with: each continent's city, as the waters' door takes them
 *  (crates/world/src/traffic.rs `Port`). The page and the server read them alike, from the land files. */
export function portsOf(
  cities: readonly CityInfo[],
): { readonly id: string; readonly name: string; readonly continent: string; readonly centre: Point }[] {
  return cities.map(({ id, name, continent, centre }) => ({ id, name, continent, centre }));
}

/** A port city as the page knows it: its id (its social space is the node `<id>-social`), name and continent. */
export interface PortCity {
  readonly id: string;
  readonly name: string;
  readonly continent: string;
}

/** The port cities among `ports`, in their order, as the sea numbers them: those whose ids are among the rules'
 *  `mainPorts`. */
export function portCities(ports: readonly PortCity[], mainPorts: readonly string[]): PortCity[] {
  return ports.filter((port) => mainPorts.includes(port.id));
}

/** Loads the world from the pages' `world/` folder. */
export async function loadWorld(base: string): Promise<WorldData> {
  const text = async (path: string) => {
    const response = await fetch(`${base}world/${path}`);
    if (!response.ok) throw new Error(`world/${path}: ${response.status}`);
    return response.text();
  };
  const [layoutText, openText, regionsText] = await Promise.all([
    text('layout.json'),
    text('open.json'),
    text('regions.json'),
  ]);
  const open = JSON.parse(openText) as string[];
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
    const sites = sitesOf(continent.id, continent.editsText, open);
    if (sites.city) cities.push(sites.city);
    nodes.push(...sites.nodes);
  }
  return { layoutText, continents, cities, nodes, regions: regionsOf(regionsText, continents) };
}

/** Where a player arriving at the node `id` lands: its continent, and its id and name; a city's social space is
 *  `<city id>-social`, named for its city, "Ruins of" its name where it is not among the port cities' ids
 *  `mainPorts` (the rules' own; with none known, by its name alone). Null for an id the world does not hold, or a
 *  locked one: played alone too, the page goes nowhere the server would refuse. */
export function arrivalAt(
  world: WorldData,
  id: string,
  mainPorts: readonly string[] | null = null,
): { continent: string; node: string; name: string } | null {
  if (socialLocked(id)) return null;
  const node = world.nodes.find((each) => each.id === id);
  if (node) return node.locked ? null : { continent: node.continent, node: node.id, name: node.name };
  const city = world.cities.find((each) => `${each.id}-social` === id);
  if (!city) return null;
  const ruined = mainPorts !== null && !mainPorts.includes(city.id);
  return { continent: city.continent, node: id, name: ruined ? ruinedName(city.name) : city.name };
}
