// The rooms: every interior set in its four climates - three walls (the third with its window), a floor and a
// ceiling - each family written as a few words: the wall's upper face and its wainscot, a timber grid, pillars,
// trims, the window; the floor's and the ceiling's kind. And the marble floors, and the paintings on the walls.
import { planks } from '../boards.ts';
import { band, frame, pillar, reliefFace, runes, shelves, timberFrame } from '../frames.ts';
import { hash01, stream } from '../noise.ts';
import { windowAt } from '../openings.ts';
import { marble, plaster, tiles, trowel } from '../plaster.ts';
import { sin } from '../portableMath.ts';
import { materials, type Materials } from '../materials.ts';
import type { Job, RecipeContext } from '../recipe.ts';
import { blocks, mottle, rubble } from '../stone.ts';
import { areaOf, Surface, type Box } from '../surface.ts';
import { cracks, grime } from '../weathering.ts';

/** A face's kind: how a wall, floor or ceiling is painted. */
export type SurfaceKind =
  | 'plaster'
  | 'adobe'
  | 'granite'
  | 'marble'
  | 'blocks'
  | 'bricks'
  | 'cobbles'
  | 'planks'
  | 'vplanks'
  | 'diagonal'
  | 'crossed'
  | 'tiles'
  | 'marbleTiles'
  | 'diamond'
  | 'panel'
  | 'shutters'
  | 'panelled';
type RoomWindow = 'arch' | 'lattice' | 'grid' | 'hole' | 'gothic' | 'tall';
type Sight = 'none' | 'shelves' | 'lion' | 'man' | 'statue' | 'emblem';

/**
 * A set's family: `upper` and `lower` the wall's faces as [kind, material] (no lower, the upper runs down), `split`
 * where they meet; `grid` a timber grid; `posts` a post at each side; `pillars` stone ones; `top` and `foot` trims;
 * `runes` a carved band; `frame` a border; `window` its kind; `floor` and `ceiling` their [kind, material]; `first`
 * and `second` what the first two walls carry.
 */
interface RoomFamily {
  readonly upper: readonly [SurfaceKind, string];
  readonly lower?: readonly [SurfaceKind, string];
  readonly split?: number;
  readonly floor: readonly [SurfaceKind, string];
  readonly ceiling: readonly [SurfaceKind, string];
  readonly window: RoomWindow;
  readonly grid?: string;
  readonly posts?: string;
  readonly pillars?: string;
  readonly top?: string;
  readonly foot?: string;
  readonly runes?: string;
  readonly frame?: string;
  readonly cracked?: boolean;
  readonly first?: Sight;
  readonly second?: Sight;
}

