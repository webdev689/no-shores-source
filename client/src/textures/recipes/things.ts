// Everything else the forged world wears: the solid colours, the roofs and doors of every climate, the dungeons'
// five sets and their dressing, and the archives that stand alone - tapestries, signs, hedges, ships, gravestones,
// furniture, the special places' walls. Each is painted by its kind and, where an archive holds many kinds, by the
// use the forged world names its record for.
import { barrelTiles, planks, shingles, straw } from '../boards.ts';
import { grass } from '../earth.ts';
import { frame, runes, shelves } from '../frames.ts';
import { fbm, hash01, stream } from '../noise.ts';
import { door, strap, windowAt, type DoorOptions } from '../openings.ts';
import { PALETTE_RGB } from '../palette.ts';
import type { Materials } from '../materials.ts';
import type { Job, RecipeContext } from '../recipe.ts';
import type { Rendered } from '../render.ts';
import { blocks, crag, mottle } from '../stone.ts';
import { Surface } from '../surface.ts';
import { cracks, grime } from '../weathering.ts';
import { paintDungeon } from './dungeons.ts';
import { paintDungeonRock } from './dungeonRock.ts';
import { paintDressing } from './dressing.ts';
import { paintSurfaceKind } from './rooms.ts';
import { kitMats } from './thingMats.ts';

type RoofKind = 'tiles' | 'shingles' | 'straw' | 'sod' | 'slate';

/** Each climate's roofs, record by record: a kind and its material. */
const ROOFS: Readonly<Record<number, readonly (readonly [RoofKind, string])[]>> = {
  69: [
    ['tiles', 'dirtDark'],
    ['tiles', 'dirt'],
    ['shingles', 'sandstone'],
    ['straw', 'thatch'],
  ],
  169: [
    ['straw', 'thatch'],
    ['sod', 'grass'],
    ['tiles', 'roofTile'],
    ['shingles', 'shingle'],
  ],
  369: [
    ['straw', 'thatch'],
    ['sod', 'grass'],
    ['tiles', 'roofTile'],
    ['shingles', 'shingle'],
  ],
  469: [
    ['sod', 'grassSwamp'],
    ['straw', 'thatch'],
    ['slate', 'slate'],
    ['shingles', 'shingle'],
  ],
};

/** Each climate's doors, record by record. */
const DOORS: Readonly<Record<number, readonly (readonly [DoorOptions['kind'], string])[]>> = {
  74: [
    ['strapped', 'woodPale'],
    ['xbrace', 'woodPale'],
    ['grille', 'woodPale'],
    ['clad', 'woodPale'],
  ],
  174: [
    ['strapped', 'woodDark'],
    ['plank', 'woodDark'],
    ['grille', 'woodDark'],
    ['iron', 'woodDark'],
  ],
  374: [
    ['zbrace', 'wood'],
    ['plank', 'wood'],
    ['grille', 'wood'],
    ['strapped', 'wood'],
  ],
  474: [
    ['xbrace', 'woodGrey'],
    ['plank', 'woodGrey'],
    ['strapped', 'woodGrey'],
    ['grille', 'woodGrey'],
  ],
};

type LoneKind =
  | 'building'
  | 'leaves'
  | 'stone'
  | 'ship'
  | 'cloth'
  | 'boards'
  | 'shelves'
  | 'grave'
  | 'books'
  | 'hearth'
  | 'furniture'
  | 'iron'
  | 'arch'
  | 'sign';

/** The archives that stand alone: their kind and material (the uses a record is named for choose within it). */
// prettier-ignore
const LONE: Readonly<Record<number, readonly [LoneKind, string]>> = {
  6: ['building', 'sandstone'],
  33: ['leaves', 'leafDark'],
  46: ['stone', 'sandstone'],
  50: ['ship', 'wood'],
  56: ['building', 'stoneDark'],
  57: ['cloth', 'clothRed'],
  67: ['boards', 'wood'],
  71: ['shelves', 'wood'],
  72: ['shelves', 'woodDark'],
  73: ['grave', 'stone'],
  81: ['books', 'woodDark'],
  85: ['stone', 'stone'],
  86: ['stone', 'stoneDark'],
  87: ['hearth', 'stone'],
  88: ['boards', 'woodPale'],
  89: ['leaves', 'leaf'],
  90: ['furniture', 'wood'],
  92: ['furniture', 'woodDark'],
  93: ['iron', 'iron'],
  121: ['arch', 'stone'],
  131: ['building', 'stone'],
  132: ['building', 'stoneBlue'],
  133: ['building', 'stoneDark'],
  146: ['arch', 'stone'],
  149: ['building', 'stoneDark'],
  151: ['building', 'wood'],
  154: ['building', 'stoneGreen'],
  156: ['building', 'stoneDark'],
  167: ['arch', 'sandstone'],
  171: ['boards', 'wood'],
  172: ['boards', 'woodGrey'],
  321: ['arch', 'stone'],
  331: ['building', 'stoneDark'],
  333: ['sign', 'wood'],
  349: ['building', 'stoneBlue'],
  351: ['building', 'stone'],
};

