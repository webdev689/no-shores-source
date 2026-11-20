// What a dungeon wears past its code-built rooms: each style's kit pieces and its landmarks, laid from the style's
// pack into the dungeon's one mesh in the pictures of the cell each stands on. A landmark whose style has no pack
// stands as plain stone boxes of its solids, so nothing unseen stands in the way.
import type { MeshBuilder } from '../models/model.ts';
import type { Climate } from '../textures/climate.ts';
import { kitsOf } from './dungeonKits.ts';
import { placedLandmarks } from './dungeonLandmarks.ts';
import { type DungeonLayout, styleAt, type StyleKey } from './dungeonLayout.ts';
import { box, type Kitted, lookAt } from './dungeonMesh.ts';
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
 *  the piece lays, and the laying of every piece into a mesh. */
export type Dressing = Kitted & { readonly lay: (mesh: MeshBuilder) => void };

/** A dungeon's dressing from its styles' packs, on an island of `climate`. */
export function dressingOf(
  layout: DungeonLayout,
  packs: ReadonlyMap<StyleKey, ModulePack>,
  climate: Climate,
): Dressing {
  const { placed: kits, fitted } = kitsOf(layout, packs);
  const landmarks = placedLandmarks(layout).map((landmark) => ({
    ...landmark,
    piece: packs.get(landmark.style)?.modules.get(landmark.module) ?? null,
  }));
  const pictured = (cell: number) => {
    const look = lookAt(layout, cell);
    return (part: number) => partPicture(part, look, climate);
  };
  const lay = (mesh: MeshBuilder) => {
    for (const { module, place, cell } of kits) {
      const piece = packs.get(styleAt(layout, cell) ?? layout.style)?.modules.get(module);
      if (piece) layModule(mesh, piece, place, pictured(cell));
    }
    for (const { piece, place, cells, solids } of landmarks) {
      const cell = cells[0] ?? 0;
      if (piece) layModule(mesh, piece, place, pictured(cell));
      else {
        const look = lookAt(layout, cell);
        for (const [west, north, east, south, top] of solids)
          box(mesh, [look.set, look.wall], [west, north, 0], [east, south, top]);
      }
    }
  };
  return {
    ...fitted,
    floorless: new Set(landmarks.flatMap((landmark) => (landmark.piece ? landmark.cells : []))),
    lay,
  };
}
