// The regions of every island (`content/world/regions.json`), as the held map and the world's data read them: each
// region's island, name, centre and anchorage, and its island's outline, which says whose land a point is.

/** A point on the map, metres east and south of its north-west corner, as `ground.ts`'s: kept here, as the rooms
 *  read this file alone. */
type Point2 = readonly [number, number];

/** One region as the map knows it: the island it is of (its continent's id), its name, its centre, the anchorage a
 *  ship sails for, 3 km off its coast where the coast is nearest its centre, and its island's outline (none for an
 *  island the layout does not draw). */
export interface MapRegion {
  readonly island: string;
  readonly name: string;
  readonly centre: Point2;
  readonly anchorage: Point2;
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
    readonly regions: readonly { name: string; centre: Point2; anchorage: Point2 }[];
  }[];
  return parsed.flatMap(({ island, regions }) => {
    const outline = islands.find((each) => each.id === island)?.outline ?? [];
    return regions.map(({ name, centre, anchorage }) => ({ island, name, centre, anchorage, outline }));
  });
}