/** A solid colour: archive 0's record is that palette index, archive 1's the index past 128. */
function paintSolid(ctx: RecipeContext): Rendered {
  const index = (ctx.archive === 1 ? 128 : 0) + ctx.record;
  const rgba = new Uint8Array(ctx.width * ctx.height * 4);
  for (let i = 0; i < ctx.width * ctx.height; i++) {
    rgba[i * 4] = PALETTE_RGB[index * 3];
    rgba[i * 4 + 1] = PALETTE_RGB[index * 3 + 1];
    rgba[i * 4 + 2] = PALETTE_RGB[index * 3 + 2];
    rgba[i * 4 + 3] = 255;
  }
  return { width: ctx.width, height: ctx.height, rgba };
}

/** A roof of `kind` in `material`. */
function paintRoof(surf: Surface, mats: Materials, kind: RoofKind, materialName: string, seed: number): void {
  const material = mats.index[materialName];
  if (kind === 'straw') straw(surf, { material, seed, strands: 28, rows: 3, course: 21, seam: 0.25 });
  else if (kind === 'tiles')
    barrelTiles(surf, {
      material,
      gapMaterial: mats.index.black,
      rows: 4,
      cols: 5,
      base: 0.55,
      relief: 6,
      lobe: 0.3,
      seed,
    });
  else if (kind === 'shingles') straw(surf, { material, seed, strands: 14, rows: 6, course: 16, seam: 0.7, amp: 0.6 });
  else if (kind === 'slate')
    shingles(surf, { material, rows: 5, perRow: 5, round: 0.2, relief: 2, base: 0.5, shadow: 0.6, amp: 0.12, seed });
  else {
    mottle(surf, { material, base: 0.5, amp: 0.25, cells: 4, fine: 0.15, seed });
    grass(surf, { material, seed: seed + 1, density: 2.5, lean: [-0.3, 0.3], dark: 0.25, light: 0.15 });
  }
}

/** A wall of a special place or a lone archive: stone or boards, a door or a window where its use says. Answers
 *  whether it painted a window. */
function paintBuilding(surf: Surface, mats: Materials, materialName: string, ctx: RecipeContext): boolean {
  const { width, height, seed, uses } = ctx;
  const index = mats.index;
  if (materialName.startsWith('wood'))
    planks(surf, {
      material: index[materialName],
      dir: 'h',
      count: Math.max(3, Math.round(height / 11)),
      seed,
      gapMaterial: index[`${materialName}:dim`],
      gapTone: 0.3,
      base: 0.55,
      knots: 1,
      grain: 0.06,
      amp: 0.2,
      joints: 'few',
      crown: 0.4,
    });
  else
    blocks(surf, {
      material: index[materialName],
      mortar: index.mortar,
      rows: Math.max(2, Math.round(height / 16)),
      widths: [20, 32],
      gap: 1,
      bevel: 1.5,
      seed,
      base: 0.48,
      toneVar: 0.2,
      amp: 0.4,
      relief: 0.9,
      mortarTone: 0.3,
    });
  const doorway = uses.has('door') && height >= 96 && !uses.has('wall');
  if (doorway)
    door(surf, 6, 8, width - 6, height, { kind: 'strapped', wood: index.woodDark, metal: index.iron, boards: 4, seed });
  const glazed = !doorway && glazeWhereNamed(surf, mats, ctx);
  grime(surf, { foot: 0.05, blot: 0.3, seed });
  return glazed;
}

/** A leaded window in a wall the forged world names a window, tall enough to hold one. Answers whether it painted
 *  one. */
function glazeWhereNamed(surf: Surface, mats: Materials, ctx: RecipeContext): boolean {
  if (!ctx.uses.has('window') || ctx.height < 96) return false;
  const index = mats.index;
  windowAt(surf, 14, 36, ctx.width - 14, 80, {
    kind: 'lattice',
    pitch: 11,
    frame: index.iron,
    glass: index.glassDark,
    glassTone: 0.03,
    lead: index.iron,
    leadTone: 0.6,
    frameW: 2,
    seed: ctx.seed,
  });
  return true;
}

