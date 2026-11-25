// What a dungeon wears past its code-built rooms: each style's kit pieces and its landmarks, laid from the style's
// pack into the dungeon's one mesh in the pictures of the cell each stands on. A landmark whose style has no pack
// stands as plain stone boxes of its solids, so nothing unseen stands in the way. A passage zone's own pieces come
// from the passages' pack, laid as the deal stands for the player into a mesh of their own.
import type { MeshBuilder } from '../models/model.ts';
import type { Climate } from '../textures/climate.ts';
import type { Rect } from './dungeonCells.ts';
import { kitsOf } from './dungeonKits.ts';
import { placedLandmarks } from './dungeonLandmarks.ts';
import { type DungeonLayout, styleAt, type StyleKey } from './dungeonLayout.ts';
import { box, type Kitted, lookAt } from './dungeonMesh.ts';
import { layModule, loadStylePack, type ModuleMesh, type ModulePack, PARTS, partPicture } from './dungeonModules.ts';
import type { PassagePiece } from '../rules/passageRules.ts';
import { pieceModule, type PieceState } from './passages/passagePieces.ts';

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

/** A dungeon's dressing from its styles' packs, on an island of `climate`, its kits clear of its props' plans. */
export function dressingOf(
  layout: DungeonLayout,
  packs: ReadonlyMap<StyleKey, ModulePack>,
  climate: Climate,
  props: readonly Rect[],
): Dressing {
  const { placed: kits, fitted } = kitsOf(layout, packs, props);
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

/** A piece turned to `facing` (clockwise from north, x east and y south) about its foot, normals with it. */
function facingModule(module: ModuleMesh, facing: number): ModuleMesh {
  const [sine, cosine] = [Math.sin(facing), Math.cos(facing)];
  const turned = (from: Float32Array) => {
    const to = from.slice();
    for (let vertex = 0; vertex < from.length / 3; vertex++) {
      const [x, y] = [from[vertex * 3], from[vertex * 3 + 1]];
      to[vertex * 3] = x * cosine - y * sine;
      to[vertex * 3 + 1] = x * sine + y * cosine;
    }
    return to;
  };
  return { ...module, positions: turned(module.positions), normals: turned(module.normals) };
}

const GLOW = PARTS.indexOf('glow');
const STONE = PARTS.indexOf('stone');

/** A passage zone's pieces from the passages' pack, each the module the deal stands it as for the player
 *  (`pieceModule`, `done` whether the deal is done), at its foot turned to its facing, in the pictures of the cell it
 *  stands on; the lamp's and a dead lamp's `glow` lit, or the cell's stone while cold. A piece the pack lacks is left
 *  out. */
export function passagePiecesLaid(
  layout: DungeonLayout,
  pack: ModulePack,
  climate: Climate,
  pieces: readonly PassagePiece[],
  state: PieceState,
  done: boolean,
): (mesh: MeshBuilder) => void {
  return (mesh) => {
    for (const piece of pieces) {
      const module = pack.modules.get(pieceModule(piece, state, done) ?? '');
      if (!module) continue;
      const [x, y, z] = piece.at;
      const column = Math.min(layout.columns - 1, Math.max(0, Math.floor(x / layout.cell)));
      const row = Math.min(layout.rows - 1, Math.max(0, Math.floor(y / layout.cell)));
      const look = lookAt(layout, row * layout.columns + column);
      const lit =
        piece.kind === 'lamp' ? state.lampLit : piece.kind === 'kindle' && state.kindled.includes(piece.number);
      const pictureOf = (part: number) => partPicture(part === GLOW && !lit ? STONE : part, look, climate);
      layModule(mesh, facingModule(module, piece.facing), { origin: [x, y, z], turns: 0 }, pictureOf);
    }
  };
}
