// The dungeons' two rock sets in each climate: the mines (set 19), rock hewn by picks and held up by squared timber,
// and the caverns (set 20), rock as water left it, in beds and fractured faces, veined, damp and dripping.
import { planks } from '../boards.ts';
import { dirt } from '../earth.ts';
import type { Materials } from '../materials.ts';
import { fbm, hash01, smooth, speckle, stream } from '../noise.ts';
import type { Job, RecipeContext } from '../recipe.ts';
import { fractures, hewn, ledge, seeps, stones, strata, stubs, veins } from '../rock.ts';
import { mottle } from '../stone.ts';
import { ellipse, Surface } from '../surface.ts';
import { moss } from '../weathering.ts';
import { kitMats } from './thingMats.ts';

/** A climate's rock sets: the mines' rock, timber, earth (how light it lies, whether moss grows on it) and gravel;
 *  the caverns' beds, veins, the wet in their seeps (null for none), floor sand, worn floor rock, pebbles and the
 *  stubs on their ceiling. */
export interface RockLook {
  readonly hewn: string;
  readonly timber: string;
  readonly earth: string;
  readonly earthTone: number;
  readonly mossy: boolean;
  readonly gravel: string;
  readonly beds: readonly string[];
  readonly vein: string;
  readonly wet: string | null;
  readonly sand: string;
  readonly floor: string;
  readonly pebbles: readonly string[];
  readonly stub: string;
}

/** The rock sets by climate: desert sandstone, mountain grey stone, temperate warm rubble, swamp green and dark. */
export const ROCK_LOOKS: Readonly<Record<number, RockLook>> = {
  0: {
    hewn: 'adobe',
    timber: 'woodGrey',
    earth: 'sandstone',
    earthTone: 0.55,
    mossy: false,
    gravel: 'adobe',
    beds: ['sandstone', 'adobe', 'brickTan'],
    vein: 'marbleRed',
    wet: null,
    sand: 'sandstone',
    floor: 'adobe',
    pebbles: ['brickTan', 'sandstone'],
    stub: 'plaster',
  },
  100: {
    hewn: 'rockGrey',
    timber: 'woodDark',
    earth: 'dirtDark',
    earthTone: 0.45,
    mossy: false,
    gravel: 'stone',
    beds: ['slate', 'rockGrey', 'plasterGrey'],
    vein: 'marble',
    wet: null,
    sand: 'plasterGrey',
    floor: 'rockGrey',
    pebbles: ['stone', 'rockGrey'],
    stub: 'marble',
  },
  300: {
    hewn: 'rubbleWarm',
    timber: 'wood',
    earth: 'dirt',
    earthTone: 0.5,
    mossy: false,
    gravel: 'stone',
    beds: ['cobbleBrown', 'rubbleWarm', 'stone'],
    vein: 'rust',
    wet: null,
    sand: 'dirt',
    floor: 'rubbleWarm',
    pebbles: ['stone', 'cobbleBrown'],
    stub: 'plaster',
  },
  400: {
    hewn: 'stoneGreen',
    timber: 'woodOlive',
    earth: 'mud',
    earthTone: 0.36,
    mossy: true,
    gravel: 'stoneGreen',
    beds: ['stoneGreen', 'slate', 'stoneDark'],
    vein: 'marbleTeal',
    wet: 'slime',
    sand: 'mud',
    floor: 'stoneGreen',
    pebbles: ['stoneDark', 'slate'],
    stub: 'marbleGreen',
  },
};

/** A record of the dungeons' rock sets: the mines' or the caverns'. */
export function paintDungeonRock(ctx: RecipeContext): Job {
  const set = ctx.archive % 100;
  const look = ROCK_LOOKS[ctx.archive - set] ?? ROCK_LOOKS[300];
  return set === 19 ? paintMines(ctx, look) : paintCaverns(ctx, look);
}

/** An iron nail's head. */
function nail(surf: Surface, mats: Materials, x: number, y: number): void {
  ellipse(x, y, 0.8, 0.8, (placeX, placeY, relU, relV) =>
    surf.put(placeX, placeY, { material: mats.index.iron, tone: 0.6 - (relU + relV) * 0.2, bump: 1.4 }),
  );
}

/** Raise a box of the surface by `lift`, so what is painted there stands in front of what is round it. */
function raise(surf: Surface, lift: number, left: number, top: number, right: number, bottom: number): void {
  surf.each((_placeX, _placeY, i) => (surf.relief[i] += lift), left, top, right, bottom);
}