/** Cloth: a woven ground with a border and a motif, a tapestry's or a bed's. */
function paintCloth(surf: Surface, mats: Materials, materialName: string, seed: number): void {
  const index = mats.index;
  const rng = stream(seed);
  const accent = [index.gold, index.clothYellow, index.clothBlue, index.clothGreen][Math.floor(rng.next() * 4)];
  surf.each((x, y, i) => {
    const weave = ((Math.floor(x) + Math.floor(y)) & 1) * 0.05 + (hash01(seed, x, y) - 0.5) * 0.08;
    surf.material[i] = index[materialName];
    surf.tone[i] = 0.5 + weave + (fbm(seed + 1, x, y, surf.width, surf.height, { cells: 3 }) - 0.5) * 0.2;
    surf.relief[i] = weave * 4;
  });
  const edge = Math.max(2, Math.round(Math.min(surf.width, surf.height) / 10));
  surf.each((x, y, i) => {
    const inEdge = x < edge || y < edge || x >= surf.width - edge || y >= surf.height - edge;
    const midX = surf.width / 2;
    const midY = surf.height / 2;
    const motif =
      Math.abs(Math.abs(x + 0.5 - midX) + Math.abs(y + 0.5 - midY) - Math.min(surf.width, surf.height) * 0.25) < 1.5;
    if (inEdge || motif) {
      surf.material[i] = accent;
      surf.tone[i] = 0.55 + hash01(seed + 2, x, y) * 0.15;
    }
  });
}

/** Paint a thing: a job to finish, a finished solid colour, or null for an archive it does not know. */
export function paintThing(ctx: RecipeContext): Job | Rendered | null {
  const { archive, record, width, height, seed } = ctx;
  if (archive === 0 || archive === 1) return paintSolid(ctx);
  const set = archive % 100;
  if (archive < 500 && (set === 22 || set === 23 || set === 24)) return paintDungeon(ctx);
  if (archive < 500 && (set === 19 || set === 20)) return paintDungeonRock(ctx);
  if (archive >= 1000 && set === 21) return paintDressing(ctx);
  const roof = ROOFS[archive]?.[record % 4];
  if (roof) {
    const mats = kitMats(roof[1]);
    const surf = new Surface(width, height);
    paintRoof(surf, mats, roof[0], roof[1], seed);
    return { surf, mats, finish: { strength: 0.8 } };
  }
  const doorKind = DOORS[archive]?.[record % 4];
  if (doorKind) {
    const [kind, wood] = doorKind;
    const mats = kitMats(wood, 'woodGrey');
    const index = mats.index;
    const surf = new Surface(width, height);
    door(surf, 0, 0, width, height, {
      kind,
      wood: index[wood],
      metal: kind === 'clad' ? index.rust : index.iron,
      frameMetal: index.iron,
      boards: 4,
      dark: index.glassDark,
      seed,
    });
    frame(surf, 4, { material: index[wood], base: 0.45 });
    return { surf, mats, finish: { strength: 0.85 } };
  }
  const lone = LONE[archive];
  if (!lone) return null;
  const mats = kitMats(lone[1], 'woodGrey', 'stoneBlue', 'stoneGreen', 'sandstone');
  const surf = new Surface(width, height);
  const window = paintLone(surf, mats, lone[0], lone[1], ctx);
  return { surf, mats, finish: { strength: 0.75 }, window };
}

/** An archive that stands alone, by its kind; a record named for a floor, a ceiling or a roof is painted as one,
 *  whatever its archive. Answers whether it painted a window. */
