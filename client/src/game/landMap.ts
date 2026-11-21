// What the held map shows on land (heldmap/landSheet.ts), gathered from the node the player stands in: a social
// space's plan, its keepers' stalls, its places by name and where players land; a patrol area's paths, buildings,
// areas and sites; and under either the ground's relief.
import type { Solid } from '../city/plan.ts';
import { contours, footprint, type LandMark, type LandSheet, type Quad } from '../heldmap/landSheet.ts';
import { layoutBounds } from '../layout/layouts.ts';
import type { Point2 } from '../overworld/ground.ts';
import type { Landmass } from './landmass.ts';
import { stationWords } from './plazaLife.ts';
import type { NodeInfo } from './worldData.ts';

/** How far past its ring the sheet reaches, metres, and the most samples of the ground's relief across it. */
const MARGIN_M = 40;
const RELIEF_SAMPLES = 160;
/** What stands on a plan shows from this height up, metres: walls, stalls and buildings, not benches and crates. */
const STANDING_M = 1.8;
/** The plan's ground, shown faint: its paving, lawns, trodden earth and still water. */
const FLOORS: ReadonlySet<string> = new Set(['paving', 'lawn', 'earth', 'water']);
/** The shapes a plan builds with; natural rock is the land's, not the plan's. */
const BUILT: ReadonlySet<string> = new Set(['block', 'column', 'dome', 'pyramid', 'gable', 'arch', 'module']);

/** The sheet of the land `node` stands on, its relief read from `heightAt`. */
export function landSheetOf(
  node: NodeInfo,
  landmass: Pick<Landmass, 'plan' | 'drawnPlan' | 'layouts'>,
  heightAt: (x: number, y: number) => number | null,
): LandSheet {
  const [west, north, east, south] = layoutBounds(node);
  const origin: Point2 = [west - MARGIN_M, north - MARGIN_M];
  const [width, height] = [east - west + 2 * MARGIN_M, south - north + 2 * MARGIN_M];
  const local = (point: readonly [number, number]): Point2 => [point[0] - origin[0], point[1] - origin[1]];
  const within = ([x, y]: readonly [number, number]) =>
    x >= origin[0] && x <= origin[0] + width && y >= origin[1] && y <= origin[1] + height;
  const step = Math.max(4, Math.max(width, height) / RELIEF_SAMPLES);
  const sheet = {
    name: node.name,
    origin,
    width,
    height,
    ...contours(heightAt, origin, { width, height }, step),
    ring: node.ring.map(local),
  };
  const landing: LandMark[] = node.spawns.length ? [{ kind: 'landing', at: local(middleOf(node.spawns)) }] : [];
  const social = node.kind === 'social' ? landmass.drawnPlan : null;
  if (social) {
    // Its own solids and the city's landmark; the city's avenues round it are not the social space's.
    const solids = [...social.landmark, ...social.social.solids].filter((solid) => within([solid.at[0], solid.at[1]]));
    const quads = (keep: (solid: Solid) => boolean) =>
      solids.filter(keep).map((solid): Quad => {
        const [x, y] = local([solid.at[0], solid.at[1]]);
        return footprint([x, y], solid.size[0], solid.size[1], solid.turn);
      });
    const built = (solid: Solid) => BUILT.has(solid.shape) && !(solid.shape === 'module' && solid.group !== 0);
    const vendors = (node.stations ?? []).flatMap((station): LandMark[] => {
      const name = stationWords(station.kind);
      return name ? [{ kind: 'vendor', at: local(station.counter), name }] : [];
    });
    return {
      ...sheet,
      floors: quads((solid) => built(solid) && FLOORS.has(solid.material)),
      walks: quads((solid) => built(solid) && solid.material === 'path'),
      paths: [],
      standing: quads(
        (solid) =>
          built(solid) && !FLOORS.has(solid.material) && solid.material !== 'path' && solid.size[2] >= STANDING_M,
      ),
      places: (landmass.plan?.social.areas ?? []).map((area) => ({ name: area.name, at: local(area.at) })),
      marks: [...landing, ...vendors],
    };
  }
  const layout = landmass.layouts.find((each) => each.id === node.id);
  if (!layout) return { ...sheet, floors: [], walks: [], paths: [], standing: [], places: [], marks: landing };
  return {
    ...sheet,
    floors: [],
    walks: [],
    paths: layout.paths.map((path) => ({ track: path.tier === 'track', points: path.points.map(local) })),
    standing: layout.buildings.map(({ footprint: [left, top, right, bottom] }): Quad => [
      local([left, top]),
      local([right, top]),
      local([right, bottom]),
      local([left, bottom]),
    ]),
    places: layout.areas.map((area) => ({ name: area.name, at: local(area.at) })),
    marks: layout.sites.map((site) => ({ kind: site.kind, at: local(site.at) })),
  };
}

/** The middle of some points. */
function middleOf(points: readonly (readonly [number, number])[]): Point2 {
  const sum = points.reduce<[number, number]>((total, [x, y]) => [total[0] + x, total[1] + y], [0, 0]);
  return [sum[0] / points.length, sum[1] / points.length];
}
