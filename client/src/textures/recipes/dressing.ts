// The dressing the dungeons' built pieces wear, in each climate: heaped bones, carved stone, dyed cloth, rope, ore in
// its rock and worn gilt brass. Each tiles, as the dungeon sets do. The climate turns the carved stone, the cloth's
// dye and the ore, which is the caverns' vein.
import type { FinishOptions } from '../finish.ts';
import type { Materials } from '../materials.ts';
import { clamp01, fbm, hash01, smooth, speckle, stream, worley, wrap, type Stream } from '../noise.ts';
import { cos, sin } from '../portableMath.ts';
import type { Job, RecipeContext } from '../recipe.ts';
import { hewn, veins } from '../rock.ts';
import { ellipse, stroke, Surface } from '../surface.ts';
import { cracks } from '../weathering.ts';
import { ROCK_LOOKS, type RockLook } from './dungeonRock.ts';
import { kitMats } from './thingMats.ts';

/** A climate's carved stone and the dye its cloth takes. */
interface DressingLook {
  readonly stone: string;
  readonly dye: string;
}

/** Each dye is one its land is known for, and stands off its own stone: desert indigo on sandstone, mountain madder
 *  red on grey stone, temperate weld green on warm rubble, swamp lichen purple on green stone. */
const LOOKS: Readonly<Record<number, DressingLook>> = {
  0: { stone: 'sandstone', dye: 'clothBlue' },
  100: { stone: 'stone', dye: 'clothRed' },
  300: { stone: 'rubbleWarm', dye: 'clothGreen' },
  400: { stone: 'stoneGreen', dye: 'clothPurple' },
};

/** How each record is finished: the bones, the carving, the cloth, the rope, the ore and the brass. */
const FINISHES: readonly FinishOptions[] = [
  { strength: 1.2, cast: 0.7, occlusion: 0.35 },
  { strength: 1.1, cast: 0.5, contrast: 0.6 },
  { strength: 0.6, soften: 0.5 },
  { strength: 1 },
  { strength: 0.9, contrast: 0.65 },
  { strength: 1.2, cast: 0.2, occlusion: 0.1, spread: 0.8, contrast: 0.7 },
];

/** A record of the dressing: 0 bones, 1 carved stone, 2 cloth, 3 rope, 4 ore, 5 brass. */
export function paintDressing(ctx: RecipeContext): Job {
  const set = ctx.archive % 100;
  const climate = (ctx.archive % 1000) - set;
  const look = LOOKS[climate] ?? LOOKS[300];
  const rock = ROCK_LOOKS[climate] ?? ROCK_LOOKS[300];
  const mats = kitMats(look.stone, look.dye, rock.floor, rock.vein, 'ivory', 'plaster', 'thatch');
  const surf = new Surface(ctx.width, ctx.height);
  const { record, seed } = ctx;
  if (record === 0) bones(surf, mats, seed);
  else if (record === 1) carving(surf, mats, look.stone, seed);
  else if (record === 2) cloth(surf, mats, look.dye, seed);
  else if (record === 3) rope(surf, mats, seed);
  else if (record === 4) ore(surf, mats, rock, seed);
  else brass(surf, mats, seed);
  return { surf, mats, finish: FINISHES[record] ?? FINISHES[0] };
}

/** One bone of the heap: its material and tone, and how high it lies, so a later bone lies on an earlier one. */
interface Bone {
  readonly material: number;
  readonly tone: number;
  readonly lift: number;
  readonly seed: number;
}

/** Lay one place of a bone, `height` above where it lies, its tone moved by `shade`. */
function layBone(surf: Surface, bone: Bone, x: number, y: number, height: number, shade: number): void {
  const i = surf.idx(x, y);
  surf.material[i] = bone.material;
  surf.tone[i] = bone.tone + shade + speckle(bone.seed, x, y) * 0.05;
  surf.relief[i] = bone.lift + height;
}