/** Each set's family by archive. */
// prettier-ignore
const ROOM_FAMILIES: Readonly<Record<number, RoomFamily>> = {
  16: { upper: ['plaster', 'sandstone'], foot: 'brickTan', window: 'arch', floor: ['diamond', 'brickTan'], ceiling: ['panel', 'wood'] },
  116: { upper: ['plaster', 'plasterWhite'], lower: ['blocks', 'stoneBlue'], split: 92, grid: 'woodDark', window: 'lattice', floor: ['planks', 'woodDark'], ceiling: ['panel', 'woodDark'] },
  316: { upper: ['plaster', 'plasterGrey'], lower: ['vplanks', 'wood'], split: 80, posts: 'wood', top: 'woodDark', window: 'grid', floor: ['planks', 'woodOlive'], ceiling: ['panel', 'woodRed'] },
  416: { upper: ['vplanks', 'wood'], lower: ['cobbles', 'stone'], split: 92, window: 'grid', floor: ['blocks', 'stoneDark'], ceiling: ['planks', 'woodPale'] },
  28: { upper: ['adobe', 'adobe'], window: 'hole', floor: ['diagonal', 'wood'], ceiling: ['panel', 'woodPale'] },
  128: { upper: ['plaster', 'clothBlue'], lower: ['blocks', 'stone'], split: 92, grid: 'wood', window: 'lattice', floor: ['planks', 'wood'], ceiling: ['panel', 'clothBlue'] },
  328: { upper: ['plaster', 'plasterGrey'], grid: 'wood', window: 'grid', floor: ['planks', 'woodPale'], ceiling: ['shutters', 'woodDark'] },
  428: { upper: ['plaster', 'clothBlue'], grid: 'woodDark', window: 'lattice', floor: ['planks', 'woodDark'], ceiling: ['shutters', 'woodDark'] },
  37: { upper: ['granite', 'stoneBlue'], runes: 'stone', first: 'none', second: 'lion', window: 'lattice', floor: ['tiles', 'stoneDark'], ceiling: ['tiles', 'stoneDark'] },
  137: { upper: ['granite', 'stoneDark'], runes: 'stone', second: 'man', window: 'lattice', floor: ['marble', 'marblePink'], ceiling: ['marble', 'marbleGreen'] },
  337: { upper: ['granite', 'stoneDark'], runes: 'stone', frame: 'stone', first: 'shelves', second: 'lion', window: 'lattice', floor: ['marbleTiles', 'stone'], ceiling: ['marble', 'stone'] },
  437: { upper: ['granite', 'stone'], runes: 'stone', frame: 'stone', first: 'shelves', second: 'lion', window: 'lattice', floor: ['marbleTiles', 'stone'], ceiling: ['marble', 'stone'] },
  40: { upper: ['plaster', 'sandstone'], foot: 'brickTan', window: 'arch', floor: ['tiles', 'sandstone'], ceiling: ['panel', 'wood'] },
  140: { upper: ['plaster', 'clothBlue'], lower: ['blocks', 'stone'], split: 92, grid: 'wood', window: 'lattice', floor: ['blocks', 'stoneDark'], ceiling: ['panel', 'wood'] },
  340: { upper: ['bricks', 'brickDark'], lower: ['vplanks', 'wood'], split: 80, window: 'lattice', floor: ['blocks', 'brickDark'], ceiling: ['panel', 'wood'] },
  440: { upper: ['plaster', 'marbleTeal'], top: 'clothBlue', window: 'lattice', floor: ['tiles', 'clothBlue'], ceiling: ['plaster', 'clothBlue'] },
  44: { upper: ['plaster', 'sandstone'], top: 'stoneGreen', window: 'arch', floor: ['tiles', 'marbleTeal'], ceiling: ['plaster', 'sandstone'] },
  144: { upper: ['plaster', 'adobe'], top: 'gold', foot: 'gold', window: 'grid', floor: ['cobbles', 'stone'], ceiling: ['plaster', 'adobe'] },
  344: { upper: ['plaster', 'plasterWhite'], lower: ['vplanks', 'wood'], split: 80, cracked: true, window: 'lattice', floor: ['planks', 'wood'], ceiling: ['shutters', 'woodDark'] },
  444: { upper: ['panelled', 'wood'], lower: ['vplanks', 'woodDark'], split: 92, window: 'lattice', floor: ['tiles', 'stone'], ceiling: ['planks', 'wood'] },
  60: { upper: ['plaster', 'adobe'], lower: ['vplanks', 'woodDark'], split: 100, posts: 'wood', window: 'lattice', floor: ['blocks', 'stoneDark'], ceiling: ['panel', 'wood'] },
  160: { upper: ['plaster', 'adobe'], pillars: 'stone', window: 'grid', floor: ['blocks', 'stoneDark'], ceiling: ['panel', 'wood'] },
  360: { upper: ['plaster', 'plasterGrey'], posts: 'wood', cracked: true, window: 'lattice', floor: ['blocks', 'stoneDark'], ceiling: ['panel', 'wood'] },
  460: { upper: ['blocks', 'stone'], window: 'gothic', floor: ['blocks', 'stoneDark'], ceiling: ['planks', 'woodRed'] },
  63: { upper: ['marble', 'marbleTeal'], window: 'gothic', floor: ['diamond', 'gold'], ceiling: ['blocks', 'stoneDark'] },
  163: { upper: ['granite', 'stoneDark'], frame: 'stone', first: 'statue', window: 'tall', floor: ['blocks', 'stoneDark'], ceiling: ['panel', 'wood'] },
  363: { upper: ['marble', 'marbleTeal'], window: 'gothic', floor: ['diamond', 'gold'], ceiling: ['blocks', 'stoneDark'] },
  463: { upper: ['marble', 'marblePink'], lower: ['vplanks', 'wood'], split: 104, posts: 'wood', second: 'emblem', window: 'gothic', floor: ['tiles', 'marblePink'], ceiling: ['panel', 'marblePink'] },
  66: { upper: ['adobe', 'adobe'], cracked: true, window: 'hole', floor: ['crossed', 'woodPale'], ceiling: ['diagonal', 'woodDark'] },
  166: { upper: ['plaster', 'plasterGrey'], lower: ['cobbles', 'stone'], split: 92, posts: 'wood', window: 'lattice', floor: ['planks', 'woodDark'], ceiling: ['shutters', 'woodDark'] },
  366: { upper: ['planks', 'wood'], lower: ['planks', 'woodPale'], split: 80, window: 'lattice', floor: ['blocks', 'stoneDark'], ceiling: ['planks', 'woodPale'] },
  466: { upper: ['vplanks', 'woodDark'], lower: ['cobbles', 'stoneDark'], split: 100, window: 'lattice', floor: ['blocks', 'stoneDark'], ceiling: ['shutters', 'woodDark'] },
};

