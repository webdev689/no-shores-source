// The water's surface is a disc of rings round the eye (waterShader.ts), and a view draws only what it may see of it:
// the rings in bands, far first, each band only the arc of bearings its water can show in. A row of the draw is a
// ring of quads and a vertex a step round it, so an arc is one run of vertices, carried on past the last segment
// into the first, and a near crest still covers a far one: the rows of a draw are drawn in order, and bands far first.
import { type Planes, pointsSeen } from '../frustum.ts';

/** The disc: its first ring `inner` metres out, each ring after a fixed share wider out to `outer`, and `segments`
 *  steps round each. */
export interface Disc {
  readonly inner: number;
  readonly outer: number;
  readonly rings: number;
  readonly segments: number;
}

/** How many rings a band draws together. Near the eye a band shows in every bearing whatever the view, its water
 *  within reach of the eye; further out each band leaves out what is behind or beside the view. */
export const BAND_RINGS = 20;
/** The segments a bearing tested spans: the arcs are drawn in whole sectors of these. */
export const SECTOR_SEGMENTS = 4;

/** How far out ring `ring` lies, metres, as the shader's `ring_radius`: none at the eye, then `inner`, growing by a
 *  fixed share each ring to `outer`. */
export function ringRadius(disc: Disc, ring: number): number {
  if (ring <= 0) return 0;
  return disc.inner * (disc.outer / disc.inner) ** ((ring - 1) / (disc.rings - 1));
}

/** The arc of `seen` sectors round a circle, as its first sector and how many it runs on, past the last into the
 *  first: the shortest that holds every sector seen, the circle's longest gap left out. Null with none seen. */
export function arcOf(seen: readonly boolean[]): readonly [number, number] | null {
  const count = seen.length;
  if (!seen.includes(true)) return null;
  if (!seen.includes(false)) return [0, count];
  // The longest run of sectors unseen, counted round from a seen sector so no run is cut at the start.
  const from = seen.indexOf(true);
  let [gapEnd, gapLength, run] = [0, 0, 0];
  for (let step = 1; step <= count; step++) {
    const sector = (from + step) % count;
    run = seen[sector] ? 0 : run + 1;
    if (run > gapLength) [gapEnd, gapLength] = [sector, run];
  }
  return [(gapEnd + 1) % count, count - gapLength];
}

/**
 * The disc's draws, four numbers each: the first segment, how many segments it runs round, the first row and how many
 * rows, the farthest ring of quads the first row. Each band of rings draws the arc of bearings `planes` may see of
 * it, its water standing between `levels` (metres up from the eye, its lowest then its highest) and carried no more
 * than `shiftM` sideways; a band no part of which shows is not drawn, and bands after one another drawing the same arc
 * join in one draw.
 */
export function discDraws(planes: Planes, disc: Disc, levels: readonly [number, number], shiftM: number): number[] {
  const sectors = disc.segments / SECTOR_SEGMENTS;
  const width = (2 * Math.PI) / sectors;
  const bearings = bearingsOf(sectors);
  const corners = CORNERS;
  const seen = SEEN;
  seen.length = sectors;
  const draws: number[] = [];
  for (let first = 0; first < disc.rings; first += BAND_RINGS) {
    const last = Math.min(disc.rings, first + BAND_RINGS);
    // Row q holds the quads between rings rings - 1 - q and rings - q.
    const [near, far] = [ringRadius(disc, disc.rings - last), ringRadius(disc, disc.rings - first)];
    // An arc bulges past the straight edge between its ends by this much.
    const pad = shiftM + far * (1 - Math.cos(width / 2));
    for (let sector = 0; sector < sectors; sector++) {
      for (let corner = 0; corner < 8; corner++) {
        const bearing = (sector + (corner & 1)) * 2;
        const radius = corner & 2 ? far : near;
        corners[corner * 3] = bearings[bearing]! * radius;
        corners[corner * 3 + 1] = bearings[bearing + 1]! * radius;
        corners[corner * 3 + 2] = levels[corner & 4 ? 1 : 0];
      }
      seen[sector] = pointsSeen(planes, corners, pad);
    }
    const arc = arcOf(seen);
    if (!arc) continue;
    const [from, along] = [arc[0] * SECTOR_SEGMENTS, arc[1] * SECTOR_SEGMENTS];
    const tail = draws.length - 4;
    if (
      tail >= 0 &&
      draws[tail] === from &&
      draws[tail + 1] === along &&
      (draws[tail + 2] ?? 0) + (draws[tail + 3] ?? 0) === first
    )
      draws[tail + 3] = (draws[tail + 3] ?? 0) + last - first;
    else draws.push(from, along, first, last - first);
  }
  return draws;
}

/** A band's eight corners and which sectors it shows in, laid afresh by each band over the last's. */
const CORNERS = new Float64Array(8 * 3);
const SEEN: boolean[] = [];
/** The cosine and sine of each sector's edge round a circle of `sectors`, made once a count. */
const BEARINGS = new Map<number, Float64Array>();
function bearingsOf(sectors: number): Float64Array {
  let made = BEARINGS.get(sectors);
  if (!made) {
    made = new Float64Array((sectors + 1) * 2);
    for (let edge = 0; edge <= sectors; edge++) {
      const bearing = edge * ((2 * Math.PI) / sectors);
      [made[edge * 2], made[edge * 2 + 1]] = [Math.cos(bearing), Math.sin(bearing)];
    }
    BEARINGS.set(sectors, made);
  }
  return made;
}