/** A dome's height at a place `relU`, `relV` across an ellipse. */
const dome = (relU: number, relV: number): number => Math.sqrt(Math.max(0, 1 - relU * relU - relV * relV));

/** Bones heaped every way, ribs and knuckles among them and skulls near the top, ivory to yellowed, over the dark
 *  of the gaps where the heap goes down. */
function bones(surf: Surface, mats: Materials, seed: number): void {
  const index = mats.index;
  surf.each((x, y, i) => {
    const deep = fbm(seed, x, y, surf.width, surf.height, { cells: 4, octaves: 3 });
    surf.material[i] = index.black;
    surf.tone[i] = 0.25 + deep * 0.4 + speckle(seed, x, y) * 0.06;
    surf.relief[i] = deep * 1.5 - 2.5;
  });
  const shades = [index.ivory, index.ivory, index.plaster];
  const rng = stream(seed + 1);
  for (let k = 0; k < 130; k++) {
    const bone = { material: rng.pick(shades), tone: rng.range(0.45, 0.9), lift: k * 0.05, seed: seed + k };
    const x = rng.next() * surf.width;
    const y = rng.next() * surf.height;
    const kind = rng.next();
    if (k >= 80 && k % 5 === 0) skull(surf, mats, bone, x, y, rng.range(3.2, 4.2));
    else if (kind < 0.6) longBone(surf, bone, x, y, rng);
    else if (kind < 0.8) rib(surf, bone, x, y, rng);
    else knuckle(surf, mats, bone, x, y, rng);
  }
}

/** A long bone: a round shaft, and two knobs at each end. */
function longBone(surf: Surface, bone: Bone, x: number, y: number, rng: Stream): void {
  const angle = rng.next() * Math.PI;
  const half = rng.range(4.5, 8);
  const thick = rng.range(1.8, 2.8);
  const alongX = cos(angle) * half;
  const alongY = sin(angle) * half;
  stroke(x - alongX, y - alongY, x + alongX, y + alongY, thick, thick * 0.85, (placeX, placeY, _along, across) =>
    layBone(surf, bone, placeX, placeY, dome(across, 0) * thick * 0.55, -Math.abs(across) * 0.08),
  );
  const sideX = -sin(angle) * thick * 0.42;
  const sideY = cos(angle) * thick * 0.42;
  for (const end of [-1, 1])
    for (const side of [-1, 1])
      ellipse(
        x + alongX * end + sideX * side,
        y + alongY * end + sideY * side,
        thick * 0.55,
        thick * 0.55,
        (placeX, placeY, relU, relV) => layBone(surf, bone, placeX, placeY, dome(relU, relV) * thick * 0.7, 0.04),
      );
}

/** A rib: a thin bone curving along an arc, narrowing to its end. */
function rib(surf: Surface, bone: Bone, x: number, y: number, rng: Stream): void {
  const radius = rng.range(5, 8);
  const start = rng.next() * Math.PI * 2;
  const sweep = rng.range(1, 1.6);
  const steps = 8;
  for (let step = 0; step < steps; step++) {
    const from = start + (sweep * step) / steps;
    const to = start + (sweep * (step + 1)) / steps;
    const wide = 1.4 * (1 - (step / steps) * 0.4);
    stroke(
      x + cos(from) * radius,
      y + sin(from) * radius,
      x + cos(to) * radius,
      y + sin(to) * radius,
      wide,
      wide,
      (placeX, placeY, _along, across) => layBone(surf, bone, placeX, placeY, dome(across, 0) * 0.6, 0),
    );
  }
}

/** A knuckle or a vertebra: a small round bone, the larger ones with the dark hole a cord ran through. */
function knuckle(surf: Surface, mats: Materials, bone: Bone, x: number, y: number, rng: Stream): void {
  const radius = rng.range(1.1, 1.8);
  ellipse(x, y, radius * 1.15, radius, (placeX, placeY, relU, relV) =>
    layBone(surf, bone, placeX, placeY, dome(relU, relV) * radius * 0.7, 0),
  );
  if (radius > 1.5) hollow(surf, mats, bone.lift, x, y, 0.5, 0.5);
}

