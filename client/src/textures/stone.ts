// Stone and its kin: mottled plain surfaces, coursed blocks, rubble and cobbles, herringbone brick, flecked granite,
// crag, marble and tiles. Each paints a box of a surface (all of it by default) from periodic noise over the whole
// surface, so a wall or a floor tiles with no seam. Light is laid later.
import { clamp01, fbm, hash01, ridged, smooth, speckle, stream, worley, wrap, type Stream } from './noise.ts';
import { hypot, pow, sin } from './portableMath.ts';
import { areaOf, type Box, type Surface } from './surface.ts';

/** Which places a painter may paint; a painter given none paints them all. */
export type Mask = (x: number, y: number) => boolean;

/** A plain material: `amp` the tone's swing over patches `cells` across, `fine` its clumped grain and `texel` its
 *  texel-by-texel grain, `bump` the relief's swing about `lift`. */
export interface MottleOptions {
  material: number;
  seed?: number;
  mask?: Mask;
  cells?: number;
  octaves?: number;
  base?: number;
  amp?: number;
  fine?: number;
  texel?: number;
  lift?: number;
  bump?: number;
}

/** A plain material with mottled tone and soft lumps. */
export function mottle(surf: Surface, options: MottleOptions, box?: Box): void {
  const area = areaOf(surf, box);
  const seed = options.seed ?? 1;
  surf.each(
    (x, y, i) => {
      if (options.mask && !options.mask(x, y)) return;
      const n = fbm(seed, x, y, surf.width, surf.height, { cells: options.cells ?? 3, octaves: options.octaves ?? 5 });
      surf.material[i] = options.material;
      surf.tone[i] =
        (options.base ?? 0.5) +
        (n - 0.5) * 2 * (options.amp ?? 0.18) +
        speckle(seed, x, y) * (options.fine ?? 0.04) +
        (hash01(seed + 9, x, y) - 0.5) * 2 * (options.texel ?? 0);
      surf.relief[i] = (options.lift ?? 0) + (n - 0.5) * (options.bump ?? 0.6);
    },
    area.x0,
    area.y0,
    area.x1,
    area.y1,
  );
}

/** One row's joints across a width: places in [0, width) where a block starts, from widths in [least, most]. */
function rowJoints(rng: Stream, width: number, least: number, most: number, offset: number): number[] {
  const joints: number[] = [];
  let place = offset;
  while (place < offset + width - least * 0.6) {
    joints.push(wrap(place, width));
    place += least + rng.next() * (most - least);
  }
  return joints.sort((a, b) => a - b);
}

/** A stone's face: a cloudy interior (`amp`, patches about `patch` texels across), its own tone (`toneVar` about
 *  `base`), clumped grain (`fine`) and a share of single light or dark specks (`specks`). */
export interface FaceOptions {
  patch?: number;
  base?: number;
  toneVar?: number;
  amp?: number;
  fine?: number;
  specks?: number;
}

/** A stone's tone at a place; the stone's volume, which the light reads, is the caller's. */
function stoneFace(surf: Surface, options: FaceOptions, seed: number, id: number, x: number, y: number): number {
  const patch = options.patch ?? 6;
  const cells = Math.max(2, Math.round(surf.width / patch));
  const cloud = fbm(seed + id * 13, x, y, surf.width, surf.height, { cells, octaves: 3, gain: 0.55 });
  let tone =
    (options.base ?? 0.52) +
    (hash01(seed, id, 1) - 0.5) * 2 * (options.toneVar ?? 0.1) +
    (cloud - 0.5) * 2 * (options.amp ?? 0.3);
  tone += speckle(seed + 1, x, y) * (options.fine ?? 0.03);
  const speck = hash01(seed + 2, x, y);
  if (speck < (options.specks ?? 0.012)) tone += speck < (options.specks ?? 0.012) / 2 ? 0.28 : -0.28;
  return tone;
}

/**
 * The light a painter bakes into an element's edges, lit from the top left: its top `top` texels bright, its foot
 * `foot` texels dark, its left a little bright and its right a little dark, by distance in texels from each edge.
 */