/** The marble floors' four slabs, by archive: each record's marble. */
const MARBLE_FLOORS: Readonly<Record<number, readonly string[]>> = {
  41: ['marbleBlack', 'marbleTeal', 'marble', 'marblePink'],
  141: ['marblePink', 'marble', 'marbleRed', 'marblePink'],
  341: ['stone', 'marble', 'marblePink', 'marbleGreen'],
  441: ['stone', 'marble', 'marblePink', 'marbleGreen'],
};

/** A family's materials. */
function roomMats(family: RoomFamily): Materials {
  const names = new Set([
    'black',
    'mortar',
    'glassBlue',
    'glassDark',
    'iron',
    'wood',
    'woodDark',
    'stone',
    'bronze',
    'clothRed',
    'clothGreen',
    'clothPurple',
    'glassCyan',
    'petalYellow',
    'gold',
  ]);
  for (const face of [family.upper, family.lower, family.floor, family.ceiling]) if (face) names.add(face[1]);
  const parts = [family.grid, family.posts, family.pillars, family.top, family.foot, family.runes, family.frame];
  for (const part of parts) if (part !== undefined) names.add(part);
  const list = [...names];
  const dims = list.filter((name) => !['black', 'gold', 'bronze'].includes(name)).map((name) => `${name}:dim`);
  return materials([...list, ...dims]);
}