/** A dark hollow in a bone: an eye socket, a nose's hole, a vertebra's. */
function hollow(
  surf: Surface,
  mats: Materials,
  lift: number,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
): void {
  ellipse(x, y, radiusX, radiusY, (placeX, placeY, relU, relV) => {
    const i = surf.idx(placeX, placeY);
    surf.material[i] = mats.index.black;
    surf.tone[i] = 0.12 + (relU + relV) * 0.04;
    surf.relief[i] = lift - dome(relU, relV) * 0.6;
  });
}

/** A skull face on: the upper jaw's teeth, a domed crown over them, two dark eye sockets and the nose's hole. */
function skull(surf: Surface, mats: Materials, bone: Bone, x: number, y: number, radius: number): void {
  ellipse(x, y + radius * 0.72, radius * 0.58, radius * 0.42, (placeX, placeY, relU, relV) => {
    const gap = relV > 0.1 && (Math.floor(placeX + 0.5) & 1) === 1;
    layBone(surf, bone, placeX, placeY, dome(relU, relV) * radius * 0.4, gap ? -0.25 : 0);
  });
  ellipse(x, y, radius, radius * 0.9, (placeX, placeY, relU, relV) =>
    layBone(surf, bone, placeX, placeY, dome(relU, relV) * radius * 0.8 + 0.4, 0.06 - relV * 0.06),
  );
  const depth = bone.lift + radius * 0.3;
  for (const side of [-1, 1])
    hollow(surf, mats, depth, x + side * radius * 0.4, y + radius * 0.18, radius * 0.28, radius * 0.25);
  hollow(surf, mats, depth, x, y + radius * 0.52, radius * 0.12, radius * 0.16);
}

/** The carving's rows: a fillet, the band of runes, a fillet, then the knotwork to the foot, which meets the first
 *  fillet again where the picture repeats. */
const FILLET_FOOT = 3;
const RUNES_FOOT = 15;
const PANEL_TOP = 18;
/** The knotwork's strands: one a 16 texels along each diagonal, so they meet the picture's edges as they leave. */
const KNOT_PERIOD = 16;
const STRAND_HALF = 2.6;

/** Futhark-like runes, each its strokes [fromX, fromY, toX, toY] in texels from the top of its stave. */
const RUNES: readonly (readonly (readonly [number, number, number, number])[])[] = [
  [
    [0, 0, 0, 8],
    [0, 0, 3, 2],
    [0, 3, 3, 5],
  ],
  [
    [0, 0, 0, 8],
    [0, 1, 3, 3],
    [3, 3, 0, 5],
  ],
  [
    [0, 0, 0, 8],
    [0, 0, 3, 3],
  ],
  [
    [0, 0, 0, 8],
    [-2, 3, 2, 5],
  ],
  [
    [0, 0, 0, 8],
    [3, 0, 3, 8],
    [0, 2, 3, 5],
  ],
  [
    [0, 0, 0, 8],
    [0, 0, -2, 3],
    [0, 0, 2, 3],
  ],
  [
    [2, 0, 0, 4],
    [0, 4, 2, 8],
  ],
  [
    [0, 0, 0, 8],
    [0, 0, 3, 2],
    [3, 2, 0, 4],
    [0, 4, 3, 8],
  ],
  [
    [0, 0, 0, 8],
    [0, 2, 3, 0],
    [0, 5, 3, 3],
  ],
];