function paintLone(surf: Surface, mats: Materials, kind: LoneKind, materialName: string, ctx: RecipeContext): boolean {
  const { record, width, height, seed, uses } = ctx;
  const index = mats.index;
  const material = index[materialName];
  const wooden = materialName.startsWith('wood');
  if (uses.has('floor') && !uses.has('wall'))
    paintSurfaceKind(surf, mats, wooden ? 'planks' : 'blocks', materialName, seed);
  else if (uses.has('ceiling') && !uses.has('wall'))
    paintSurfaceKind(surf, mats, 'panel', wooden ? materialName : 'woodDark', seed);
  else if (uses.has('roof') && !uses.has('wall')) paintRoof(surf, mats, 'shingles', 'woodDark', seed);
  else if (uses.has('cloth') || kind === 'cloth')
    paintCloth(surf, mats, kind === 'cloth' ? [materialName, 'clothBlue', 'clothGreen'][record % 3] : 'clothRed', seed);
  else if (kind === 'leaves') {
    mottle(surf, { material, base: 0.45, amp: 0.3, cells: 8, fine: 0.2, texel: 0.25, bump: 1.5, seed });
    crag(surf, {
      material,
      seed,
      cells: 6,
      rows: 6,
      sharp: 4,
      amp: 0.4,
      cloud: 0.2,
      relief: 1.5,
      mask: (x, y) => hash01(seed, x, y) < 0.5,
    });
  } else if (kind === 'boards' || kind === 'ship' || kind === 'furniture') {
    planks(surf, {
      material,
      dir: width >= height ? 'h' : 'v',
      count: Math.max(2, Math.round(Math.max(width, height) / 12)),
      seed,
      gapMaterial: index[`${materialName}:dim`],
      gapTone: 0.25,
      base: 0.55,
      knots: 1,
      grain: 0.1,
      amp: 0.25,
      joints: 'few',
      crown: 0.3,
      edge: 0.5,
    });
    return glazeWhereNamed(surf, mats, ctx);
  } else if (kind === 'shelves' || kind === 'books') {
    planks(surf, {
      material,
      dir: 'v',
      count: 3,
      seed,
      gapMaterial: index.black,
      base: 0.45,
      grain: 0.1,
      amp: 0.2,
      joints: false,
    });
    shelves(surf, 4, 4, width - 4, height - 4, {
      rows: Math.max(1, Math.round(height / 24)),
      back: index.black,
      wood: material,
      goods: kind === 'books' ? ['books', 'books', 'books'] : ['jar', 'books', 'bottle', 'sack'],
      spines: [index.clothRed, index.clothBlue, index.clothGreen, index.parchment],
      vessels: [index.clothRed, index.glassBlue, index.gold],
    });
  } else if (kind === 'grave') {
    blocks(surf, {
      material,
      mortar: index.mortar,
      rows: 1,
      widths: [64, 64],
      gap: 0,
      bevel: 2,
      seed,
      base: 0.5,
      toneVar: 0.1,
      amp: 0.4,
      relief: 1,
    });
    runes(surf, Math.round(width * 0.2), Math.round(height * 0.3), Math.round(width * 0.8), Math.round(height * 0.45), {
      material,
      seed,
    });
    cracks(surf, { count: 2, seed });
  } else if (kind === 'sign') {
    planks(surf, {
      material,
      dir: 'h',
      count: 2,
      seed,
      gapMaterial: index.black,
      base: 0.55,
      grain: 0.1,
      amp: 0.25,
      joints: false,
    });
    frame(surf, 2, { material: index.woodDark, base: 0.4 });
    const paint = [index.gold, index.clothRed, index.clothBlue, index.parchment][Math.floor(stream(seed).next() * 4)];
    runes(
      surf,
      Math.round(width * 0.25),
      Math.round(height * 0.3),
      Math.round(width * 0.75),
      Math.round(height * 0.7),
      { material: paint, seed },
    );
  } else if (kind === 'hearth') {
    blocks(surf, {
      material,
      mortar: index.mortar,
      rows: Math.max(2, Math.round(height / 10)),
      widths: [12, 18],
      gap: 1,
      bevel: 1,
      seed,
      base: 0.5,
      toneVar: 0.18,
      relief: 0.8,
    });
    // an animated hearth: only the fire reads the frame, so the stone round it stays still
    if (ctx.frames > 1)
      surf.each((x, y, i) => {
        if (y > height * 0.35 && Math.abs(x - width / 2) < width * 0.3) {
          surf.material[i] = index.fire;
          surf.tone[i] = 0.4 + hash01(seed + ctx.frame, x, y) * 0.6;
        }
      });
  } else if (kind === 'iron') {
    mottle(surf, { material: index.iron, base: 0.45, amp: 0.2, cells: 5, fine: 0.1, seed });
    for (const y of [Math.round(height * 0.25), Math.round(height * 0.75)]) strap(surf, 0, width, y, index.iron);
  } else if (kind === 'arch' || kind === 'building') return paintBuilding(surf, mats, materialName, ctx);
  else
    blocks(surf, {
      material,
      mortar: index.mortar,
      rows: Math.max(2, Math.round(height / 16)),
      widths: [18, 28],
      gap: 1,
      bevel: 1.2,
      seed,
      base: 0.5,
      toneVar: 0.18,
      relief: 0.8,
    });
  return false;
}