export function edgeLight(
  toTop: number,
  toBottom: number,
  toLeft: number,
  toRight: number,
  k = 1,
  top = 1.6,
  foot = 2.4,
): number {
  return (
    k *
    (0.26 * (1 - smooth(0, top, toTop)) -
      0.3 * (1 - smooth(0, foot, toBottom)) +
      0.1 * (1 - smooth(0, top, toLeft)) -
      0.14 * (1 - smooth(0, foot, toRight)))
  );
}

/** Blocks and rubble set in mortar: `gap` texels of `mortar` toned `mortarTone`, edges rounded over `bevel` texels
 *  and raised by `relief`, `dome` how far a face bows, `edge` the baked edge light. */
export interface MasonryOptions extends FaceOptions {
  material: number;
  mortar?: number;
  mortarTone?: number;
  seed?: number;
  gap?: number;
  bevel?: number;
  relief?: number;
  dome?: number;
  edge?: number;
}

/** Coursed blocks: `rows` courses, block widths in `widths`, corners rounded by `round`; `rough` jags the joints,
 *  `bond` 'random' sets each course's joints apart from its neighbours'. */
export interface BlockOptions extends MasonryOptions {
  rows?: number;
  widths?: readonly [number, number];
  round?: number;
  bond?: 'random';
  rough?: number;
  bump?: number;
}

/** Coursed blocks, each a pillow whose light runs from its lit top left to its shaded foot, with a stone's face. */
export function blocks(surf: Surface, options: BlockOptions, box?: Box): void {
  const area = areaOf(surf, box);
  const fullW = area.x1 - area.x0;
  const fullH = area.y1 - area.y0;
  const seed = options.seed ?? 11;
  const rows = options.rows ?? 4;
  const rowH = fullH / rows;
  const [minW, maxW] = options.widths ?? [fullW / 3, fullW / 2];
  const gap = options.gap ?? 1;
  const bevel = options.bevel ?? 2;
  const round = options.round ?? 1.5;
  const courses: number[][] = [];
  for (let k = 0; k < rows; k++) {
    const rng = stream(seed + k * 977);
    const offset = options.bond === 'random' ? rng.next() * maxW : (k % 2) * ((minW + maxW) / 4) + rng.next() * 2;
    courses.push(rowJoints(rng, fullW, minW, maxW, offset));
  }
  surf.each(
    (x, y, i) => {
      const placeX = x - area.x0 + 0.5;
      const placeY = y - area.y0 + 0.5;
      const jag = options.rough
        ? (fbm(seed + 5, x, y, surf.width, surf.height, { cells: 8, octaves: 2 }) - 0.5) * options.rough * 2
        : 0;
      const course = Math.floor((placeY + jag) / rowH);
      const yIn = placeY + jag - course * rowH;
      const k = wrap(course, rows);
      const joints = courses[k];
      let left = -Infinity;
      let right = Infinity;
      let blockK = 0;
      const jagX = placeX + jag * 0.7;
      for (let j = 0; j < joints.length; j++) {
        const start = joints[j];
        const end = j + 1 < joints.length ? joints[j + 1] : joints[0] + fullW;
        const along = jagX < start ? jagX + fullW : jagX;
        if (along >= start && along < end) {
          left = along - start;
          right = end - along;
          blockK = j;
          break;
        }
      }
      if (left === -Infinity) {
        const start = joints[joints.length - 1] - fullW;
        left = jagX - start;
        right = joints[0] - jagX;
        blockK = joints.length - 1;
      }
      const toSide = Math.min(left, right);
      const toCourse = Math.min(yIn, rowH - yIn);
      let inset = Math.min(toSide, toCourse);
      const cornerR = round + gap * 0.5;
      if (round > 0 && toSide < cornerR && toCourse < cornerR)
        inset = Math.min(inset, cornerR - hypot(cornerR - toSide, cornerR - toCourse));
      const id = k * 64 + blockK;
      if (inset < gap * 0.5) {
        surf.material[i] = options.mortar ?? options.material;
        surf.tone[i] = (options.mortarTone ?? 0.32) + speckle(seed + 3, x, y) * 0.05 - (yIn < rowH / 2 ? 0.12 : 0);
        surf.relief[i] = -0.5;
        return;
      }
      const boardW = left + right;
      const relU = left / boardW;
      const relV = yIn / rowH;
      const pillow = pow(sin(Math.PI * relU), 0.35) * pow(sin(Math.PI * relV), 0.35);
      const rim = smooth(gap * 0.5, gap * 0.5 + bevel, inset);
      surf.material[i] = options.material;
      surf.tone[i] =
        stoneFace(surf, options, seed, id, x, y) +
        edgeLight(yIn - gap * 0.5, rowH - yIn - gap * 0.5, left - gap * 0.5, right - gap * 0.5, options.edge ?? 1);
      surf.relief[i] =
        rim * (options.relief ?? 1.5) +
        pillow * (options.dome ?? 0.3) * Math.min(boardW, rowH) * 0.5 +
        (fbm(seed + id * 5, x, y, surf.width, surf.height, { cells: 8, octaves: 2 }) - 0.5) * (options.bump ?? 0.6);
    },
    area.x0,
    area.y0,
    area.x1,
    area.y1,
  );
}