/** Carved stone: a band of runes between two fillets over a panel of knotwork, its cuts dark. */
function carving(surf: Surface, mats: Materials, stoneName: string, seed: number): void {
  const stone = mats.index[stoneName];
  const cut = mats.index[`${stoneName}:dim`];
  surf.each((x, y, i) => {
    const cloud = fbm(seed, x, y, surf.width, surf.height, { cells: 4, octaves: 4 });
    const placeY = y + 0.5;
    const fillet =
      placeY < FILLET_FOOT
        ? placeY / FILLET_FOOT
        : placeY >= RUNES_FOOT && placeY < PANEL_TOP
          ? (placeY - RUNES_FOOT) / 3
          : -1;
    const strand = placeY >= PANEL_TOP ? knot(x, y) : 0;
    surf.material[i] = strand < 0 ? cut : stone;
    surf.tone[i] = (strand < 0 ? 0.22 : 0.55) + (cloud - 0.5) * 0.3 + speckle(seed, x, y) * 0.06;
    const height = fillet >= 0 ? 1.8 + sin(Math.PI * fillet) * 0.9 : placeY < RUNES_FOOT ? 1.4 : strand;
    surf.relief[i] = height + (cloud - 0.5) * 0.3;
  });
  const rng = stream(seed + 2);
  for (let column = 0; column < surf.width; column += 8) {
    const glyph = RUNES[rng.int(RUNES.length)];
    const staveX = column + 3 + rng.int(2);
    for (const [fromX, fromY, toX, toY] of glyph)
      stroke(staveX + fromX, 5 + fromY, staveX + toX, 5 + toY, 1.2, 1.2, (placeX, placeY, _along, across) => {
        const i = surf.idx(placeX, placeY);
        surf.material[i] = cut;
        surf.tone[i] = 0.22 + Math.abs(across) * 0.1;
        surf.relief[i] = 1.4 - (1 - Math.abs(across)) * 1.3;
      });
  }
  cracks(surf, { seed: seed + 3, count: 2 });
}

/** The knotwork's height at a place: strands on both diagonals, each passing over the next it meets and under the
 *  one after, with a groove down its middle; -1.2 for the cut-back field between them. */
function knot(x: number, y: number): number {
  const rising = x + 0.5 + (y + 0.5);
  const falling = x + 0.5 - (y + 0.5);
  const riseStrand = Math.floor(rising / KNOT_PERIOD);
  const fallStrand = Math.floor(falling / KNOT_PERIOD);
  const riseAcross = Math.abs(rising - (riseStrand + 0.5) * KNOT_PERIOD) / Math.SQRT2;
  const fallAcross = Math.abs(falling - (fallStrand + 0.5) * KNOT_PERIOD) / Math.SQRT2;
  const risingOver = ((riseStrand + fallStrand) & 1) === 0;
  const crown = (across: number): number =>
    across < STRAND_HALF ? dome(across / STRAND_HALF, 0) * 1.2 + 1.6 - (across < 0.45 ? 0.7 : 0) : -1;
  // a strand dips as it nears the one it passes under
  const dip = (other: number): number => (1 - smooth(STRAND_HALF, STRAND_HALF + 2.5, other)) * 1.4;
  const rise = crown(riseAcross);
  const fall = crown(fallAcross);
  if (rise >= 0 && fall >= 0) return risingOver ? rise : fall;
  if (rise >= 0) return rise - (risingOver ? 0 : dip(fallAcross));
  if (fall >= 0) return fall - (risingOver ? dip(riseAcross) : 0);
  return -1.2;
}

/** The cloth's border stripe: undyed rows with a line of the dye through them. */
const BORDER_TOP = 44;
const BORDER_FOOT = 54;

/** A plain weave in the climate's dye with an undyed border stripe, faded in patches, worn through and frayed in a
 *  few places. */