/** Paint a face of `kind` in `materialName` over the box: a wall's upper or lower part, a floor, a ceiling. */
export function paintSurfaceKind(
  surf: Surface,
  mats: Materials,
  kind: SurfaceKind,
  materialName: string,
  seed: number,
  box?: Box,
): void {
  const material = mats.index[materialName];
  const dim = mats.index[`${materialName}:dim`] ?? mats.index.black;
  const black = mats.index.black;
  const area = areaOf(surf, box);
  switch (kind) {
    case 'plaster':
      trowel(surf, { material, seed, cells: 9, cloud: 0.8, texel: 0.1, count: 5, wid: 2, amp: 0.7 }, box);
      break;
    case 'adobe':
      plaster(
        surf,
        { material, seed, base: 0.55, amp: 0.16, rough: 0.6, patches: 0.1, pits: 0.15, bump: 0.6, fine: 0.05 },
        box,
      );
      break;
    case 'granite':
      mottle(surf, { material, base: 0.5, amp: 0.1, bump: 0.3, cells: 8, fine: 0.08, texel: 0.1, seed }, box);
      break;
    case 'marble':
      marble(surf, { material, veins: 0.18, seed, base: 0.55, amp: 0.12, sharp: 20 }, box);
      break;
    case 'blocks':
    case 'bricks': {
      const bricks = kind === 'bricks';
      blocks(
        surf,
        {
          material,
          mortar: dim,
          rows: Math.max(2, Math.round((area.y1 - area.y0) / (bricks ? 6 : 14))),
          widths: bricks ? [10, 14] : [18, 30],
          gap: 1,
          bevel: bricks ? 0.6 : 1.2,
          seed,
          base: 0.5,
          toneVar: bricks ? 0.15 : 0.18,
          amp: bricks ? undefined : 0.35,
          relief: bricks ? 0.5 : 0.8,
          mortarTone: bricks ? 0.25 : 0.2,
        },
        box,
      );
      break;
    }
    case 'cobbles':
      rubble(
        surf,
        {
          material,
          mortar: black,
          across: 5,
          down: Math.max(2, Math.round((area.y1 - area.y0) / 8)),
          dome: 1,
          gap: 1,
          seed,
          base: 0.55,
          toneVar: 0.12,
          mortarTone: 0.4,
          relief: 0.8,
          bevel: 2,
        },
        box,
      );
      break;
    case 'planks':
      planks(
        surf,
        {
          material,
          dir: 'h',
          count: Math.max(2, Math.round((area.y1 - area.y0) / 10)),
          seed,
          gapMaterial: dim,
          gapTone: 0.25,
          base: 0.55,
          knots: 1,
          grain: 0.1,
          amp: 0.25,
          joints: 'few',
          crown: 0.3,
          edge: 0.5,
        },
        box,
      );
      break;
    case 'vplanks':
      planks(
        surf,
        {
          material,
          dir: 'v',
          count: Math.max(2, Math.round((area.x1 - area.x0) / 11)),
          seed,
          gapMaterial: dim,
          gapTone: 0.2,
          base: 0.55,
          knots: 1,
          grain: 0.12,
          amp: 0.3,
          joints: false,
          crown: 0.3,
          edge: 0.6,
        },
        box,
      );
      break;
    case 'diagonal':
    case 'crossed': {
      // boards laid on the slant: stripes along the diagonal, each board its own tone
      const period = 9;
      surf.each(
        (x, y, i) => {
          const along = kind === 'crossed' && x + y < (area.x1 + area.y1) / 2 ? x - y : x + y;
          const k = Math.floor(along / period);
          const within = (((along % period) + period) % period) / period;
          surf.material[i] = within < 0.12 ? dim : material;
          surf.tone[i] = 0.45 + hash01(seed, k) * 0.25 + (within - 0.5) * 0.15;
          surf.relief[i] = within < 0.12 ? -0.5 : 0.3;
        },
        area.x0,
        area.y0,
        area.x1,
        area.y1,
      );
      break;
    }
    case 'tiles':
      mottle(surf, { material, base: 0.55, amp: 0.15, cells: 6, fine: 0.06, seed }, box);
      tiles(surf, { gap: 1, grout: dim, groutTone: 0.3, relief: 0.5 }, box);
      break;
    case 'marbleTiles':
      marble(surf, { material, dark: true, veins: 0.12, seed, base: 0.62, amp: 0.2, sharp: 14 }, box);
      tiles(surf, { gap: 1, grout: dim, groutTone: 0.35, relief: 0.4 }, box);
      break;
    case 'diamond': {
      mottle(surf, { material, base: 0.55, amp: 0.15, cells: 5, fine: 0.06, seed }, box);
      const midX = (area.x0 + area.x1) / 2;
      const midY = (area.y0 + area.y1) / 2;
      const radius = (area.x1 - area.x0) * 0.28;
      surf.each(
        (x, y, i) => {
          const away = Math.abs(x + 0.5 - midX) + Math.abs(y + 0.5 - midY);
          if (Math.abs(away - radius) < 1.6) {
            surf.tone[i] += 0.3;
            surf.relief[i] += 0.8;
          }
        },
        area.x0,
        area.y0,
        area.x1,
        area.y1,
      );
      frame(surf, 2, { material: dim, base: 0.4 });
      break;
    }
    case 'panel':
      planks(
        surf,
        {
          material,
          dir: 'v',
          count: 3,
          seed,
          gapMaterial: dim,
          gapTone: 0.25,
          base: 0.55,
          knots: 1,
          grain: 0.12,
          amp: 0.3,
          joints: false,
          crown: 0.3,
        },
        box,
      );
      frame(surf, 4, { material: dim, base: 0.45 });
      break;
    case 'shutters': {
      planks(
        surf,
        {
          material,
          dir: 'v',
          count: 8,
          seed,
          gapMaterial: black,
          gapTone: 0.15,
          base: 0.5,
          grain: 0.1,
          amp: 0.25,
          joints: false,
          crown: 0.4,
        },
        box,
      );
      frame(surf, 3, { material, base: 0.4 });
      const middle = Math.round((area.y0 + area.y1) / 2);
      band(surf, middle - 2, middle + 2, { material, base: 0.45, relief: 1.2 });
      break;
    }
    case 'panelled':
      planks(
        surf,
        {
          material,
          dir: 'v',
          count: 2,
          seed,
          gapMaterial: dim,
          base: 0.5,
          grain: 0.1,
          amp: 0.25,
          joints: false,
          crown: 0.2,
        },
        box,
      );
      break;
  }
}