/** Rubble or cobbles: `across` by `down` cells over the surface, `warp` bending their outlines; `flat` lays
 *  flagstones, no dome and thin dark joints. */
export interface RubbleOptions extends MasonryOptions {
  across?: number;
  down?: number;
  warp?: number;
  jitter?: number;
  flat?: boolean;
  mask?: Mask;
}

/** Rubble or cobbles: irregular stones, each domed over its own breadth so it is lit from highlight to shadow. */
export function rubble(surf: Surface, options: RubbleOptions, box?: Box): void {
  const area = areaOf(surf, box);
  const seed = options.seed ?? 21;
  const across = options.across ?? 6;
  const down = options.down ?? 6;
  const gap = options.gap ?? 1.4;
  surf.each(
    (x, y, i) => {
      const warpX =
        x + (fbm(seed + 1, x, y, surf.width, surf.height, { cells: 4, octaves: 2 }) - 0.5) * (options.warp ?? 4);
      const warpY =
        y + (fbm(seed + 2, x, y, surf.width, surf.height, { cells: 4, octaves: 2 }) - 0.5) * (options.warp ?? 4);
      const wrapX = wrap(warpX, surf.width);
      const wrapY = wrap(warpY, surf.height);
      const cell = worley(seed, wrapX, wrapY, surf.width, surf.height, across, down, options.jitter ?? 0.9);
      const inset = (cell.second - cell.nearest) * 0.5;
      if (inset < gap * 0.5) {
        surf.material[i] = options.mortar ?? options.material;
        surf.tone[i] = (options.mortarTone ?? 0.25) + speckle(seed, x, y) * 0.05;
        surf.relief[i] = -0.5;
        return;
      }
      const reach = cell.nearest + inset;
      const relU = clamp01(cell.nearest / reach);
      const dome = options.flat ? 0 : Math.sqrt(Math.max(0, 1 - relU * relU)) * reach * (options.dome ?? 0.6);
      surf.material[i] = options.material;
      const normX = (wrapX + 0.5 - cell.pointX) / reach;
      const normY = (wrapY + 0.5 - cell.pointY) / reach;
      const baked = options.flat
        ? 0
        : (-(normX * -0.55 + normY * -0.7) * 0.32 - Math.max(0, relU - 0.7) * 0.5) * (options.edge ?? 1);
      surf.tone[i] = stoneFace(surf, { toneVar: 0.14, amp: 0.25, ...options }, seed, cell.id, x, y) + baked;
      surf.relief[i] = smooth(gap * 0.5, gap * 0.5 + (options.bevel ?? 1.5), inset) * (options.relief ?? 1) + dome;
    },
    area.x0,
    area.y0,
    area.x1,
    area.y1,
  );
}

/** Herringbone brick: courses `rowHigh` texels high whose bricks, `brickLen` long, slant one way then the other. */
export interface HerringboneOptions extends MasonryOptions {
  rowHigh: number;
  brickLen: number;
  slant: number;
}