/** The mines: hewn walls, one with a squared post; packed earth and gravel; lagging over a cap beam; a nailed beam. */
function paintMines(ctx: RecipeContext, look: RockLook): Job {
  const { record, width, height, seed } = ctx;
  const mats = kitMats(look.hewn, look.timber, look.earth, look.gravel, 'moss');
  const index = mats.index;
  const rock = index[look.hewn];
  const timber = index[look.timber];
  const surf = new Surface(width, height);
  if (record <= 1) {
    hewn(surf, { material: rock, seed, across: record ? 8 : 9, down: 4, marks: record ? 18 : 12, depth: 1.6 });
    if (record === 0) post(surf, mats, timber, seed);
  } else if (record === 2) floor(surf, mats, look, seed);
  else if (record === 3) ceiling(surf, mats, rock, timber, seed);
  else trimBeam(surf, mats, timber, seed);
  return { surf, mats, finish: { strength: 0.85, soften: 0.5 } };
}

/** A squared beam the picture's height, grain along it, nailed in two rows and bound by an iron strap. */
function trimBeam(surf: Surface, mats: Materials, timber: number, seed: number): void {
  planks(surf, {
    material: timber,
    seed,
    dir: 'h',
    count: 1,
    joints: false,
    gap: 1.2,
    gapTone: 0.05,
    base: 0.5,
    amp: 0.3,
    grain: 0.2,
    knots: 2,
    crown: 1.2,
    edge: 1.6,
  });
  const strapX = 18 + Math.floor(hash01(seed, 1) * 24);
  surf.each(
    (x, y, i) => {
      surf.material[i] = mats.index.iron;
      surf.tone[i] = 0.4 + speckle(seed, x, y) * 0.1 - (x + 0.5 - strapX > 2.5 ? 0.15 : 0);
      surf.relief[i] += 0.8;
    },
    strapX,
    1,
    strapX + 3,
    surf.height,
  );
  for (let x = 3; x < surf.width; x += 8) {
    nail(surf, mats, x + hash01(seed, x, 2) * 2, 6.5);
    nail(surf, mats, x + 4 + hash01(seed, x, 3) * 2, 25.5);
  }
  nail(surf, mats, strapX + 1.5, 12);
  nail(surf, mats, strapX + 1.5, 20);
}

/** A squared post up the strip, its grain running up it, standing proud of the rock and spiked to it. */
function post(surf: Surface, mats: Materials, timber: number, seed: number): void {
  const left = 32 + Math.floor(hash01(seed, 4) * 8);
  const right = left + 10;
  planks(
    surf,
    {
      material: timber,
      seed: seed + 5,
      dir: 'v',
      count: 1,
      joints: false,
      gap: 0.6,
      gapTone: 0.05,
      base: 0.58,
      amp: 0.3,
      grain: 0.2,
      knots: 1,
      crown: 0.6,
      edge: 1.5,
    },
    { x0: left, x1: right },
  );
  raise(surf, 3, left, 0, right, surf.height);
  nail(surf, mats, left + 3, 6);
  nail(surf, mats, left + 6.5, 24);
}

/** Packed earth with gravel trodden into it and a few stones lying loose. */
function floor(surf: Surface, mats: Materials, look: RockLook, seed: number): void {
  const index = mats.index;
  const earth = index[look.earth];
  const gravel = index[look.gravel];
  const base = look.earthTone;
  mottle(surf, { material: earth, base, amp: 0.16, cells: 4, fine: 0.06, texel: 0.03, bump: 0.5, seed });
  dirt(surf, { material: earth, seed: seed + 3, mask: () => true, pebbles: 0.04, specks: 6 });
  stones(surf, { materials: [gravel], seed: seed + 1, count: 70, least: 1, most: 2.2, lift: 0.7 });
  stones(surf, { materials: [gravel, index[look.hewn]], seed: seed + 4, count: 6, least: 3.5, most: 6.5, lift: 0.8 });
  if (look.mossy) moss(surf, { material: index.moss, seed: seed + 5, below: 0, joints: 0.6, amount: 0.22 });
}

/** Hewn rock overhead, lagging boards laid across it with a few gone, and a cap beam under them. */
function ceiling(surf: Surface, mats: Materials, rock: number, timber: number, seed: number): void {
  hewn(surf, { material: rock, seed, across: 8, down: 8, marks: 16, depth: 1.5, base: 0.42 });
  const rng = stream(seed + 6);
  let x = rng.next() * 4;
  const end = x + surf.width - 4;
  let board = 0;
  while (x < end) {
    const wide = Math.min(end - x, 7 + rng.int(4));
    if (wide >= 4 && rng.next() > 0.3) {
      planks(
        surf,
        {
          material: timber,
          seed: seed + 7 + board,
          dir: 'v',
          count: 1,
          joints: false,
          gap: 0.8,
          gapTone: 0.05,
          base: 0.58 + rng.range(-0.08, 0.08),
          amp: 0.3,
          grain: 0.18,
          knots: 1,
          crown: 0.4,
          edge: 0.8,
        },
        { x0: x, x1: x + wide },
      );
      raise(surf, 1.8, x, 0, x + wide, surf.height);
    }
    x += wide + 1;
    board++;
  }
  const top = 26 + Math.floor(hash01(seed, 5) * 6);
  planks(
    surf,
    {
      material: timber,
      seed: seed + 3,
      dir: 'h',
      count: 1,
      joints: false,
      gap: 0.8,
      gapTone: 0.05,
      base: 0.55,
      amp: 0.3,
      grain: 0.2,
      knots: 2,
      crown: 0.8,
      edge: 1.6,
    },
    { y0: top, y1: top + 9 },
  );
  raise(surf, 4, 0, top, surf.width, top + 9);
  for (let k = 0; k < 4; k++) nail(surf, mats, 6 + k * 16 + hash01(seed, k, 6) * 6, top + 2 + (k % 2) * 4);
}

