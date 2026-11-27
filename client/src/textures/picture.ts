// The pictures the forged world wears, painted in code: every record of every archive its buildings, props and room
// kit name (and the climate and season turns of those), and the ground's twelve sets. A picture is the same bytes
// every time and in every engine: its seed is its archive and record.
import { catalogRecords, pictureSize } from './catalog.ts';
import { CLIMATES, SEASONS, climateArchive, setInfo } from './climate.ts';
import { finish } from './finish.ts';
import { sin } from './portableMath.ts';
import type { Materials } from './materials.ts';
import type { Job, PictureUse, RecipeContext } from './recipe.ts';
import { paintTerrain, TERRAIN_ARCHIVES } from './recipes/ground.ts';
import { paintPainting, paintRoom } from './recipes/rooms.ts';
import { glazedBox, paintThing } from './recipes/things.ts';
import { snowsOver } from './recipes/wallFamilies.ts';
import { paintsWall, paintWall, wallSeed, wallWindowBox, winterOver, type WindowBox } from './recipes/walls.ts';
import { SCALE, type Surface } from './surface.ts';

export { climateArchive, type Climate, type Season } from './climate.ts';
export { pictureSize } from './catalog.ts';
export type { PictureUse } from './recipe.ts';

/** A painted picture: RGBA, the top row first, every texel opaque; `glass` 1 a texel for a window's panes (top row
 *  first too), or null for a picture with no window. */
export interface Picture {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
  readonly glass: Uint8Array | null;
}

/** What each picture is named for, by `archive.record`. */
export type PictureUses = ReadonlyMap<string, ReadonlySet<PictureUse>>;

/** A picture's place in its archive and its size: [archive, record, width, height]. */
type Look = readonly number[];

/** The parts of the forged tables the uses are read from. */
export interface ForgedTables {
  readonly buildings: Readonly<
    Record<string, { walls: readonly Look[]; roofs: readonly Look[]; glass?: Look; doorLook?: Look }>
  >;
  readonly props: Readonly<Record<string, { looks: readonly Look[]; doorLook?: Look; bedding?: Look }>>;
  /** Each face is [side, ...], its seventh number the picture it wears; each slope's first number its picture. */
  readonly roomkit: Readonly<
    Record<
      string,
      { pictures: readonly Look[]; faces: readonly (readonly number[])[]; sloped?: readonly (readonly number[])[] }
    >
  >;
}

/** A room kit face's use by its side: four walls, the ceiling and the floor. */
const SIDE: readonly PictureUse[] = ['wall', 'wall', 'ceiling', 'floor', 'wall', 'wall'];
const TERRAIN_SET = 2;

/** Every picture the forged tables name, with the uses they name it for, carried to each climate's and season's
 *  turn of it. The ground's own sets are painted whole and need none. */
export function pictureUses(tables: ForgedTables): PictureUses {
  const named = new Map<string, Set<PictureUse>>();
  const note = (look: Look | undefined, use: PictureUse): void => {
    if (!look) return;
    const key = `${look[0]}.${look[1]}`;
    const uses = named.get(key) ?? new Set<PictureUse>();
    uses.add(use);
    named.set(key, uses);
  };
  for (const piece of Object.values(tables.props)) {
    for (const look of piece.looks) note(look, 'prop');
    note(piece.doorLook, 'door');
    note(piece.bedding, 'cloth');
  }
  for (const building of Object.values(tables.buildings)) {
    for (const look of building.walls) note(look, 'wall');
    for (const look of building.roofs) note(look, 'roof');
    note(building.glass, 'window');
    note(building.doorLook, 'door');
  }
  for (const piece of Object.values(tables.roomkit)) {
    for (const face of piece.faces) note(piece.pictures[face[6]], SIDE[face[0]]);
    for (const slope of piece.sloped ?? []) note(piece.pictures[slope[0]], 'slope');
  }
  // the plain boards some props wear that the tables do not list
  note([67, 0], 'prop');
  const wanted = new Map<string, Set<PictureUse>>();
  for (const [key, uses] of named) {
    const [archive, record] = key.split('.').map(Number);
    if (setInfo(archive).set === TERRAIN_SET) continue;
    for (const climate of CLIMATES)
      for (const season of SEASONS) {
        const turn = `${climateArchive(archive, record, climate, season)}.${record}`;
        const kept = wanted.get(turn) ?? new Set<PictureUse>();
        for (const use of uses) kept.add(use);
        wanted.set(turn, kept);
      }
  }
  return wanted;
}

