// The regions of every island (`content/world/regions.json`), as the held map and the world's data read them: each
// region's island, name, centre and anchorage.
import type { Point2 } from './ground.ts';

/** One region as the map knows it: the island it is of (its continent's id), its name, its centre and the anchorage a
 *  ship sails for, 3 km off its coast where the coast is nearest its centre. */
export interface MapRegion {
  readonly island: string;
  readonly name: string;
  readonly centre: Point2;
  readonly anchorage: Point2;
}

/** The regions of `content/world/regions.json`, island by island. */
export function regionsOf(text: string): MapRegion[] {
  const islands = JSON.parse(text) as {
    readonly island: string;
    readonly regions: readonly { name: string; centre: Point2; anchorage: Point2 }[];
  }[];
  return islands.flatMap(({ island, regions }) =>
    regions.map(({ name, centre, anchorage }) => ({ island, name, centre, anchorage })),
  );
}