/** Paint a record of an interior set or a marble floor, or answer null for none of these. */
export function paintRoom(ctx: RecipeContext): Job | null {
  const { archive, record, width, height, seed } = ctx;
  const slabs = MARBLE_FLOORS[archive];
  if (slabs) {
    const name = slabs[record % 4];
    const mats = materials([name, 'black']);
    const surf = new Surface(width, height);
    marble(surf, {
      material: mats.index[name],
      veins: 0.16 + (record % 2) * 0.08,
      seed,
      base: 0.55,
      amp: 0.14,
      sharp: 20,
      dark: record === 0,
    });
    return { surf, mats, finish: { strength: 0.5, contrast: 0.45 } };
  }
  const family = ROOM_FAMILIES[archive];
  if (!family) return null;
  const mats = roomMats(family);
  const index = mats.index;
  const surf = new Surface(width, height);
  // the floor and the ceiling: the square records past the three walls
  if (record >= 3 || height < 96) {
    const [kind, material] = record === 4 ? family.ceiling : family.floor;
    paintSurfaceKind(surf, mats, kind, material, seed);
    return { surf, mats, finish: { strength: 0.6 } };
  }
  const split = family.lower ? (family.split ?? 80) : height;
  paintSurfaceKind(surf, mats, family.upper[0], family.upper[1], seed, { x0: 0, y0: 0, x1: width, y1: split });
  if (family.lower) {
    paintSurfaceKind(surf, mats, family.lower[0], family.lower[1], seed + 1, {
      x0: 0,
      y0: split,
      x1: width,
      y1: height,
    });
    band(surf, split - 3, split + 3, {
      material: index[family.grid ?? family.posts ?? 'woodDark'] ?? index.woodDark,
      base: 0.45,
      relief: 1.6,
    });
  }
  if (family.grid)
    timberFrame(surf, {
      material: index[family.grid],
      base: 0.42,
      posts: [0, 32],
      rails: [2, 30, 60, split - 2],
      w: 6,
    });
  if (family.posts) timberFrame(surf, { material: index[family.posts], base: 0.5, posts: [0], rails: [], w: 7 });
  if (family.pillars) {
    pillar(surf, 0, 8, { material: index[family.pillars], base: 0.45 });
    pillar(surf, width - 8, width, { material: index[family.pillars], base: 0.45 });
  }
  if (family.frame) frame(surf, 3, { material: index[family.frame], base: 0.5 });
  if (family.top) band(surf, 0, 6, { material: index[family.top], base: 0.5, relief: 1.4 });
  if (family.foot) band(surf, height - 8, height, { material: index[family.foot], base: 0.5, relief: 1.2 });
  if (family.runes) runes(surf, 3, 74, width - 3, 84, { material: index[family.runes], seed });
  if (family.cracked && record !== 2) cracks(surf, { count: 2, seed });
  const sight = record === 0 ? family.first : record === 1 ? family.second : undefined;
  if (sight === 'shelves') {
    surf.each((x, y) => surf.put(x, y, { material: index.black, tone: 0.06, relief: -2 }), 12, 50, 52, 68);
    shelves(surf, 12, 50, 52, 68, {
      rows: 1,
      back: index.black,
      wood: index.stone,
      goods: ['jar', 'jar', 'bottle', 'jar'],
      spines: [index.clothRed],
      vessels: [index.clothRed, index.glassCyan, index.petalYellow, index.clothPurple, index.clothGreen],
    });
  }
  if (sight === 'lion' || sight === 'man')
    reliefFace(surf, 12, 10, 52, 64, {
      material: sight === 'lion' ? index.bronze : index.stone,
      kind: sight === 'lion' ? 'beast' : 'man',
      base: 0.45,
    });
  if (sight === 'statue') reliefFace(surf, 14, 12, 50, 110, { material: index.stone, kind: 'man', base: 0.5 });
  if (sight === 'emblem') reliefFace(surf, 18, 24, 46, 60, { material: index.gold, kind: 'demon', base: 0.5 });
  if (record === 2) paintRoomWindow(surf, mats, family.window, width, seed);
  grime(surf, { foot: 0.04, blot: 0.2, seed });
  return { surf, mats, finish: { strength: 0.7 }, window: record === 2 };
}

