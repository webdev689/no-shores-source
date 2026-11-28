// What the held map shows on land (heldmap/landSheet.ts), gathered from the node the player stands in: a social
// space's plan, its keepers' stalls, its trees, its places by name and where players land; a patrol area's paths,
// buildings, plantings, areas and sites; and under either the ground's relief.
import resources from '../../../content/gear/resources.json' with { type: 'json' };
import { moduleParts } from '../city/modules.ts';
import type { Solid } from '../city/plan.ts';
import { insideRing } from '../editor/placeDrawing.ts';
import { isGlyph, type KeeperGlyph, type LandGlyph, type MissionGlyph } from '../heldmap/landGlyphs.ts';
import { boxPrint, type GroundKind, type LandMark, type LandSheet, type Quad, relief } from '../heldmap/landSheet.ts';
import { layoutBounds, PATH_WIDTH_M } from '../layout/layouts.ts';
import { chaikin } from '../nature/ground.ts';
import type { Point2 } from '../overworld/ground.ts';
import type { RiverCourse } from '../rules/landRules.ts';
import type { Landmass } from './landmass.ts';
import { stationWords } from './plazaLife.ts';
import type { NodeInfo } from './worldData.ts';

/** How far past its ring the sheet reaches, metres, and the most samples of the ground's relief across it. */
const MARGIN_M = 40;
const RELIEF_SAMPLES = 160;
/** What stands on a plan shows from this height up, metres: walls, stalls and buildings, not benches and crates. */
const STANDING_M = 1.8;
/** The plan's grounds, washed by kind, by the material that lays them. */
const GROUNDS: Readonly<Record<string, GroundKind>> = {
  paving: 'paving',
  lawn: 'lawn',
  earth: 'earth',
  water: 'water',
};
/** The shapes a plan builds with; natural rock is the land's, not the plan's. */
const BUILT: ReadonlySet<string> = new Set(['block', 'column', 'dome', 'pyramid', 'gable', 'arch', 'module']);
/** The shrubs a layout plants in hedges and thickets; every other kind it plants is an orchard's tree.
 *  shortcut: copied from crates/layout/src/plantings.rs's CLIMATES; read it from the layout if it ever grows. */
const SHRUBS: ReadonlySet<string> = new Set([
  'gorse',
  'heather',
  'hazel',
  'sagebrush',
  'dwarf shrub',
  'dry shrub',
  'thorn bush',
  'understory',
]);
/** What the table calls each site's glyph, and a stall's whose keeper deals with no one. */
const SITE_WORDS: Readonly<Record<Exclude<LandGlyph, KeeperGlyph | MissionGlyph | 'resource'>, string>> = {
  landing: 'Landing',
  event: 'Public event',
  gate: 'Gate',
  door: 'Sealed door',
  objective: 'Objective',
  foes: 'Foes',
  beacon: 'Beacon',
};
const KEEPER_WORDS: Readonly<Record<string, string>> = { chandler: 'Chandler' };

/** How a piece of a plan reads by how it stands over the ground under it, metres: one whose underside stands this
 *  far up or more is walked under (a roof, a lintel, a tier above); of the rest, one this tall is a wall, a stall or a
 *  building, and one this tall a bench, a counter or a low wall; anything lower is the ground's. */
const OVERHEAD_M = 2.2;
const LOW_M = 0.4;

/** A piece of a plan as the map reads it: the ground it covers, and its underside and top, metres. */
type Piece = { readonly quad: Quad; readonly bottom: number; readonly top: number };

/** The ground a node's sheet takes in when its ring has no corners: this far round its middle, metres. */
const BARE_REACH_M = 100;

