// The regions of every island (`content/world/regions.json`), as the held map and the world's data read them: each
// region's island, name, centre, anchorage and nodes, and its island's outline, which says whose land a point is.

/** A point on the map, metres east and south of its north-west corner, as `ground.ts`'s: kept here, as the rooms
 *  read this file alone. */
type Point2 = readonly [number, number];

/** One region as the map knows it: the island it is of (its continent's id), its name, its centre, the anchorage a
 *  ship sails for, 3 km off its coast where the coast is nearest its centre, its nodes, and its island's outline
 *  (none for an island the layout does not draw). */
export interface MapRegion {
  readonly island: string;
  readonly name: string;
  readonly centre: Point2;
  readonly anchorage: Point2;
  /** The ids of the nodes it holds. */
  readonly nodes: readonly string[];
  readonly outline: readonly Point2[];
}

/** The regions of `content/world/regions.json`, island by island, each with its island's outline of `islands`
 *  (`content/world/layout.json`'s continents). */
export function regionsOf(
  text: string,
  islands: readonly { readonly id: string; readonly outline: readonly Point2[] }[],
): MapRegion[] {
  const parsed = JSON.parse(text) as {
    readonly island: string;
    readonly regions: readonly { name: string; centre: Point2; anchorage: Point2; nodes: readonly string[] }[];
  }[];
  return parsed.flatMap(({ island, regions }) => {
    const outline = islands.find((each) => each.id === island)?.outline ?? [];
    return regions.map(({ name, centre, anchorage, nodes }) => ({ island, name, centre, anchorage, nodes, outline }));
  });
}

/** The region of `regions` whose centre is nearest `point`, as each point of an island's land is reckoned; none of
 *  none. */
export function nearestRegion<R extends Pick<MapRegion, 'centre'>>(regions: readonly R[], [x, y]: Point2): R | null {
  let best: R | null = null;
  let bestApart = Number.POSITIVE_INFINITY;
  for (const region of regions) {
    const apart = Math.hypot(region.centre[0] - x, region.centre[1] - y);
    if (apart < bestApart) [best, bestApart] = [region, apart];
  }
  return best;
}

/** Whether `region`'s view holds the node `id`: one it lists, or one no region of `regions` lists (a city's social
 *  space), which every region's holds. */
export function regionHolds(
  regions: readonly Pick<MapRegion, 'nodes'>[],
  region: Pick<MapRegion, 'nodes'>,
  id: string,
): boolean {
  return region.nodes.includes(id) || !regions.some((each) => each.nodes.includes(id));
}

/** A region's name within a sentence: "the Weirlands". */
export function regionWords(name: string): string {
  return name.replace(/^The /, 'the ');
}