function cloth(surf: Surface, mats: Materials, dye: string, seed: number): void {
  const index = mats.index;
  surf.each((x, y, i) => {
    const column = Math.floor(x + 0.5);
    const row = Math.floor(y + 0.5);
    const warpOver = ((column + row) & 1) === 0;
    const thread = warpOver ? hash01(seed, column, 1) : hash01(seed, row, 2);
    const border = row >= BORDER_TOP && row < BORDER_FOOT && Math.abs(row - (BORDER_TOP + BORDER_FOOT - 1) / 2) > 1.5;
    const fade = fbm(seed + 1, x, y, surf.width, surf.height, { cells: 3, octaves: 3 });
    const wear = fbm(seed + 2, x, y, surf.width, surf.height, { cells: 5, octaves: 3 });
    surf.material[i] = border ? index.parchment : index[dye];
    surf.tone[i] =
      (border ? 0.6 : 0.45) +
      (thread - 0.5) * 0.14 +
      (warpOver ? 0.04 : -0.04) +
      (fade - 0.5) * 0.1 +
      smooth(0.6, 0.8, fade) * 0.12 +
      speckle(seed, x, y) * 0.03;
    surf.relief[i] = 0.4 + thread * 0.3 + (warpOver ? 0.2 : 0);
    if (wear > 0.74 && hash01(seed + 3, column, row) < (wear - 0.74) * 3) {
      surf.material[i] = index.black;
      surf.tone[i] = 0.3;
      surf.relief[i] = -1;
    }
  });
  // loose threads lying over the weave where it frays
  const rng = stream(seed + 4);
  for (let k = 0; k < 14; k++) {
    const x = rng.next() * surf.width;
    const y = rng.next() * surf.height;
    const angle = rng.range(-0.5, 0.5) + (rng.next() < 0.5 ? 0 : Math.PI / 2);
    const len = rng.range(3, 6);
    const material = y >= BORDER_TOP && y < BORDER_FOOT ? index.parchment : index[dye];
    stroke(x, y, x + cos(angle) * len, y + sin(angle) * len, 0.7, 0.5, (placeX, placeY) =>
      surf.put(placeX, placeY, { material, tone: 0.62, relief: 1.2 }),
    );
  }
}

/** The rope's strands: one a 16 texels along the rising diagonal, so the lay meets the picture's edges. */
const STRAND = 16;

/** Rope: twisted strands laid on the diagonal, their coarse fibres running along the rope across them, and stray
 *  fibres standing off them. */
function rope(surf: Surface, mats: Materials, seed: number): void {
  const fibre = mats.index.thatch;
  const groove = mats.index['thatch:dim'];
  surf.each((x, y, i) => {
    const placeX = x + 0.5;
    const placeY = y + 0.5;
    const lay = placeX + placeY;
    const strand = Math.floor(lay / STRAND);
    const across = (lay - (strand + 0.5) * STRAND) / (STRAND / 2);
    const crown = dome(across, 0);
    const twist = fbm(seed + 1, x, y, surf.width, surf.height, { cells: 3, octaves: 3, aspect: 40 });
    const own = hash01(seed, wrap(strand, surf.width / STRAND)) - 0.5;
    if (crown < 0.3) {
      surf.material[i] = groove;
      surf.tone[i] = 0.15 + twist * 0.1;
      surf.relief[i] = crown * 2 - 1;
      return;
    }
    surf.material[i] = fibre;
    surf.tone[i] = 0.4 + crown * 0.2 + (twist - 0.5) * 0.9 + own * 0.1 + speckle(seed, x, y) * 0.05;
    surf.relief[i] = crown * 3 + (twist - 0.5) * 0.8;
  });
  const rng = stream(seed + 2);
  for (let k = 0; k < 30; k++) {
    const x = rng.next() * surf.width;
    const y = rng.next() * surf.height;
    const angle = rng.range(-0.3, 0.3);
    const len = rng.range(2, 4);
    stroke(x, y, x + cos(angle) * len, y + sin(angle) * len, 0.6, 0.4, (placeX, placeY) =>
      surf.put(placeX, placeY, { material: fibre, tone: 0.72, relief: 2.6 }),
    );
  }
}

/** Ore in its rock: dark hewn rock, two black coal seams broken along their cleat, and the climate's ore in a vein
 *  and in glinting clusters. */
