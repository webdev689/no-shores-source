// A passage zone as the page draws and stands it: under ground its layout, drawn by the dungeon's renderer as a
// dungeon is; above ground its hollow, drawn by the islands' layer as an island's ground and modules are, with no sea
// and no continent's land round it; and in both the floor a body is predicted on, as the room stands it.
import { type DungeonLayout, readDungeon } from '../dungeonLayout.ts';
import { groundHeight } from '../../islands/isleGround.ts';
import { gridOf, type IsleShown, type Point2 } from '../../islands/islePlan.ts';
import { MODULE_NAMES } from '../../islands/isleModules.ts';
import type { IslePlacement } from '../../islands/islePlan.ts';
import type { PassagePlan } from '../../rules/passageRules.ts';
import { pieceModule, type PieceState } from './passagePieces.ts';

/** The floor of every passage under ground, as the Forge lays it (crates/dungeon `FLOOR_M`). */
export const UNDER_FLOOR_M = 0;

/** A zone under ground's layout for the dungeon's renderer; null for one above ground. */
export const zoneLayout = (plan: PassagePlan): DungeonLayout | null =>
  plan.ground.kind === 'under' ? readDungeon(plan.ground.layout) : null;

/** A zone above ground as the islands' layer shows an island, in the zone's own frame at `at` in the world: its
 *  modules on its heights (`room_passage_heights`), dressed from its island's kit by `climate`. The rest of an
 *  island's plan (its landing, its dungeon door, its wrecks) the zone has none of, and the layer draws none of it.
 *  Null for a zone under ground. */
export function zoneIsle(
  plan: PassagePlan,
  heights: Float64Array,
  climate: string,
  place: Point2 = [0, 0],
): IsleShown | null {
  const ground = plan.ground;
  if (ground.kind !== 'open') return null;
  const reach = Math.max(1, ...ground.ring.map(([x, y]) => Math.hypot(x, y)));
  const { sites } = plan;
  return {
    // The sea's islands count from 1, so a hollow's id, from 0 down, is none of theirs.
    id: -plan.zone.number,
    at: place,
    climate,
    heights,
    plan: {
      kind: 'cove',
      dungeon: '',
      radius: reach,
      reach,
      landing: sites.facing,
      anchorage: sites.arrive,
      spawns: [sites.arrive],
      facing: sites.facing,
      door: { at: sites.wayIn.at, facing: sites.wayIn.facing, style: '' },
      landmark: null,
      guards: [],
      camp: null,
      wrecks: [],
      nodes: [],
      ring: ground.ring,
      placements: ground.placements,
      blocks: ground.blocks,
    },
  };
}

/** The floor a body stands on at (x, y) of the zone's frame, as the room stands it: the Forge's floor under ground,
 *  the hollow's heights above (null off its ground). */
export function floorOf(plan: PassagePlan, heights: Float64Array | null): (x: number, y: number) => number | null {
  if (plan.ground.kind === 'under') return () => UNDER_FLOOR_M;
  if (!heights) throw new Error(`zone ${plan.zone.number} is above ground and was given no heights`);
  const grid = gridOf(heights);
  return (x, y) => groundHeight(grid, x, y);
}

/** A hollow with the passages' pieces standing in it as the islands' kit's modules, each as the deal stands for the
 *  player (`pieceModule`): `done` whether the deal is done. */
export function withPieces(isle: IsleShown, plan: PassagePlan, state: PieceState, done: boolean): IsleShown {
  const placed = plan.pieces.flatMap((piece): IslePlacement[] => {
    const module = MODULE_NAMES.indexOf(pieceModule(piece, state, done) ?? '');
    return module < 0 ? [] : [[module, piece.at[0], piece.at[1], piece.at[2], piece.facing, 1, 1]];
  });
  return { ...isle, plan: { ...isle.plan, placements: [...isle.plan.placements, ...placed] } };
}
