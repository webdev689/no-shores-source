// The town's outer walls: every exterior set in its four climates, each a family written as a few words - its face,
// the frame it stands in, the stones at its corner, its bands, its window - and the records laid out as Daggerfall
// lays them: an edge (a corner, a brace, ivy), a plain wall, a weathered one, and the wall with the window. A winter
// set is its summer one with snow on every ledge.
import { planks } from '../boards.ts';
import { blockBand, pillar, quoins, reliefFace, timberFrame } from '../frames.ts';
import { fbm, hash01, stream } from '../noise.ts';
import { windowAt } from '../openings.ts';
import { marble, plaster, trowel } from '../plaster.ts';
import { materials, type Materials } from '../materials.ts';
import {
  familyMats,
  SPECIAL_FRAMES,
  SPECIAL_SETS,
  WALL_FAMILIES,
  type WallFamily,
  type WallWindow,
  type WindowKind,
} from './wallFamilies.ts';
import type { Job, RecipeContext } from '../recipe.ts';
import { blocks, fleck, herringbone, rubble } from '../stone.ts';
import { ellipse, Surface } from '../surface.ts';
import { cracks, drips, grime, ivy, moss } from '../weathering.ts';

/** The window's opening on a 64 x 128 wall, by kind: [left, top, right, bottom]. */
const OPENING: Readonly<Record<WindowKind, readonly number[]>> = {
  shutters: [19, 40, 45, 76],
  lattice: [8, 48, 56, 84],
  grid: [10, 46, 54, 82],
  arch: [8, 34, 56, 80],
  gothic: [18, 24, 46, 88],
  hole: [20, 44, 44, 72],
  slit: [24, 40, 40, 100],
  tall: [10, 6, 54, 96],
};

/** Paint a family's face over the whole picture. */
function paintFace(surf: Surface, mats: Materials, family: WallFamily, seed: number): void {
  const material = mats.index[family.material];
  const dim = mats.index[`${family.material}:dim`];
  const black = mats.index.black;
  switch (family.face) {
    case 'plaster':
      trowel(surf, { material, seed, cells: 9, cloud: 1.05, texel: 0.12, count: family.patches ? 4 : 8, wid: 2.2 });
      break;
    case 'stucco':
      plaster(surf, { material, seed, base: 0.66, amp: 0.1, pits: 0.7, pitSize: 1, bump: 0.4, fine: 0.04 });
      break;
    case 'adobe':
      plaster(surf, {
        material,
        seed,
        base: 0.55,
        amp: 0.16,
        rough: 0.6,
        patches: 0.1,
        pits: 0.15,
        bump: 0.6,
        fine: 0.05,
      });
      break;
    case 'rubble':
      blocks(surf, {
        material,
        mortar: black,
        rows: 10,
        widths: [12, 20],
        bond: 'random',
        gap: 1.6,
        bevel: 3,
        round: 3.5,
        rough: 1.2,
        dome: 0.9,
        seed,
        base: family.dark ? 0.4 : 0.5,
        toneVar: 0.12,
        amp: 0.25,
        mortarTone: 0.45,
        patch: 4,
        edge: 1.2,
      });
      fleck(surf, { from: material, to: dim, share: 0.2, size: 2, seed });
      break;
    case 'cobbles':
      rubble(surf, {
        material,
        mortar: black,
        across: 6,
        down: 10,
        dome: 1,
        gap: 1,
        seed,
        base: 0.6,
        toneVar: 0.12,
        mortarTone: 0.4,
        relief: 0.8,
        bevel: 2,
      });
      break;
    case 'blocks':
      blocks(surf, {
        material,
        mortar: mats.index.mortar,
        rows: family.small ? 16 : 8,
        widths: family.small ? [10, 16] : [22, 34],
        gap: 1,
        bevel: 1.5,
        seed,
        base: 0.45,
        toneVar: 0.2,
        amp: 0.5,
        rough: 0.4,
        relief: 0.9,
        mortarTone: 0.3,
        fine: 0.03,
      });
      break;
    case 'bricks':
      blocks(surf, {
        material,
        mortar: dim,
        rows: family.small ? 21 : 16,
        widths: family.small ? [7, 10] : [12, 16],
        gap: 1,
        bevel: 0.8,
        seed,
        base: 0.55,
        toneVar: 0.16,
        amp: 0.25,
        relief: 0.6,
        mortarTone: 0.25,
        fine: 0.04,
      });
      if (family.patchy)
        trowel(surf, {
          material,
          seed: seed + 1,
          count: 4,
          cloud: 0.6,
          mask: (x, y) => fbm(seed + 2, x, y, surf.width, surf.height, { cells: 3 }) > 0.58,
        });
      break;
    case 'herringbone':
      herringbone(surf, {
        material,
        mortar: material,
        rowHigh: 12,
        brickLen: 7,
        slant: 1,
        gap: 1.7,
        seed,
        base: 0.68,
        toneVar: 0.18,
        mortarTone: 0.08,
        edge: 1,
        amp: 0.15,
      });
      break;
    case 'planks':
      planks(surf, {
        material,
        dir: 'h',
        count: 11,
        seed,
        gapMaterial: material,
        gapTone: 0.3,
        base: 0.58,
        knots: 1,
        grain: 0.05,
        amp: 0.18,
        toneVar: 0.03,
        joints: 'few',
        crown: 0.4,
        edge: 0.5,
      });
      break;
    case 'vplanks':
      planks(surf, {
        material,
        dir: 'v',
        count: 6,
        seed,
        gapMaterial: black,
        gapTone: 0.3,
        base: 0.45,
        knots: 2,
        grain: 0.12,
        amp: 0.3,
        joints: 'few',
        crown: 0.3,
        edge: 0.6,
      });
      break;
    case 'marble':
      marble(surf, { material, veins: 0.3, seed, base: 0.5, amp: 0.25, sharp: 10 });
      break;
  }
}