function ore(surf: Surface, mats: Materials, rock: RockLook, seed: number): void {
  const index = mats.index;
  const metal = index[rock.vein];
  hewn(surf, { material: index[`${rock.floor}:dim`], seed, across: 7, down: 7, marks: 10, depth: 1.4, base: 0.45 });
  const rng = stream(seed + 1);
  for (let seam = 0; seam < 2; seam++) {
    const middle = rng.next() * surf.height;
    const thick = rng.range(4, 7);
    surf.each((x, y, i) => {
      const wave = (fbm(seed + 2 + seam, x, y, surf.width, surf.height, { cells: 2, octaves: 3 }) - 0.5) * 10;
      const offset = wrap(y + 0.5 - middle - wave + surf.height / 2, surf.height) - surf.height / 2;
      const swell = thick * (0.7 + fbm(seed + 4 + seam, x, y, surf.width, surf.height, { cells: 3, octaves: 2 }) * 0.6);
      if (Math.abs(offset) > swell / 2) return;
      const block = Math.floor(wrap(x + 0.5, surf.width) / 4);
      surf.material[i] = index.black;
      surf.tone[i] = 0.3 + hash01(seed + 6, block, seam) * 0.4 + speckle(seed, x, y) * 0.08;
      surf.relief[i] = -0.6 + hash01(seed + 5, block, seam) * 0.4;
    });
  }
  veins(surf, { material: metal, seed: seed + 7, count: 2, steps: 34, wide: 1.4, angle: rng.range(0.3, 1.2) });
  for (let k = 0; k < 36; k++) {
    const x = rng.next() * surf.width;
    const y = rng.next() * surf.height;
    const radius = rng.range(0.9, 2);
    ellipse(x, y, radius, radius * rng.range(0.6, 1), (placeX, placeY, relU, relV) => {
      const i = surf.idx(placeX, placeY);
      surf.material[i] = metal;
      surf.tone[i] = 0.55 + dome(relU, relV) * 0.25 + hash01(seed + 8, placeX, placeY) * 0.1;
      surf.relief[i] += 0.5;
    });
    surf.put(x, y, { material: metal, tone: 1, bump: 0.6 });
  }
}

/** Worn gilt brass: hammered into facets, each tilted its own way so the light finds it, a slow sheen across them,
 *  tarnish dark in patches of the hollows where they meet, and a few bright scratches. */
function brass(surf: Surface, mats: Materials, seed: number): void {
  const index = mats.index;
  surf.each((x, y, i) => {
    const cell = worley(seed, x + 0.5, y + 0.5, surf.width, surf.height, 6, 6, 0.9);
    const rim = clamp01((2 * cell.nearest) / Math.max(0.5, cell.nearest + cell.second));
    const slopeX = (hash01(seed, cell.id, 1) - 0.5) * 0.7;
    const slopeY = (hash01(seed, cell.id, 2) - 0.5) * 0.7;
    const sheen = sin((Math.PI * 2 * (x + y)) / surf.width);
    const dirt = fbm(seed + 2, x, y, surf.width, surf.height, { cells: 4, octaves: 3 });
    const tarnish = smooth(0.4, 0.65, dirt) * smooth(0.6, 1, rim);
    surf.material[i] = index.gold;
    surf.tone[i] =
      0.55 + sheen * 0.12 + (hash01(seed, cell.id, 3) - 0.5) * 0.12 - tarnish * 0.3 + speckle(seed, x, y) * 0.03;
    surf.relief[i] = slopeX * (x + 0.5 - cell.pointX) + slopeY * (y + 0.5 - cell.pointY) - rim * rim * 0.25;
  });
  const rng = stream(seed + 3);
  for (let k = 0; k < 10; k++) {
    const x = rng.next() * surf.width;
    const y = rng.next() * surf.height;
    const angle = rng.next() * Math.PI;
    const len = rng.range(4, 10);
    stroke(x, y, x + cos(angle) * len, y + sin(angle) * len, 0.6, 0.6, (placeX, placeY) =>
      surf.nudge(placeX, placeY, 0.2),
    );
  }
}