/** Herringbone brick: the joints run in chevrons; each brick takes its own tone and the baked edge light. */
export function herringbone(surf: Surface, options: HerringboneOptions, box?: Box): void {
  const area = areaOf(surf, box);
  const seed = options.seed ?? 33;
  const { rowHigh, brickLen, slant } = options;
  const gap = options.gap ?? 0.9;
  surf.each(
    (x, y, i) => {
      const placeX = x - area.x0 + 0.5;
      const placeY = y - area.y0 + 0.5;
      const k = Math.floor(placeY / rowHigh);
      const rowY = placeY - k * rowHigh;
      const dir = k % 2 ? 1 : -1;
      const along = placeX + dir * rowY * slant + k * 3.7;
      const j = Math.floor(along / brickLen);
      const alongBrick = along - j * brickLen;
      const acrossBrick = Math.min(alongBrick, brickLen - alongBrick) / Math.sqrt(1 + slant * slant);
      const inset = Math.min(acrossBrick, rowY, rowHigh - rowY);
      if (inset < gap * 0.5) {
        surf.material[i] = options.mortar ?? options.material;
        surf.tone[i] = (options.mortarTone ?? 0.3) + speckle(seed, x, y) * 0.05;
        surf.relief[i] = -0.4;
        return;
      }
      const id = k * 97 + j;
      surf.material[i] = options.material;
      surf.tone[i] =
        stoneFace(surf, { toneVar: 0.12, amp: 0.2, patch: 4, ...options }, seed, id, x, y) +
        edgeLight(
          rowY - gap * 0.5,
          rowHigh - rowY - gap * 0.5,
          alongBrick - gap * 0.5,
          brickLen - alongBrick - gap * 0.5,
          options.edge ?? 0.8,
        );
      surf.relief[i] = smooth(gap * 0.5, gap * 0.5 + 1.2, inset) * (options.relief ?? 1);
    },
    area.x0,
    area.y0,
    area.x1,
    area.y1,
  );
}

/**
 * Grains of material `to` through material `from`: about `share` of its places, in clusters about `size` texels
 * across with single grains between, as granite's mixed stone. Keeps each place's tone and relief.
 */
export function fleck(
  surf: Surface,
  options: { from: number; to: number; share: number; size: number; seed: number },
): void {
  const seed = options.seed;
  const across = Math.max(2, Math.round(surf.width / options.size));
  const down = Math.max(2, Math.round(surf.height / options.size));
  surf.each((x, y, i) => {
    if (surf.material[i] !== options.from) return;
    const cell = worley(seed, x + 0.5, y + 0.5, surf.width, surf.height, across, down);
    // a sum of two evens is no longer even: square-root its lower half so `share` holds
    const sum = 0.5 * hash01(seed + 1, cell.id) + 0.5 * hash01(seed + 2, x, y);
    const even = sum < 0.5 ? 2 * sum * sum : 1 - 2 * (1 - sum) * (1 - sum);
    if (even < options.share) surf.material[i] = options.to;
  });
}

/** Crag: creases about `cells` across and `rows` down, `sharp` thinning them, `amp` their light, `cloud` the face's
 *  slow swing and `relief` how far they stand. */
export interface CragOptions {
  material: number;
  seed: number;
  cells: number;
  rows: number;
  sharp: number;
  amp: number;
  cloud: number;
  relief: number;
  mask: Mask;
}

/** Crag: rock read as a mesh of thin light creases on a dark face, wandering off their rows so they break and cross. */
export function crag(surf: Surface, options: CragOptions): void {
  const seed = options.seed;
  const warp = 3;
  surf.each((x, y, i) => {
    if (!options.mask(x, y)) return;
    const warpX = x + (fbm(seed + 11, x, y, surf.width, surf.height, { cells: 6, octaves: 2 }) - 0.5) * 2 * warp;
    const warpY = y + (fbm(seed + 12, x, y, surf.width, surf.height, { cells: 6, octaves: 2 }) - 0.5) * 2 * warp;
    const coarse = ridged(seed, warpX, warpY, surf.width, surf.height, {
      cells: options.cells,
      aspect: options.rows,
      octaves: 3,
      gain: 0.55,
    });
    const fine = ridged(seed + 5, warpX, warpY, surf.width, surf.height, {
      cells: options.cells * 2,
      aspect: options.rows,
      octaves: 2,
    });
    const line = pow(Math.max(coarse, fine * 0.92), options.sharp);
    const cloud = fbm(seed + 9, x, y, surf.width, surf.height, { cells: 3, octaves: 3 });
    surf.material[i] = options.material;
    surf.tone[i] = 0.4 + line * options.amp + (cloud - 0.5) * options.cloud + (hash01(seed + 3, x, y) - 0.5) * 0.08;
    surf.relief[i] = line * options.relief + (cloud - 0.5) * 0.6;
  });
}