/** A window's box in its picture, texels: left, top, right, bottom, its frame inside it. */
export type WindowBox = readonly [number, number, number, number];

/** The window a picture of a wall's family is painted with, and where it stands: none where it holds none (a special
 *  set's odd records, a family's walls but its third, a picture too short). */
function glazing(archive: number, record: number, width: number, height: number): [WallWindow, WindowBox] | null {
  const win: WallWindow | undefined = SPECIAL_SETS.includes(archive)
    ? record % 2 === 0 && height >= 96
      ? { kind: 'lattice', frame: 'iron', lead: 'iron' }
      : undefined
    : record === 3 && height >= 96 && width >= 64
      ? WALL_FAMILIES[archive]?.window
      : undefined;
  if (!win) return null;
  const [left, top, right, bottom] = OPENING[win.kind];
  const [scaleX, scaleY] = [width / 64, height / 128];
  const box: WindowBox = [
    Math.round(left * scaleX),
    Math.round(top * scaleY),
    Math.round(right * scaleX),
    Math.round(bottom * scaleY),
  ];
  return [win, box];
}

/** Where paintWall lays a picture's window, its frame round it; null where it lays none or paints no such wall. */
export function wallWindowBox(archive: number, record: number, width: number, height: number): WindowBox | null {
  return glazing(archive, record, width, height)?.[1] ?? null;
}

/** Whether paintWall paints an archive: a wall family's, or a city's special walls. */
export const paintsWall = (archive: number): boolean =>
  SPECIAL_SETS.includes(archive) || WALL_FAMILIES[archive] !== undefined;

/** The window of its kind in its opening, with shutters, a sill and leading. */
function paintWindow(surf: Surface, mats: Materials, win: WallWindow, box: WindowBox, seed: number): void {
  const iron = mats.index.iron;
  const frame = mats.index[win.frame] ?? iron;
  const lead = (win.lead === undefined ? undefined : mats.index[win.lead]) ?? iron;
  const glass = mats.index.glassDark;
  if (win.kind === 'hole' || win.kind === 'slit') {
    const frameTone = win.kind === 'hole' ? 0.5 : 0.55;
    const glassTone = win.kind === 'hole' ? 0.02 : 0.05;
    windowAt(surf, box[0], box[1], box[2], box[3], {
      kind: 'arch',
      frame,
      frameTone,
      glass,
      glassTone,
      frameW: 3,
      seed,
    });
    return;
  }
  // an arched or pointed window is leaded as a lattice is, only its head round or pointed
  const kind = win.kind === 'shutters' || win.kind === 'grid' ? 'grid' : 'lattice';
  windowAt(surf, box[0], box[1], box[2], box[3], {
    kind,
    head: win.kind === 'arch' ? 'round' : win.kind === 'gothic' ? 'pointed' : undefined,
    pitch: kind === 'grid' ? 13 : 11,
    leadW: 1.6,
    frame,
    frameTone: 0.55,
    glass,
    glassTone: 0.03,
    lead,
    leadTone: 0.6,
    frameW: 2,
    mullion: kind === 'lattice',
    shutters: win.shutters ? mats.index[win.shutters] : undefined,
    shutterW: 12,
    sill: win.sill ? mats.index[win.sill] : undefined,
    seed,
  });
}

