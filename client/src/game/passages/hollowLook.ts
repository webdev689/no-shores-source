// How a passage's hollow looks beyond what its room lays: its floor's ground by its form and name, and the meadow of
// the islands' kit's grass and shrubs grown over that floor. Neither stands anything solid, so the page alone draws
// them and the room's ground and blocks are as it lays them.
import { groundHeight, type GroundLook, groundLook } from '../../islands/isleGround.ts';
import { kitOfClimate, MODULE_NAMES } from '../../islands/isleModules.ts';
import { gridOf, type IslePlacement, type Point2 } from '../../islands/islePlan.ts';
import { hashOf } from '../../nature/scatter.ts';
import type { PassagePlan } from '../../rules/passageRules.ts';

type Colour = readonly [number, number, number];
/** The islands' own ground materials (`isleShader.ts`'s parts and the ground's sand and seabed) a hollow's floor
 *  wears, and a chalk hollow's walls. */
const CHALK: Colour = [0.82, 0.8, 0.72];
const CHALK_ROCK: Colour = [0.74, 0.72, 0.64];
const SAND: Colour = [0.8, 0.72, 0.54];
const SEA_FLOOR: Colour = [0.66, 0.64, 0.55];
const STONE: Colour = [0.6, 0.58, 0.53];
const STONE_ALT: Colour = [0.5, 0.48, 0.45];
const EARTH: Colour = [0.46, 0.37, 0.25];
const LEAF_LITTER: Colour = [0.36, 0.28, 0.18];
const TURF: Colour = [0.4, 0.44, 0.28];
/** A floor of one ground however high it lies, its walls' rock the kit's unless said. */
const look = (floor: Colour, more: { readonly paved?: boolean; readonly rock?: Colour } = {}): GroundLook => ({
  inland: floor,
  high: floor,
  snowM: 1e4,
  ...more,
});

/** A hollow's ground by its form, and by its name where that says a ground (`crates/passage/src/zone.rs` names):
 *  a hollow the land's own grass, or chalk under chalk walls; a ravine stony earth; shelves turf, or bare rock; a
 *  court flagstones; a strand sand, or a shell bed's dry sea floor; a grove leaf litter. */
export function hollowGround(form: string, name: string, climate: string): GroundLook {
  const says = name.toLowerCase();
  switch (form) {
    case 'ravine':
      return look(EARTH);
    case 'shelves':
      return says.includes('rock') ? look(STONE_ALT) : look(TURF);
    case 'court':
      return look(STONE, { paved: true });
    case 'strand':
      return says.includes('shell') ? look(SEA_FLOOR) : look(SAND);
    case 'grove':
      return look(LEAF_LITTER);
    default:
      return says.includes('chalk') ? look(CHALK, { rock: CHALK_ROCK }) : groundLook(climate);
  }
}

/** The meadow's grass and shrubs a square metre, by the hollow's form and its name where that says a ground: a grove
 *  thickest, bare rock, chalk and a court thin, a strand barest. */
function growthOf(form: string, name: string): { readonly grass: number; readonly shrubs: number } {
  const says = name.toLowerCase();
  if (form === 'grove') return { grass: 0.2, shrubs: 0.03 };
  if (form === 'strand') return { grass: says.includes('shell') ? 0.01 : 0.02, shrubs: 0.002 };
  if (form === 'court') return { grass: 0.06, shrubs: 0.003 };
  if (form === 'ravine') return { grass: 0.12, shrubs: 0.01 };
  if (says.includes('rock') || says.includes('chalk')) return { grass: 0.08, shrubs: 0.004 };
  return { grass: 0.3, shrubs: 0.012 };
}

/** How far the meadow keeps from where a body arrives and from each piece, metres. */
const CLEAR_OF_ARRIVAL_M = 3;
const CLEAR_OF_PIECES_M = 2;

/** Whether a point lies inside a ring, by the crossings of a ray east from it. */
function inside(ring: readonly Point2[], [x, y]: Point2): boolean {
  let crossings = 0;
  ring.forEach(([fromX, fromY], index) => {
    const [toX, toY] = ring[(index + 1) % ring.length] ?? [fromX, fromY];
    if (fromY > y !== toY > y && x < fromX + ((y - fromY) * (toX - fromX)) / (toY - fromY)) crossings++;
  });
  return crossings % 2 === 1;
}

/** The kit's grass and shrubs grown over a hollow's floor inside its ring, clear of the arrival and the pieces, on its
 *  heights, as thick as its form grows them (`growthOf`): drawn from the zone's number, the same each time. None
 *  under ground. */
export function meadow(plan: PassagePlan, heights: Float64Array, climate: string): IslePlacement[] {
  if (plan.ground.kind !== 'open' || plan.zone.ground.kind !== 'open') return [];
  const { ring } = plan.ground;
  const kit = kitOfClimate(climate) ?? 'temperate';
  const [grass, ...shrubs] = [`${kit}.grass`, `${kit}.shrub.a`, `${kit}.shrub.b`].map((name) =>
    MODULE_NAMES.indexOf(name),
  );
  const [west, east] = [Math.min(...ring.map(([x]) => x)), Math.max(...ring.map(([x]) => x))];
  const [north, south] = [Math.min(...ring.map(([, y]) => y)), Math.max(...ring.map(([, y]) => y))];
  const growth = growthOf(plan.zone.ground.form, plan.zone.name);
  const grid = gridOf(heights);
  const drawn = (seed: number, draw: number) => hashOf(plan.zone.number, seed, draw) / 4294967296;
  // Clear too of the rocks, ruins and wrecks the room stands, so nothing grows through them.
  const blocks = plan.ground.blocks;
  const clear = (spot: Point2) =>
    inside(ring, spot) &&
    blocks.every(
      ([left, top, right, bottom]) => spot[0] < left || spot[0] > right || spot[1] < top || spot[1] > bottom,
    ) &&
    Math.hypot(spot[0] - plan.sites.arrive[0], spot[1] - plan.sites.arrive[1]) >= CLEAR_OF_ARRIVAL_M &&
    plan.pieces.every((piece) => Math.hypot(spot[0] - piece.at[0], spot[1] - piece.at[1]) >= CLEAR_OF_PIECES_M);
  const area = (east - west) * (south - north);
  const placed: IslePlacement[] = [];
  const grow = (count: number, modules: readonly number[], sizes: readonly [number, number], salt: number) => {
    for (let index = 0; index < count; index++) {
      const seed = salt * 1_000_003 + index;
      const spot: Point2 = [west + (east - west) * drawn(seed, 0), north + (south - north) * drawn(seed, 1)];
      const module = modules[Math.floor(drawn(seed, 2) * modules.length)] ?? -1;
      const z = groundHeight(grid, spot[0], spot[1]);
      if (module < 0 || z === null || !clear(spot)) continue;
      const scale = sizes[0] + (sizes[1] - sizes[0]) * drawn(seed, 3);
      placed.push([module, spot[0], spot[1], z, drawn(seed, 4) * 2 * Math.PI, scale, 1]);
    }
  };
  grow(Math.round(area * growth.grass), [grass ?? -1], [0.8, 1.3], 1);
  grow(Math.round(area * growth.shrubs), shrubs, [0.7, 1.2], 2);
  return placed;
}