/** A room's window, its glass the night's blue. */
function paintRoomWindow(surf: Surface, mats: Materials, kind: RoomWindow, width: number, seed: number): void {
  const index = mats.index;
  if (kind === 'hole') {
    windowAt(surf, 22, 44, 42, 66, {
      kind: 'arch',
      frame: index.black,
      frameTone: 0.3,
      glass: index.glassDark,
      glassTone: 0.02,
      frameW: 2,
      seed,
    });
    return;
  }
  const box =
    kind === 'tall'
      ? [20, 16, 44, 104]
      : kind === 'gothic'
        ? [18, 18, 46, 76]
        : kind === 'arch'
          ? [8, 30, 56, 66]
          : [12, 28, 52, 66];
  windowAt(surf, box[0], box[1], Math.min(width, box[2]), box[3], {
    kind: kind === 'grid' ? 'grid' : kind === 'arch' || kind === 'gothic' ? 'arch' : 'lattice',
    head: kind === 'arch' ? 'round' : kind === 'gothic' ? 'pointed' : undefined,
    pitch: 11,
    leadW: 1.6,
    frame: index.wood,
    frameTone: 0.5,
    glass: index.glassBlue,
    glassTone: 0.4,
    lead: index.iron,
    leadTone: 0.65,
    frameW: 3,
    mullion: kind !== 'grid',
    lit: true,
    seed,
  });
}

/** A painting: a gilt frame round a landscape - sky, far hills, near ground - its own every record. */
export function paintPainting(ctx: RecipeContext): Job {
  const { width, height, seed } = ctx;
  const mats = materials(['gold', 'glassBlue', 'grassMountain', 'rockGrey', 'sand', 'leafDark', 'white']);
  const index = mats.index;
  const surf = new Surface(width, height);
  const rng = stream(seed);
  const horizon = height * (0.45 + rng.next() * 0.2);
  const hillAmp = height * 0.12;
  const phase = rng.next() * 6;
  surf.each((x, y, i) => {
    const hill = horizon - Math.abs(sin((x / width) * 3 + phase)) * hillAmp;
    if (y < hill) {
      surf.material[i] = index.glassBlue;
      surf.tone[i] = 0.75 - (y / height) * 0.4;
    } else if (y < horizon + height * 0.1) {
      surf.material[i] = index.rockGrey;
      surf.tone[i] = 0.45 + hash01(seed, x, y) * 0.1;
    } else {
      surf.material[i] = index.grassMountain;
      surf.tone[i] = 0.4 + hash01(seed + 1, x, y) * 0.2;
    }
  });
  frame(surf, Math.max(2, Math.round(Math.min(width, height) / 12)), { material: index.gold, base: 0.55 });
  return { surf, mats, finish: { strength: 0.6 } };
}