/** The leaves that overgrow a swamp's walls: hanging fronds from the top and patches over the face. */
function overgrow(surf: Surface, mats: Materials, amount: number, seed: number): void {
  const leaves = mats.index.leafDark;
  drips(surf, { material: leaves, count: Math.round(amount * 90), len: 9, size: 2.2, seed });
  surf.each((x, y, i) => {
    if (
      fbm(seed + 3, x, y, surf.width, surf.height, { cells: 5, octaves: 3 }) > 1 - amount * 0.55 &&
      hash01(seed + 4, x, y) < 0.85
    ) {
      surf.material[i] = leaves;
      surf.tone[i] = 0.3 + hash01(seed + 5, x, y) * 0.45;
      surf.relief[i] += 1.2;
    }
  });
}

/** A summer wall's winter: snow along the top and on every ledge, icicles under the top. */
export function winterOver(surf: Surface, mats: Materials, seed: number): void {
  const snow = mats.index.snow ?? 0;
  surf.each((x, y, i) => {
    if (y < 3 + hash01(seed, x, 0) * 3) {
      surf.material[i] = snow;
      surf.tone[i] = 0.75 + hash01(seed + 1, x, y) * 0.2;
      surf.relief[i] += 1;
    }
  });
  // a ledge: a place standing proud of the one above it holds snow
  const ledges: number[] = [];
  surf.each((x, y, i) => {
    const above = surf.idx(x, y - 1);
    if (surf.relief[i] > surf.relief[above] + 0.8 && hash01(seed + 2, x, y) < 0.8) ledges.push(i);
  });
  for (const i of ledges) {
    surf.material[i] = snow;
    surf.tone[i] = 0.7 + hash01(seed + 3, i) * 0.25;
  }
  const rng = stream(seed + 4);
  for (let k = 0; k < 9; k++) {
    const x = rng.next() * surf.width;
    const len = 3 + rng.next() * 8;
    for (let step = 0; step < len; step++) {
      const i = surf.idx(x, 4 + step);
      surf.material[i] = mats.index.ice ?? snow;
      surf.tone[i] = 0.85 - step / len / 2;
    }
  }
}

/** Paint a wall record of an exterior set, or answer null for an archive with no family. */
export function paintWall(ctx: RecipeContext): Job | null {
  if (SPECIAL_SETS.includes(ctx.archive)) return paintSpecial(ctx);
  const family = WALL_FAMILIES[ctx.archive];
  if (!family) return null;
  const { width, height, record, seed } = ctx;
  const mats = familyMats(family);
  const index = mats.index;
  const surf = new Surface(width, height);
  const tall = height >= 96 && width >= 64;
  // the extra record a castle set keeps: a plain run of its second stone
  if (family.extra && record >= 4) {
    const face = family.extra.startsWith('brick') ? 'bricks' : 'blocks';
    paintFace(surf, mats, { ...family, material: family.extra, face, small: true }, seed);
    return { surf, mats, finish: { strength: 0.75 } };
  }
  if (family.fence && width >= 64 && height <= 32 && record >= 4) {
    planks(surf, {
      material: index[family.fence],
      dir: 'v',
      count: 8,
      seed,
      gapMaterial: index.black,
      gapTone: 0.2,
      base: 0.5,
      knots: 1,
      grain: 0.1,
      amp: 0.3,
      joints: false,
      crown: 0.4,
      edge: 0.6,
    });
    return { surf, mats, finish: { strength: 0.8 } };
  }
  paintFace(surf, mats, family, seed);
  dressWall(surf, mats, family, ctx, tall);
  const glazed = glazing(ctx.archive, record, width, height);
  if (glazed) paintWindow(surf, mats, glazed[0], glazed[1], seed);
  if (family.moss) moss(surf, { material: index.moss, below: 0, joints: 0.35, amount: family.moss, seed });
  if (family.vines) overgrow(surf, mats, family.vines, seed);
  grime(surf, { foot: 0.05, blot: 0.3, seed });
  return { surf, mats, finish: { strength: 0.75 }, window: glazed !== null };
}

/** What stands on a wall's face: panels, pillars, posts and frame, bands, the edge record's corner, ivy, a carved
 *  face, beam ends and cracks. */