/** The sheet of the land `node` stands on: its relief and the heights its pieces stand over read from `heightAt`. */
export function landSheetOf(
  node: NodeInfo,
  landmass: Pick<Landmass, 'plan' | 'drawnPlan' | 'layouts' | 'view'>,
  heightAt: (x: number, y: number) => number | null,
): LandSheet {
  const [west, north, east, south] = node.ring.length
    ? layoutBounds(node)
    : [
        node.centre[0] - BARE_REACH_M,
        node.centre[1] - BARE_REACH_M,
        node.centre[0] + BARE_REACH_M,
        node.centre[1] + BARE_REACH_M,
      ];
  const origin: Point2 = [west - MARGIN_M, north - MARGIN_M];
  const [width, height] = [east - west + 2 * MARGIN_M, south - north + 2 * MARGIN_M];
  const local = (point: readonly [number, number]): Point2 => [point[0] - origin[0], point[1] - origin[1]];
  const onSheet = ([x, y]: readonly [number, number]) => x >= 0 && x <= width && y >= 0 && y <= height;
  const step = Math.max(4, Math.max(width, height) / RELIEF_SAMPLES);
  const sheet = {
    name: node.name,
    origin,
    width,
    height,
    ...relief(heightAt, origin, { width, height }, step),
    rivers: riversOn(landmass.view.rivers, local, { width, height }),
    ring: node.ring.map(local),
  };
  /** Every piece of a plan's solids that is built (not natural rock, nor the loose stone fallen from it, tipped as it
   *  lies: the layout crate's `rocks::loose`, nor a module's later surfaces), each module by its parts, whose ground
   *  reaches onto the sheet; with its material. */
  const piecesOf = (solids: readonly Solid[]) =>
    solids.flatMap((solid) => {
      const loose = solid.material === 'rubble' && (solid.lean !== 0 || solid.roll !== 0);
      if (!BUILT.has(solid.shape) || loose || (solid.shape === 'module' && solid.group !== 0)) return [];
      const middle = local([solid.at[0], solid.at[1]]);
      const [across, deep, tall] = solid.size;
      const parts = solid.shape === 'module' ? moduleParts(solid.module) : [];
      const boxes = parts.length ? parts : [[-across / 2, -deep / 2, 0, across / 2, deep / 2, tall]];
      return boxes.flatMap(([partWest = 0, partNorth = 0, low = 0, partEast = 0, partSouth = 0, high = 0]) => {
        const quad = boxPrint(middle, [partWest, partNorth, partEast, partSouth], solid.turn);
        if (!quad.some(onSheet)) return [];
        return [{ quad, bottom: solid.at[2] + low, top: solid.at[2] + high, material: solid.material }];
      });
    });
  /** The plan's pieces by how each reads, over the ground under its middle. */
  const sorted = (pieces: readonly (Piece & { readonly material: string })[]) => {
    const over = (piece: Piece) => {
      const [x, y] = piece.quad.reduce<[number, number]>(
        (sum, [east, south]) => [sum[0] + east / 4, sum[1] + south / 4],
        [0, 0],
      );
      const under = heightAt(x + origin[0], y + origin[1]) ?? 0;
      return { bottom: piece.bottom - under, top: piece.top - under };
    };
    const built = pieces
      .filter((piece) => !GROUNDS[piece.material] && piece.material !== 'path')
      .map((piece) => ({ piece, ...over(piece) }));
    return {
      grounds: pieces.flatMap((piece) => {
        const kind = GROUNDS[piece.material];
        return kind ? [{ kind, quad: piece.quad }] : [];
      }),
      walks: pieces.filter((piece) => piece.material === 'path').map((piece) => piece.quad),
      overhead: built.filter(({ bottom }) => bottom >= OVERHEAD_M).map(({ piece }) => piece.quad),
      standing: built
        .filter(({ bottom, top }) => bottom < OVERHEAD_M && top >= STANDING_M)
        .map(({ piece }) => piece.quad),
      low: built
        .filter(({ bottom, top }) => bottom < OVERHEAD_M && top >= LOW_M && top < STANDING_M)
        .map(({ piece }) => piece.quad),
    };
  };
  const landing = (): LandMark[] =>
    node.spawns.length ? [{ glyph: 'landing', at: local(middleOf(node.spawns)), word: SITE_WORDS.landing }] : [];
  const social = node.kind === 'social' ? landmass.drawnPlan : null;
  if (social) {
    // Its own solids, the city's landmark, and any of the city's works within its ring; not the avenues round it,
    // which are not the social space's.
    const works = social.works.filter((solid) => insideRing(node.ring, [solid.at[0], solid.at[1]]));
    const keepers = (node.stations ?? []).flatMap((station): LandMark[] => {
      const word = stationWords(station.kind) ?? KEEPER_WORDS[station.kind];
      return word && isGlyph(station.kind) ? [{ glyph: station.kind, at: local(station.counter), word }] : [];
    });
    return {
      ...sheet,
      ...sorted(piecesOf([...social.landmark, ...works, ...social.social.solids])),
      paths: [],
      plants: (social.social.plants ?? [])
        .map((plant) => ({ tree: plant.growth === 'tree', at: local([plant.at[0], plant.at[1]]) }))
        .filter((plant) => onSheet(plant.at)),
      places: (landmass.plan?.social.areas ?? []).map((area) => ({ name: area.name, at: local(area.at) })),
      marks: [...landing(), ...keepers],
    };
  }
  const bare = { grounds: [], walks: [], paths: [], standing: [], low: [], overhead: [], plants: [], places: [] };
  const layout = landmass.layouts.find((each) => each.id === node.id);
  if (!layout) return { ...sheet, ...bare, marks: landing() };
  const laid = sorted(piecesOf(layout.solids));
  // The landing zones past the landing (whose own site marks it), each fast travelled to from the map.
  const landings = (node.landings ?? []).map((zone) => ({ name: zone.name, at: local(zone.at) }));
  const zoneMarks = landings
    .slice(1)
    .map((zone): LandMark => ({ glyph: 'landing', at: zone.at, word: SITE_WORDS.landing }));
  return {
    ...sheet,
    ...laid,
    paths: layout.paths.map((path) => ({
      track: path.tier === 'track',
      width: PATH_WIDTH_M[path.tier],
      points: path.points.map(local),
    })),
    standing: [
      ...laid.standing,
      ...layout.buildings.map(({ footprint: [left, top, right, bottom] }): Quad => [
        local([left, top]),
        local([right, top]),
        local([right, bottom]),
        local([left, bottom]),
      ]),
    ],
    plants: (layout.plantings ?? []).flatMap((planting) =>
      planting.points.map((point) => ({ tree: !SHRUBS.has(planting.kind), at: local(point) })),
    ),
    places: layout.areas.map((area) => ({ name: area.name, at: local(area.at) })),
    ...(landings.length > 1 && { landings }),
    marks: [
      ...zoneMarks,
      ...layout.sites.flatMap((site): LandMark[] => {
        // A resource node is marked where it stands, named for the island's resource it gives.
        if (site.kind === 'resource') {
          const resource = resources.resources.find((each) => each.id === site.holds);
          return resource && site.node ? [{ glyph: 'resource', at: local(site.node), word: resource.name }] : [];
        }
        // A way's patrol walks its way: no mark holds it to one point (`layout::sites::WAY_PATROL`).
        if (site.kind === 'foes' && site.holds === 'patrol') return [];
        const glyph = site.kind;
        return isGlyph(glyph) && glyph in SITE_WORDS
          ? [{ glyph, at: local(site.at), word: SITE_WORDS[glyph as keyof typeof SITE_WORDS] }]
          : [];
      }),
    ],
  };
}