/** The caverns: bedded and fractured walls, a worn floor of rock, sand and pebbles, a dripping ceiling, a ledge. */
function paintCaverns(ctx: RecipeContext, look: RockLook): Job {
  const { record, width, height, seed } = ctx;
  const wetName = look.wet === null ? [] : [look.wet];
  const mats = kitMats(...look.beds, look.vein, look.sand, look.floor, ...look.pebbles, look.stub, ...wetName);
  const index = mats.index;
  const beds = look.beds.map((name) => index[name]);
  const wet = look.wet === null ? undefined : index[look.wet];
  const surf = new Surface(width, height);
  if (record === 0) {
    strata(surf, { materials: beds, seed, thin: 2.5, thick: 8, warp: 7, relief: 2 });
    veins(surf, { material: index[look.vein], seed: seed + 1, count: 1, steps: 40, wide: 0.9, angle: 0.15 });
    seeps(surf, { seed: seed + 2, count: 2, len: 26, wide: 7, dark: 0.45, material: wet });
  } else if (record === 1) {
    strata(surf, { materials: beds, seed, thin: 5, thick: 12, warp: 8, relief: 0.5 });
    fractures(surf, { seed: seed + 5, across: 5, down: 3, tilt: 0.45, gap: 1, open: 0.5, toneVar: 0.12 });
    veins(surf, { material: index[look.vein], seed: seed + 1, count: 1, steps: 26, wide: 1, angle: 1.2 });
    seeps(surf, { seed: seed + 2, count: 2, len: 30, wide: 8, dark: 0.45, material: wet });
  } else if (record === 2) caveFloor(surf, mats, look, seed);
  else if (record === 3) {
    mottle(surf, {
      material: index[look.floor],
      base: 0.45,
      amp: 0.22,
      cells: 3,
      octaves: 4,
      fine: 0.06,
      bump: 5,
      seed,
    });
    fractures(surf, { seed: seed + 5, across: 4, down: 4, tilt: 0.2, gap: 0.9, open: 0.3 });
    stubs(surf, { material: index[look.stub], seed: seed + 1, count: 8, least: 4, most: 7, drips: 12 });
  } else {
    mottle(surf, { material: index[look.floor], base: 0.5, amp: 0.2, cells: 5, fine: 0.06, bump: 0.8, seed });
    ledge(surf, { seed: seed + 1, crest: 14, round: 9, wander: 6, lift: 7 });
  }
  return { surf, mats, finish: { strength: 1, contrast: 0.65 } };
}

/** Sand drifted over worn rock that shows through smooth, pebbles over both. */
function caveFloor(surf: Surface, mats: Materials, look: RockLook, seed: number): void {
  const index = mats.index;
  const rock = index[look.floor];
  mottle(surf, {
    material: index[look.sand],
    base: 0.55,
    amp: 0.12,
    cells: 6,
    fine: 0.1,
    texel: 0.08,
    bump: 0.3,
    seed,
  });
  surf.each((x, y, i) => {
    const field = fbm(seed + 1, x, y, surf.width, surf.height, { cells: 3, octaves: 4 });
    if (field < 0.5) {
      surf.tone[i] -= smooth(0.42, 0.5, field) * 0.15;
      return;
    }
    const cloud = fbm(seed + 2, x, y, surf.width, surf.height, { cells: 6, octaves: 3 });
    surf.material[i] = rock;
    surf.tone[i] = 0.55 + (cloud - 0.5) * 0.3 + speckle(seed, x, y) * 0.03;
    surf.relief[i] = smooth(0.5, 0.6, field) * 1.5 + (field - 0.5) * 4;
  });
  const pebbles = look.pebbles.map((name) => index[name]);
  stones(surf, { materials: pebbles, seed: seed + 3, count: 30, least: 2, most: 4, lift: 0.8, base: 0.62 });
  stones(surf, { materials: [rock, ...pebbles], seed: seed + 4, count: 4, least: 4, most: 7, lift: 0.7 });
}