function dressWall(surf: Surface, mats: Materials, family: WallFamily, ctx: RecipeContext, tall: boolean): void {
  const { height, record, seed } = ctx;
  const index = mats.index;
  if (family.panels && tall)
    planks(
      surf,
      {
        material: index[family.panels],
        dir: 'v',
        count: 3,
        seed: seed + 1,
        gapMaterial: index.black,
        base: 0.5,
        grain: 0.1,
        amp: 0.25,
        joints: false,
        crown: 0.3,
      },
      { x0: 10, y0: 10, x1: 54, y1: 76 },
    );
  if (family.pillars && tall) {
    pillar(surf, 0, 6, { material: index[family.pillars], base: 0.5 });
    pillar(surf, 58, 64, { material: index[family.pillars], base: 0.5 });
  }
  if (family.posts && tall)
    timberFrame(surf, { material: index[family.posts], base: 0.45, posts: [0], rails: [], w: 7 });
  if (family.frame && tall)
    timberFrame(surf, {
      material: index[family.frame],
      base: 0.4,
      posts: [0],
      rails: [2, 45, 89, 126],
      braces: family.brace && record === 0 ? [[4, 50, 58, 126, -0.55]] : [],
      w: 7,
    });
  const bandStones = { widths: [12, 16] as const, gap: 1, base: 0.55, edge: 1, amp: 0.15 };
  if (family.top && tall)
    blockBand(surf, 0, 6, {
      ...bandStones,
      material: index[family.top],
      mortar: index[`${family.material}:dim`],
      seed,
    });
  if (family.foot && tall)
    blockBand(surf, height - 6, height, {
      ...bandStones,
      material: index[family.foot],
      mortar: index.mortar,
      seed: seed + 1,
      base: 0.5,
      lift: 1,
    });
  if (record === 0 && tall) {
    if (family.quoin)
      quoins(surf, { material: index[family.quoin], mortar: index.mortar, w: 18, tall: 16, base: 0.55 });
    if (family.strip)
      blocks(
        surf,
        {
          material: index[family.strip],
          mortar: index.mortar,
          rows: Math.round(height / 6),
          widths: [8, 14],
          gap: 1,
          bevel: 0.8,
          seed: seed + 2,
          base: 0.55,
          toneVar: 0.15,
          relief: 0.8,
          mortarTone: 0.3,
        },
        { x0: 0, y0: 0, x1: 8, y1: height },
      );
    if (family.ivy === 'edge') wallIvy(surf, mats, 9, height - 8, 0.4, 4.6, seed);
  }
  if (record === 2 && family.ivy === 'third' && tall) wallIvy(surf, mats, 30, 50, 0.3, 3.4, seed);
  if (record === 1 && family.relief && tall)
    reliefFace(surf, 18, 10, 46, 40, { material: index[family.material], kind: family.relief, base: 0.5 });
  // the ends of the roof's beams, round and dark, along the top of an adobe wall
  if (family.pegs && tall) {
    const material = index[family.pegs];
    for (const x of [10, 26, 42, 58])
      ellipse(x, 5, 3, 3, (placeX, placeY, relU, relV) =>
        surf.put(placeX, placeY, { material, tone: 0.55 - (relU + relV) * 0.15, bump: 1.5 }),
      );
  }
  if ((record === 2 || record === 0) && family.cracked) cracks(surf, { count: 3, seed });
}

/** Two stems of ivy from the foot at `x`. */
function wallIvy(
  surf: Surface,
  mats: Materials,
  x: number,
  reach: number,
  leaves: number,
  leafSize: number,
  seed: number,
): void {
  ivy(surf, {
    material: mats.index.leafDark,
    stemMaterial: mats.index.bark,
    x,
    stems: 2,
    spread: 4,
    reach,
    leaves,
    leafSize,
    fan: 10,
    seed,
  });
}

/** A city's special walls: a painted timber frame (red, green or blue) round plaster panels, a window in some. */
function paintSpecial(ctx: RecipeContext): Job {
  const { width, height, record, seed } = ctx;
  const mats = materials([
    'plaster',
    'sandstone',
    'glassDark',
    'iron',
    'black',
    'brickTan',
    'snow',
    'ice',
    ...SPECIAL_FRAMES,
  ]);
  const surf = new Surface(width, height);
  trowel(surf, { material: mats.index.sandstone, seed, cells: 9, cloud: 1.05, texel: 0.12, count: 6, wid: 2.2 });
  const paint = mats.index[SPECIAL_FRAMES[record % SPECIAL_FRAMES.length]];
  const rails = height >= 96 ? [2, 45, 89, 126] : [2, height / 2, height - 2];
  timberFrame(surf, {
    material: paint,
    base: 0.5,
    posts: [0, width / 2],
    rails,
    braces: record % 2 ? [[4, 50, width - 6, height - 2, -0.4]] : [],
    w: 7,
  });
  const glazed = glazing(ctx.archive, record, width, height);
  if (glazed) paintWindow(surf, mats, glazed[0], glazed[1], seed);
  return { surf, mats, finish: { strength: 0.75 }, window: glazed !== null };
}

/** A record's seed: its archive and record, so every client paints the same wall. An animated record's frames share
 *  it, so only the part that moves reads its frame. */
export const wallSeed = (archive: number, record: number): number => archive * 131 + record * 17 + 1;
