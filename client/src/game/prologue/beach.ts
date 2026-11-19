// Where the player washes up: a gentle strand of Saltmere's shore near Overlook, found from the town outward. Rays
// leave the plaza in every direction; where one first meets the sea, the ground just above the water is a beach if it
// is low, slopes gently inland, lies clear of the city's pads and well away from its harbour's quays.

type Point = readonly [number, number];

/** How the search walks and what it takes for a beach, metres. */
const STEP_M = 8;
const RAYS = 96;
const ASHORE_M = 10;
const BEACH_HIGH_M = [0.25, 2.8] as const;
const INLAND_M = 40;
const INLAND_HIGHEST_M = 9;
const HARBOUR_CLEAR_M = 260;

export interface Beach {
  /** Where the player lies, a little up from the water. */
  readonly at: Point;
  /** The bearing from there inland, toward the town. */
  readonly inland: number;
  /** Where the water's edge is, beyond the player. */
  readonly edge: Point;
}

/** The nearest beach to `from` within `reachM`, or null where there is none. */
export function findBeach(
  heightAt: (x: number, y: number) => number | null,
  from: Point,
  harbour: Point,
  cleared: (x: number, y: number) => boolean,
  reachM: number,
): Beach | null {
  let best: { beach: Beach; distance: number } | null = null;
  for (let ray = 0; ray < RAYS; ray++) {
    const bearing = (ray / RAYS) * Math.PI * 2;
    const [east, south] = [Math.sin(bearing), -Math.cos(bearing)];
    for (let along = STEP_M; along <= reachM; along += STEP_M) {
      const point: Point = [from[0] + east * along, from[1] + south * along];
      const ground = heightAt(point[0], point[1]);
      if (ground === null) break;
      if (ground >= 0) continue;
      const ashore: Point = [point[0] - east * ASHORE_M, point[1] - south * ASHORE_M];
      const inland: Point = [ashore[0] - east * INLAND_M, ashore[1] - south * INLAND_M];
      const [height, higher] = [heightAt(ashore[0], ashore[1]), heightAt(inland[0], inland[1])];
      const low = height !== null && height >= BEACH_HIGH_M[0] && height <= BEACH_HIGH_M[1];
      const gentle = higher !== null && higher <= INLAND_HIGHEST_M;
      const quays = Math.hypot(ashore[0] - harbour[0], ashore[1] - harbour[1]) < HARBOUR_CLEAR_M;
      if (low && gentle && !quays && !cleared(ashore[0], ashore[1]) && (!best || along < best.distance))
        best = { beach: { at: ashore, inland: bearing + Math.PI, edge: point }, distance: along };
      break;
    }
  }
  return best?.beach ?? null;
}
