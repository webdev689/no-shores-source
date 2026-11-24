import type { Places } from './marks.ts';
import { insideRing, nextId, ringArea, type Spot } from './placeDrawing.ts';

/** What a node is for, each drawn in its own colour. */
export const NODE_COLOURS = {
  social: '#f2c14e',
  patrol: '#5cc96b',
  mission: '#4d9de0',
  dungeon: '#a873e8',
  boss: '#e5484d',
  outpost: '#3fb8af',
} as const;
export type NodeKind = keyof typeof NODE_COLOURS;
export const NODE_KINDS = Object.keys(NODE_COLOURS) as NodeKind[];

/** The motifs a port city's plan is built round, one for each continent's city. */
export const MOTIFS = [
  'beacon',
  'span',
  'great-hall',
  'sun-dome',
  'granary-ring',
  'stepped-temple',
  'windwall',
  'drowned-bell',
  'whalebone-gate',
] as const;

/** How far a port city's wall stands from its middle, metres: the city crate's radius. */
export const WALL_RADIUS_M = 3456;

/** A landmass's port city, as its edits file keeps it. */
export interface City {
  readonly id: string;
  readonly name: string;
  readonly centre: Spot;
  readonly motif: string;
}

/** A node: its section of the land, a ring, and the spawns a player lands and respawns at. */
export interface Node {
  readonly id: string;
  readonly kind: NodeKind;
  readonly name: string;
  readonly ring: readonly Spot[];
  readonly spawns: readonly Spot[];
}

const whole = ([x, y]: Spot): Spot => [Math.round(x), Math.round(y)];

/** A whole-metre point inside a ring: the mean of its points when that lies inside, else the middle of the first
 *  corner's triangle that does, which a ring that never crosses itself always has. */
export function ringMiddle(ring: readonly Spot[]): Spot {
  const count = Math.max(1, ring.length);
  const mean = whole([ring.reduce((sum, [x]) => sum + x, 0) / count, ring.reduce((sum, [, y]) => sum + y, 0) / count]);
  if (insideRing(ring, mean)) return mean;
  for (let index = 0; index < ring.length; index++) {
    const corners = [-1, 0, 1].map((step) => ring[(index + step + ring.length) % ring.length] ?? mean);
    const middle = whole([
      corners.reduce((sum, [x]) => sum + x, 0) / 3,
      corners.reduce((sum, [, y]) => sum + y, 0) / 3,
    ]);
    if (insideRing(ring, middle)) return middle;
  }
  return ring[0] ?? mean;
}

/** The points of a drawing with repeats dropped (a double-click lands twice); for a ring, also a last point that
 *  comes back to its first. */
export function distinctPoints(points: readonly Spot[], ring: boolean): Spot[] {
  const kept = points.filter((spot, index) => index === 0 || spot.join() !== points[index - 1]?.join());
  if (ring && kept.length > 1 && kept[kept.length - 1]?.join() === kept[0]?.join()) kept.pop();
  return kept;
}

/** The node whose section holds a spot: the smallest where sections overlap. */
export function nodeAt(nodes: readonly Node[] | undefined, spot: Spot): Node | null {
  const holding = (nodes ?? []).filter((node) => insideRing(node.ring, spot));
  return holding.reduce<Node | null>(
    (best, node) => (!best || ringArea(node.ring) < ringArea(best.ring) ? node : best),
    null,
  );
}

/** The spawn nearest a spot within `reachM`: its node's id and its place in that node's list. */
export function spawnAt(
  nodes: readonly Node[] | undefined,
  spot: Spot,
  reachM: number,
): { node: string; index: number } | null {
  let best: { node: string; index: number; distance: number } | null = null;
  for (const node of nodes ?? [])
    for (const [index, spawn] of node.spawns.entries()) {
      const distance = Math.hypot(spawn[0] - spot[0], spawn[1] - spot[1]);
      if (distance <= reachM && (!best || distance < best.distance)) best = { node: node.id, index, distance };
    }
  return best && { node: best.node, index: best.index };
}

/** A node drawn as `ring`, numbered after the file's others (`node-4`), named after its id when `name` is blank,
 *  with one spawn at its middle. */
export function newNode(places: Places, kind: NodeKind, name: string, ring: readonly Spot[]): Node {
  const id = nextId(places, 'node');
  return { id, kind, name: name.trim() || id, ring: ring.map(whole), spawns: [ringMiddle(ring.map(whole))] };
}

/** The nodes with one of them changed by `change`. */
function changed(nodes: readonly Node[] | undefined, id: string, change: (node: Node) => Node): Node[] {
  return (nodes ?? []).map((node) => (node.id === id ? change(node) : node));
}

/** The nodes with a spawn added at `spot` to the node that holds it; null when none does. */
export function withSpawn(nodes: readonly Node[] | undefined, spot: Spot): Node[] | null {
  const node = nodeAt(nodes, spot);
  return node ? changed(nodes, node.id, (each) => ({ ...each, spawns: [...each.spawns, whole(spot)] })) : null;
}

/** The nodes with the last spawn taken from the node that holds `spot`; null when it has none. */
export function withoutLastSpawn(nodes: readonly Node[] | undefined, spot: Spot): Node[] | null {
  const node = nodeAt(nodes, spot);
  if (!node || node.spawns.length === 0) return null;
  return changed(nodes, node.id, (each) => ({ ...each, spawns: each.spawns.slice(0, -1) }));
}

/** The nodes with one spawn taken out. */
export function withoutSpawn(nodes: readonly Node[] | undefined, found: { node: string; index: number }): Node[] {
  return changed(nodes, found.node, (node) => ({
    ...node,
    spawns: node.spawns.filter((_spawn, index) => index !== found.index),
  }));
}

/** The nodes with one node's kind or name changed; a blank name is refused, so the node keeps its own. */
export function withNodeFields(
  nodes: readonly Node[] | undefined,
  id: string,
  fields: { readonly kind?: NodeKind; readonly name?: string },
): Node[] {
  const name = fields.name?.trim();
  return changed(nodes, id, (node) => ({ ...node, kind: fields.kind ?? node.kind, name: name || node.name }));
}

/** The port city moved to `spot`, in whole metres. */
export function movedCity(city: City, spot: Spot): City {
  return { ...city, centre: whole(spot) };
}

/** Where to look to see a site whole: its middle and how far across the view should reach, metres. */
export function siteFocus(places: Places, id: string): { x: number; y: number; acrossM: number } | null {
  if (places.city?.id === id) {
    const [x, y] = places.city.centre;
    return { x, y, acrossM: WALL_RADIUS_M * 2.5 };
  }
  const node = places.nodes?.find((each) => each.id === id);
  if (!node || node.ring.length === 0) return null;
  const eastings = node.ring.map(([x]) => x);
  const southings = node.ring.map(([, y]) => y);
  const [west, east, north, south] = [
    Math.min(...eastings),
    Math.max(...eastings),
    Math.min(...southings),
    Math.max(...southings),
  ];
  return { x: (west + east) / 2, y: (north + south) / 2, acrossM: Math.max(200, east - west, south - north) * 1.6 };
}
