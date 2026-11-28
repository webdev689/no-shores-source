// What a dungeon wears past its code-built rooms: each style's kit pieces and its landmarks, laid from the style's
// pack into the dungeon's one mesh in the pictures of the cell each stands on. A landmark whose style has no pack
// stands as plain stone boxes of its solids, so nothing unseen stands in the way. A passage zone's own pieces come
// from the passages' pack, laid as the deal stands for the player into a mesh of their own.
import type { MeshBuilder } from '../models/model.ts';
import type { Climate } from '../textures/climate.ts';
import { besideCell, type Rect } from './dungeonCells.ts';
import { joinedOn } from './dungeonJoins.ts';
import { type KitPlacement, kitsOf } from './dungeonKits.ts';
import { placedLandmarks } from './dungeonLandmarks.ts';
import { type DungeonLayout, ROCK, STAIR, styleAt, type StyleKey, VOID } from './dungeonLayout.ts';
import { LIGHT_KINDS, type Light } from './dungeonLight.ts';
import { box, COLOUR, type Kitted, lookAt } from './dungeonMesh.ts';
import { layModule, loadStylePack, type ModuleMesh, type ModulePack, PARTS, partPicture } from './dungeonModules.ts';
import { storeyKits } from './dungeonStoreyKits.ts';
import { raised, type StoreyPlane, storeyPlanes } from './dungeonStoreyPlanes.ts';
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
 *  the piece lays, and the laying of each storey's pieces into a mesh raised to its floor (the top storey's, unless
 *  named), the pieces that join the storeys with the top storey's. */
export type Dressing = Kitted & { readonly lay: (mesh: MeshBuilder, plane?: StoreyPlane) => void };

/** The props' plans a storey's kits keep clear of: one list for every storey, or each storey's own. */
export type PropPlans = readonly Rect[] | ((plane: StoreyPlane) => readonly Rect[]);

/** Each storey's kit pieces, as the dressing lays them: on its plane as the kits read it (`kitPlane`, its `read`),
 *  clear of its props' plans, none on a flight's cell, open air's or a cell opened to them; and the mesh's own pieces
 *  they stand in place of. */
export function planeKits(layout: DungeonLayout, packs: ReadonlyMap<StyleKey, ModulePack>, props: PropPlans) {
  const joined = joinedOn(layout);
  return storeyPlanes(layout).map((plane) => {
    const { opened, landings } = joined(plane.storey);
    const busy = plane.layout.cells.flatMap((kind, cell) =>
      kind === STAIR || kind === VOID || opened.has(cell) ? [cell] : [],
    );
    const plans = typeof props === 'function' ? props(plane) : props;
    const read = kitPlane(plane.layout, landings);
    return { plane, read, ...kitsOf(read, packs, plans, { exit: plane.exit, portal: plane.portal, busy }) };
  });
}

/** A storey's plane as its kits read it: a flight's cells as rock, but the one each landing (`cell * 4 + side`,
 *  `Joined.landings`) opens onto, so a wall facing a flight from past its foot or before its head is dressed. */
export function kitPlane(layout: DungeonLayout, landings: ReadonlySet<number>): DungeonLayout {
  const ends = new Set([...landings].map((code) => besideCell(layout, Math.floor(code / 4), code % 4)));
  return { ...layout, cells: layout.cells.map((kind, cell) => (kind === STAIR && !ends.has(cell) ? ROCK : kind)) };
}

/** A dungeon's dressing from its styles' packs, on an island of `climate`, its kits clear of its props' plans. */
export function dressingOf(
  layout: DungeonLayout,
  packs: ReadonlyMap<StyleKey, ModulePack>,
  climate: Climate,
  props: PropPlans,
): Dressing {
  const cells = layout.columns * layout.rows;
  const storeys = planeKits(layout, packs, props).map(({ plane, placed, fitted }) => {
    const landmarks = placedLandmarks(plane.layout).map((landmark) => ({
      ...landmark,
      piece: packs.get(landmark.style)?.modules.get(landmark.module) ?? null,
    }));
    return { plane, placed, fitted, landmarks };
  });
  const planes = storeys.map((storey) => storey.plane);
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
/** The lamp's light at its cage's middle, over its foot (metres). */
const LAMP_LIGHT_UP = 3.2;
/** A dead lamp's light at its small cage's middle, hung from its crook out from its post along its facing. */
const KINDLE_LIGHT = { out: 0.17, up: 2.16 } as const;
/** The lamp lit, home's light: a lantern's, reaching across its room. */
const LAMP_LIT = { ...LIGHT_KINDS.lantern, colour: [1.8, 1.25, 0.65], reach: 13 } as const;

/** The lights a passage zone's pieces burn under ground as `state` finds them, numbered from 0 among their own: the
 *  lamp lit and each dead lamp lit burn as a lantern, their caged glass glowing with no flame seen, and an open mouth
 *  shows its way on in daylight's pale light behind its face; cold and shut, none. */
export function passagePieceLights(pieces: readonly PassagePiece[], state: PieceState): Light[] {
  const lights: Light[] = [];
  const burn = (place: readonly [number, number, number], burning: Light['burning']) =>
    lights.push({ at: place, number: lights.length, burning });
  for (const piece of pieces) {
    const [x, y, z] = piece.at;
    if (piece.kind === 'lamp' && state.lampLit) burn([x, y, z + LAMP_LIGHT_UP], LAMP_LIT);
    if (piece.kind === 'kindle' && state.kindled.includes(piece.number)) {
      // The cage hangs off the crook, turned with the piece as its module is (`facingModule`).
      const [east, south] = [Math.cos(piece.facing) * KINDLE_LIGHT.out, Math.sin(piece.facing) * KINDLE_LIGHT.out];
      burn([x + east, y + south, z + KINDLE_LIGHT.up], LIGHT_KINDS.lantern);
    }
    if (piece.kind === 'mouth' && state.openMouths.includes(piece.number)) {
      // A door faces into the room, so its way on lies behind it.
      const [east, south] = [Math.sin(piece.facing), -Math.cos(piece.facing)];
      burn([x - east * MOUTH_LIGHT.back, y - south * MOUTH_LIGHT.back, z + MOUTH_LIGHT.up], LIGHT_KINDS.daylight);
    }
  }
  return lights;
}
