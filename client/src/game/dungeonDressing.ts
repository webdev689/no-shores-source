// What a dungeon wears past its code-built rooms: each style's kit pieces and its landmarks, laid from the style's
// pack into the dungeon's one mesh in the pictures of the cell each stands on. A landmark whose style has no pack
// stands as plain stone boxes of its solids, so nothing unseen stands in the way.
import type { MeshBuilder } from '../models/model.ts';
import type { Climate } from '../textures/climate.ts';
import type { Rect } from './dungeonCells.ts';
import { joinedOn } from './dungeonJoins.ts';
import { type KitPlacement, kitsOf } from './dungeonKits.ts';
import { placedLandmarks } from './dungeonLandmarks.ts';
import { type DungeonLayout, STAIR, styleAt, type StyleKey, VOID } from './dungeonLayout.ts';
import { box, type Kitted, lookAt } from './dungeonMesh.ts';
import { storeyKits } from './dungeonStoreyKits.ts';
import { raised, type StoreyPlane, storeyPlanes } from './dungeonStoreyPlanes.ts';
import { layModule, loadStylePack, type ModulePack, partPicture } from './dungeonModules.ts';

/** The packs of every style the layout's looks wear that has one, each fetched once. */
export async function stylePacks(
  layout: DungeonLayout,
  load: (style: StyleKey) => Promise<ModulePack | null> = loadStylePack,
): Promise<Map<StyleKey, ModulePack>> {
  const styles = [...new Set(layout.looks.map((look) => look.style))];
  const loaded = await Promise.all(styles.map((style) => load(style)));
  return new Map(styles.flatMap((style, index) => (loaded[index] ? [[style, loaded[index]] as const] : [])));
}

/** What a dungeon is dressed in: the mesh's own pieces its kits stand in place of, the landmarks' cells whose floor
 *  the piece lays, and the laying of each storey's pieces into a mesh raised to its floor (the top storey's, unless
 *  named), the pieces that join the storeys with the top storey's. */
export type Dressing = Kitted & { readonly lay: (mesh: MeshBuilder, plane?: StoreyPlane) => void };

/** The props' plans a storey's kits keep clear of: one list for every storey, or each storey's own. */
export type PropPlans = readonly Rect[] | ((plane: StoreyPlane) => readonly Rect[]);

/** A dungeon's dressing from its styles' packs, on an island of `climate`, its kits clear of its props' plans. */
export function dressingOf(
  layout: DungeonLayout,
  packs: ReadonlyMap<StyleKey, ModulePack>,
  climate: Climate,
  props: PropPlans,
): Dressing {
  const planes = storeyPlanes(layout);
  const joined = joinedOn(layout);
  const cells = layout.columns * layout.rows;
  const storeys = planes.map((plane) => {
    const { opened } = joined(plane.storey);
    const local = plane.layout;
    const busy = local.cells.flatMap((kind, cell) =>
      kind === STAIR || kind === VOID || opened.has(cell) ? [cell] : [],
    );
    const plans = typeof props === 'function' ? props(plane) : props;
    const { placed, fitted } = kitsOf(local, packs, plans, { exit: plane.exit, portal: plane.portal, busy });
    const landmarks = placedLandmarks(local).map((landmark) => ({
      ...landmark,
      piece: packs.get(landmark.style)?.modules.get(landmark.module) ?? null,
    }));
    return { plane, placed, fitted, landmarks };
  });
  const joins = storeyKits(layout, packs);
  const pictured = (within: DungeonLayout, cell: number) => {
    const look = lookAt(within, cell);
    return (part: number) => partPicture(part, look, climate);
  };
  const layKits = (mesh: MeshBuilder, within: DungeonLayout, kits: readonly KitPlacement[]) => {
    for (const { module, place, cell } of kits) {
      const piece = packs.get(styleAt(within, cell) ?? within.style)?.modules.get(module);
      if (piece) layModule(mesh, piece, place, pictured(within, cell));
    }
  };
  const lay = (mesh: MeshBuilder, plane: StoreyPlane | undefined = planes[0]) => {
    const storey = storeys[plane?.storey ?? 0];
    if (!storey) return;
    const within = storey.plane.layout;
    layKits(mesh, within, storey.placed);
    for (const { piece, place, cells: covered, solids } of storey.landmarks) {
      const cell = covered[0] ?? 0;
      if (piece) layModule(mesh, piece, place, pictured(within, cell));
      else {
        const look = lookAt(within, cell);
        for (const [west, north, east, south, top] of solids)
          box(mesh, [look.set, look.wall], [west, north, 0], [east, south, top]);
      }
    }
    if (storey.plane.storey === 0) layKits(raised(mesh, -storey.plane.floor), layout, joins.placed);
  };
  const whole = (list: readonly number[], numbers: ReadonlySet<number>) =>
    [...numbers].map((number) => list[number] ?? number);
  return {
    pillars: new Set(storeys.flatMap(({ plane, fitted }) => whole(plane.pillars, fitted.pillars))),
    torches: new Set(storeys.flatMap(({ plane, fitted }) => whole(plane.torches, fitted.torches))),
    portal: storeys.some(({ fitted }) => fitted.portal),
    flats: new Map(
      storeys.flatMap(({ plane, fitted }) =>
        [...fitted.flats].map(([key, spans]) => [key + plane.storey * cells * 4, spans] as const),
      ),
    ),
    floorless: new Set(
      storeys.flatMap(({ plane, landmarks }) =>
        landmarks.flatMap((landmark) =>
          landmark.piece ? landmark.cells.map((cell) => cell + plane.storey * cells) : [],
        ),
      ),
    ),
    arches: joins.arches,
    courses: joins.courses,
    rails: joins.rails,
    lay,
  };
}