/** Every archive the uses name that the catalog holds, the ground's sets aside, in order. */
export function pictureArchives(uses: PictureUses): number[] {
  const archives = new Set<number>();
  for (const key of uses.keys()) {
    const archive = Number(key.split('.')[0]);
    if (catalogRecords(archive)) archives.add(archive);
  }
  return [...archives].sort((a, b) => a - b);
}

const isRoofSet = (archive: number): boolean => archive < 500 && archive % 100 === 69;

/** A winter archive's summer one: the exterior set it is the snowed turn of, or null. */
export function summerOf(archive: number): number | null {
  const set = archive % 100;
  if (archive >= 500 || set === 2 || set === 3 || set === 4) return null;
  const summer = archive - 1;
  return setInfo(summer).winter && (snowsOver(summer) || isRoofSet(summer)) ? summer : null;
}

function recipeFor(ctx: RecipeContext): Job | ReturnType<typeof paintThing> {
  if (ctx.archive < 500 && ctx.archive % 100 === 48) return paintPainting(ctx);
  return paintWall(ctx) ?? paintRoom(ctx) ?? paintThing(ctx);
}

/**
 * The picture for `archive`'s `record`, frame `frame` (an animated record's frames differ only where it moves), or
 * null where nothing is painted: a record or frame the catalog does not hold, or an archive no recipe knows. `uses` say
 * what the record is named for, which chooses within an archive that holds many kinds.
 */
export function paintPicture(archive: number, record: number, frame: number, uses: PictureUses): Picture | null {
  const size = pictureSize(archive, record);
  if (!size || frame < 0 || frame >= size.frames) return null;
  if (TERRAIN_ARCHIVES.includes(archive)) return { ...paintTerrain(archive, record), glass: null };
  const summer = summerOf(archive);
  const own = summer ?? archive;
  const ctx: RecipeContext = {
    archive: own,
    record,
    frame,
    frames: size.frames,
    width: size.width,
    height: size.height,
    seed: wallSeed(own, record),
    uses: uses.get(`${archive}.${record}`) ?? uses.get(`${own}.${record}`) ?? new Set(),
  };
  const job = recipeFor(ctx);
  if (!job) return null;
  if (!('surf' in job)) return { ...job, glass: null };
  if (summer !== null) {
    if (isRoofSet(own)) blanket(job.surf, job.mats, ctx.seed);
    else winterOver(job.surf, job.mats, ctx.seed);
  }
  // a winter picture is finished as its summer one, so the two differ only where the snow lies
  const picture = finish(job.surf, job.mats, own, record, job.finish);
  return { ...picture, glass: job.window ? glassOf(job.surf, job.mats) : null };
}

/** Where a window picture's window stands in it, its frame round it, texels (left, top, right, bottom), as its recipe
 *  lays it: what a building lays as its window, without the wall painted round it. Null where none is laid. */
export function windowFrameOf(archive: number, record: number): WindowBox | null {
  const size = pictureSize(archive, record);
  if (!size) return null;
  const own = summerOf(archive) ?? archive;
  if (paintsWall(own)) return wallWindowBox(own, record, size.width, size.height);
  return size.height >= 96 ? glazedBox(size.width) : null;
}

/** A snowed roof: snow over nearly all of it, the roof showing through in the hollows where it lies thinnest. */
function blanket(surf: Surface, mats: Materials, seed: number): void {
  surf.each((x, y, i) => {
    const thin = sin((x + y * 0.3 + seed) * 0.7) * 0.5 + 0.5;
    if (thin < 0.85 || surf.relief[i] > 0) {
      surf.material[i] = mats.index.snow;
      surf.tone[i] = 0.72 + thin * 0.2;
    }
  });
}

/** The texels whose sub-texels are mostly glass (1 a pane), or null for a picture with none. */
function glassOf(surf: Surface, mats: Materials): Uint8Array | null {
  const glassy = new Set(
    Object.entries(mats.index)
      .filter(([name]) => name.startsWith('glass'))
      .map(([, index]) => index),
  );
  if (!glassy.size) return null;
  const out = new Uint8Array(surf.width * surf.height);
  let any = false;
  for (let y = 0; y < surf.height; y++)
    for (let x = 0; x < surf.width; x++) {
      let n = 0;
      for (let j = 0; j < SCALE; j++)
        for (let i = 0; i < SCALE; i++)
          if (glassy.has(surf.material[(y * SCALE + j) * surf.gridWidth + x * SCALE + i])) n++;
      if (n * 2 > SCALE * SCALE) {
        out[y * surf.width + x] = 1;
        any = true;
      }
    }
  return any ? out : null;
}