/** The lengths of the land's rivers whose bounds reach onto the sheet, as the ground draws them (their courses cut twice,
 *  `nature/ground.ts`), each as wide as its flow makes it (the land crate's `river_width_m`). */
function riversOn(
  rivers: readonly RiverCourse[],
  local: (point: readonly [number, number]) => Point2,
  size: { readonly width: number; readonly height: number },
): LandSheet['rivers'] {
  return rivers.flatMap((river) => {
    const course = chaikin(chaikin(river.points.map(([x, y], place) => [x, y, river.flow[place] ?? 0])));
    return course.slice(1).flatMap((point, place) => {
      const before = course[place] ?? point;
      const [from, to] = [local([before[0] ?? 0, before[1] ?? 0]), local([point[0] ?? 0, point[1] ?? 0])];
      const across = Math.max(from[0], to[0]) >= 0 && Math.min(from[0], to[0]) <= size.width;
      if (!across || Math.max(from[1], to[1]) < 0 || Math.min(from[1], to[1]) > size.height) return [];
      return [{ from, to, width: 2.4 * Math.sqrt(((before[2] ?? 0) + (point[2] ?? 0)) / 2) + 1.5 }];
    });
  });
}

/** The middle of some points. */
function middleOf(points: readonly (readonly [number, number])[]): Point2 {
  const sum = points.reduce<[number, number]>((total, [x, y]) => [total[0] + x, total[1] + y], [0, 0]);
  return [sum[0] / points.length, sum[1] / points.length];
}
