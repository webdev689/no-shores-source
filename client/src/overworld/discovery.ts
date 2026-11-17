// What a player has discovered of the world, for the held map's fog of war: the sea charted round where their ship
// has sailed, the islands sighted (each then seen whole), the ports whose icons they have seen, and the nodes seen
// from an island's side or landed at. Kept in the browser; the server keeps none of it yet.
import type { Point2 } from './ground.ts';
import { coastDistance } from './islandView.ts';

/** The world's frame, metres. */
export const WORLD_FRAME = { widthM: 4_915_200, heightM: 3_072_000 } as const;
/** A charted cell's side, metres: the frame is 1,024 of them across and 640 down. */
export const CHART_CELL_M = 4_800;
export const CHART_COLUMNS = WORLD_FRAME.widthM / CHART_CELL_M;
export const CHART_ROWS = WORLD_FRAME.heightM / CHART_CELL_M;
/** What a lookout sees from the masthead, metres: the sea is charted this far round the ship, and an island whose coast
 *  comes this near is sighted. */
export const SIGHT_M = 40_000;

export interface Discovery {
  /** A byte a cell over the frame, row by row from the north-west: 1 where the sea is charted. */
  readonly charted: Uint8Array;
  readonly islands: Set<string>;
  readonly ports: Set<string>;
  readonly nodes: Set<string>;
}

export function emptyDiscovery(): Discovery {
  return {
    charted: new Uint8Array(CHART_COLUMNS * CHART_ROWS),
    islands: new Set(),
    ports: new Set(),
    nodes: new Set(),
  };
}

/** Charts every cell whose middle lies within `radiusM` of a point; answers whether any was charted anew. */
export function chartAround(discovery: Discovery, point: Point2, radiusM: number = SIGHT_M): boolean {
  const [x, y] = [point[0] / CHART_CELL_M - 0.5, point[1] / CHART_CELL_M - 0.5];
  const reach = radiusM / CHART_CELL_M;
  let changed = false;
  for (let row = Math.max(0, Math.ceil(y - reach)); row <= Math.min(CHART_ROWS - 1, Math.floor(y + reach)); row++)
    for (
      let column = Math.max(0, Math.ceil(x - reach));
      column <= Math.min(CHART_COLUMNS - 1, Math.floor(x + reach));
      column++
    ) {
      const index = row * CHART_COLUMNS + column;
      if (discovery.charted[index] || (column - x) ** 2 + (row - y) ** 2 > reach * reach) continue;
      discovery.charted[index] = 1;
      changed = true;
    }
  return changed;
}

/** Sights every island whose coast lies within `sightM` of the ship; answers those sighted anew. */
export function sightIslands(
  discovery: Discovery,
  ship: Point2,
  islands: readonly { readonly id: string; readonly outline: readonly Point2[] }[],
  sightM: number = SIGHT_M,
): string[] {
  const sighted = islands.filter(
    ({ id, outline }) => !discovery.islands.has(id) && coastDistance(ship, outline) <= sightM,
  );
  for (const { id } of sighted) discovery.islands.add(id);
  return sighted.map(({ id }) => id);
}

/** A discovery as text to keep: the charted cells eight to a byte in base 64, and the ids discovered. */
export function discoveryText(discovery: Discovery): string {
  const bits = new Uint8Array(Math.ceil(discovery.charted.length / 8));
  discovery.charted.forEach((charted, index) => {
    if (charted) bits[index >> 3] = (bits[index >> 3] ?? 0) | (1 << (index & 7));
  });
  let binary = '';
  for (const byte of bits) binary += String.fromCharCode(byte);
  return JSON.stringify({
    charted: btoa(binary),
    islands: [...discovery.islands],
    ports: [...discovery.ports],
    nodes: [...discovery.nodes],
  });
}

/** A discovery read back from its text; text that is missing, damaged or of another shape reads as nothing
 *  discovered, so a bad store never stops the game. */
export function readDiscovery(text: string | null): Discovery {
  const discovery = emptyDiscovery();
  if (!text) return discovery;
  try {
    const kept = JSON.parse(text) as Record<string, unknown>;
    const ids = (value: unknown) => (Array.isArray(value) ? value.filter((id) => typeof id === 'string') : []);
    const binary = typeof kept['charted'] === 'string' ? atob(kept['charted']) : '';
    if (binary.length !== Math.ceil(discovery.charted.length / 8)) return emptyDiscovery();
    for (let index = 0; index < discovery.charted.length; index++)
      discovery.charted[index] = (binary.charCodeAt(index >> 3) >> (index & 7)) & 1;
    for (const id of ids(kept['islands'])) discovery.islands.add(id);
    for (const id of ids(kept['ports'])) discovery.ports.add(id);
    for (const id of ids(kept['nodes'])) discovery.nodes.add(id);
    return discovery;
  } catch {
    return emptyDiscovery();
  }
}
