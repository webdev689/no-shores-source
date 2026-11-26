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
import { LIGHT_KINDS, type Light } from './dungeonLight.ts';
import { box, COLOUR, type Kitted, lookAt } from './dungeonMesh.ts';
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
 *  stands on; the lamp's and a dead lamp's `glow` lit, or the cell's stone while cold, and an open mouth's the daylight
 *  down its way on. A piece the pack lacks is left out. */
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
      const daylit = piece.kind === 'mouth' && state.openMouths.includes(piece.number);
      const pictureOf = (part: number) =>
        part === GLOW && daylit
          ? ([COLOUR.daylight, 0] as const)
          : partPicture(part === GLOW && !lit ? STONE : part, look, climate);
      layModule(mesh, facingModule(module, piece.facing), { origin: [x, y, z], turns: 0 }, pictureOf);
    }
  };
}

/** How far behind an open mouth's face its light stands, metres, and how high. */
const MOUTH_LIGHT = { back: 0.4, up: 1.5 } as const;
/** The lamp's flame in its cage, over its foot (metres), and how tall it burns; its light at the cage's middle. */
const LAMP_FLAME = { up: 2.97, sizeM: 0.3, lightUp: 3.2 } as const;
/** A dead lamp's flame in its small cage, hung from its crook out from its post along its facing, and how tall. */
const KINDLE_FLAME = { out: 0.17, up: 2.11, sizeM: 0.1, lightUp: 2.16 } as const;
/** The lamp lit, home's light: a lantern's, reaching across its room. */
const LAMP_LIT = { ...LIGHT_KINDS.lantern, colour: [1.8, 1.25, 0.65], reach: 13 } as const;

/** The lights a passage zone's pieces burn under ground as `state` finds them, numbered from 0 among their own: the
 *  lamp lit and each dead lamp lit burn as a lantern from a flame in their glass, and an open mouth shows its way on
 *  in daylight's pale light behind its face; cold and shut, none. */
export function passagePieceLights(pieces: readonly PassagePiece[], state: PieceState): Light[] {
  const lights: Light[] = [];
  const burn = (place: readonly [number, number, number], burning: Light['burning'], flames?: Light['flames']) =>
    lights.push({ at: place, number: lights.length, burning, ...(flames ? { flames } : {}) });
  for (const piece of pieces) {
    const [x, y, z] = piece.at;
    if (piece.kind === 'lamp' && state.lampLit)
      burn([x, y, z + LAMP_FLAME.lightUp], LAMP_LIT, [{ at: [x, y, z + LAMP_FLAME.up], sizeM: LAMP_FLAME.sizeM }]);
    if (piece.kind === 'kindle' && state.kindled.includes(piece.number)) {
      // The cage hangs off the crook, turned with the piece as its module is (`facingModule`).
      const [east, south] = [Math.cos(piece.facing) * KINDLE_FLAME.out, Math.sin(piece.facing) * KINDLE_FLAME.out];
      const flame = { at: [x + east, y + south, z + KINDLE_FLAME.up] as const, sizeM: KINDLE_FLAME.sizeM };
      burn([x + east, y + south, z + KINDLE_FLAME.lightUp], LIGHT_KINDS.lantern, [flame]);
    }
    if (piece.kind === 'mouth' && state.openMouths.includes(piece.number)) {
      // A door faces into the room, so its way on lies behind it.
      const [east, south] = [Math.sin(piece.facing), -Math.cos(piece.facing)];
      burn([x - east * MOUTH_LIGHT.back, y - south * MOUTH_LIGHT.back, z + MOUTH_LIGHT.up], LIGHT_KINDS.daylight);
    }
  }
  return lights;
}
