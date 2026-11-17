// Boards and roofing: planks, riveted plates, straw and thatch, slates and clay barrel tiles. Each paints a box of a
// surface (all of it by default) from periodic noise, so it tiles with no seam.
import { fbm, hash01, smooth, speckle, stream, wrap } from './noise.ts';
import { hypot, pow, sin } from './portableMath.ts';
import { edgeLight } from './stone.ts';
import { areaOf, type Box, type Surface } from './surface.ts';

/** Boards: `count` laid `dir` 'h' (rows) or 'v' (columns), `gap` texels of `gapMaterial` toned `gapTone` between
 *  them; a butt joint across each board, every third board's only with `joints` 'few', none with false; `knots` the
 *  grain bends round, `grain` its dark lines, `crown` how far a board bows, `edge` the baked edge light. */
export interface PlankOptions {
  material: number;
  seed: number;
  dir: 'h' | 'v';
  count: number;
  joints?: false | 'few';
  gap?: number;
  gapMaterial?: number;
  gapTone?: number;
  base?: number;
  toneVar?: number;
  amp?: number;
  grain?: number;
  knots?: number;
  crown?: number;
  edge?: number;
}

/** Boards with grain streaking along them, bent round their knots, each board its own tone. */
export function planks(surf: Surface, options: PlankOptions, box?: Box): void {
  const area = areaOf(surf, box);
  const seed = options.seed;
  const vertical = options.dir === 'v';
  const span = vertical ? area.x1 - area.x0 : area.y1 - area.y0;
  const run = vertical ? area.y1 - area.y0 : area.x1 - area.x0;
  const count = options.count;
  const boardW = span / count;
  const gap = options.gap ?? 1;
  const edge = options.edge ?? 1;
  const knots: [number, number, number][] = [];
  const rng = stream(seed + 99);
  for (let k = 0; k < (options.knots ?? 2); k++)
    knots.push([
      area.x0 + rng.next() * (area.x1 - area.x0),
      area.y0 + rng.next() * (area.y1 - area.y0),
      1.2 + rng.next() * 1.8,
    ]);
  surf.each(
    (x, y, i) => {
      const across = vertical ? x - area.x0 + 0.5 : y - area.y0 + 0.5;
      const along = vertical ? y - area.y0 + 0.5 : x - area.x0 + 0.5;
      const k = Math.min(count - 1, Math.floor(across / boardW));
      const inBoard = across - k * boardW;
      const jointAt =
        options.joints === false ? -1 : wrap(stream(seed + k * 31).next() * run + (k % 2) * run * 0.5, run);
      const few = options.joints === 'few' && k % 3 !== 1;
      const toJoint =
        jointAt < 0 || few ? Infinity : Math.min(Math.abs(along - jointAt), run - Math.abs(along - jointAt));
      const segment = jointAt >= 0 && wrap(along - jointAt, run) < run / 2 ? 1 : 0;
      const id = k * 2 + segment;
      if (inBoard < gap || toJoint < 0.6) {
        surf.material[i] = options.gapMaterial ?? options.material;
        surf.tone[i] = options.gapTone ?? 0.08;
        surf.relief[i] = -0.4;
        return;
      }
      const crossing = (inBoard - gap) / (boardW - gap);
      // the grain streaks along the board, warped by a slow wave and bent around the knots
      let grainAt = vertical ? x : y;
      for (const [knotX, knotY, knotR] of knots) {
        const dist = hypot(x - knotX, (y - knotY) * (vertical ? 0.35 : 1) * (vertical ? 1 : 2.8));
        if (dist < knotR * 4) grainAt += (knotR * 4 - dist) * 0.35 * Math.sign((vertical ? x - knotX : y - knotY) || 1);
      }
      const warp = fbm(seed + 3, x, y, surf.width, surf.height, { cells: 2, octaves: 2 }) * 5;
      const lines = Math.abs(sin((grainAt + warp + id * 1.7) * 1.9));
      const streak = vertical
        ? fbm(seed + id, x, y * 0.2, surf.width, surf.height, { cells: 8, octaves: 3, aspect: 1 })
        : fbm(seed + id, x * 0.2, y, surf.width, surf.height, { cells: 1, octaves: 3, aspect: 8 });
      let tone =
        (options.base ?? 0.5) +
        (hash01(seed, id, 4) - 0.5) * 2 * (options.toneVar ?? 0.1) +
        (streak - 0.5) * (options.amp ?? 0.35) -
        (lines > 0.93 ? (options.grain ?? 0.16) : 0) +
        speckle(seed, x, y) * 0.03;
      for (const [knotX, knotY, knotR] of knots) {
        const dist = hypot(x - knotX, (y - knotY) * (vertical ? 0.6 : 1.6));
        if (dist < knotR) tone -= 0.22 * (1 - dist / knotR);
        else if (dist < knotR + 1.2) tone -= 0.08;
      }
      surf.material[i] = options.material;
      const toLeft = jointAt < 0 || few ? Infinity : wrap(along - jointAt, run);
      const toRight = jointAt < 0 || few ? Infinity : wrap(jointAt - along, run);
      tone += vertical
        ? edgeLight(Infinity, Infinity, inBoard - gap, boardW - inBoard, edge) +
          edgeLight(toLeft - 0.6, toRight - 0.6, Infinity, Infinity, edge * 0.6)
        : edgeLight(inBoard - gap, boardW - inBoard, toLeft - 0.6, toRight - 0.6, edge);
      surf.tone[i] = tone;
      surf.relief[i] =
        sin(crossing * Math.PI) * (options.crown ?? 0.7) + smooth(0, 1.2, Math.min(inBoard - gap, toJoint)) * 0.4;
    },
    area.x0,
    area.y0,
    area.x1,
    area.y1,
  );
}

/** Metal plates with rivets: `across` by `down` plates, each a little raised, rivets along its edges. */
export function plates(
  surf: Surface,
  options: { material: number; across: number; down: number; seed: number; base: number },
  box?: Box,
): void {
  const area = areaOf(surf, box);
  const seed = options.seed;
  const plateW = (area.x1 - area.x0) / options.across;
  const plateH = (area.y1 - area.y0) / options.down;
  const rivetGap = 5;
  surf.each(
    (x, y, i) => {
      const placeX = x - area.x0 + 0.5;
      const placeY = y - area.y0 + 0.5;
      const column = Math.floor(placeX / plateW);
      const row = Math.floor(placeY / plateH);
      const inX = placeX - column * plateW;
      const inY = placeY - row * plateH;
      const inset = Math.min(inX, plateW - inX, inY, plateH - inY);
      const id = row * 16 + column;
      const n = fbm(seed + id, x, y, surf.width, surf.height, { cells: 5, octaves: 4 });
      surf.material[i] = options.material;
      if (inset < 0.9) {
        surf.tone[i] = 0.12;
        surf.relief[i] = -0.3;
        return;
      }
      surf.tone[i] = options.base + (hash01(seed, id) - 0.5) * 0.16 + (n - 0.5) * 0.3 + speckle(seed, x, y) * 0.04;
      surf.relief[i] = smooth(0.9, 2.5, inset) * 1.2 + (n - 0.5) * 0.3;
      const onEdge = Math.abs(inset - 2.6) < 0.8;
      const atRivet =
        Math.abs(((inX + inY) % rivetGap) - rivetGap / 2) < 0.8 ||
        (inX < 4 && inY < 4) ||
        (plateW - inX < 4 && inY < 4);
      if (onEdge && atRivet) {
        surf.tone[i] = 0.7;
        surf.relief[i] += 1;
      }
    },
    area.x0,
    area.y0,
    area.x1,
    area.y1,
  );
}

/** Straw: thatch's fine strands running down, about `strands` across and `rows` down, laid in courses `course`
 *  texels deep, each course's head in the shadow of the one above (`seam`); `amp` the strands' light. */
export function straw(
  surf: Surface,
  options: {
    material: number;
    seed: number;
    strands: number;
    rows: number;
    course: number;
    seam: number;
    amp?: number;
  },
): void {
  const seed = options.seed;
  const course = options.course;
  surf.each((x, y, i) => {
    const strand = fbm(seed, x, y, surf.width, surf.height, {
      cells: options.strands,
      aspect: options.rows,
      octaves: 3,
      gain: 0.6,
    });
    const slow = fbm(seed + 1, x, y, surf.width, surf.height, { cells: 3, octaves: 2 });
    const depth = wrap(y, course) / course;
    const seam = pow(1 - depth, 5) * options.seam;
    surf.material[i] = options.material;
    surf.tone[i] =
      0.5 + (strand - 0.5) * (options.amp ?? 0.8) + (slow - 0.5) * 0.2 - seam + (hash01(seed + 2, x, y) - 0.5) * 0.06;
    surf.relief[i] = (strand - 0.5) * 0.8 - seam * 3;
  });
}

/** Slates: `rows` rows of `perRow`, every other row offset half a slate, each foot rounded by `round`; below that
 *  curve the next row's head shows, shadowed. `shadow` darkens a slate toward its head, `relief` raises its foot. */
export function shingles(
  surf: Surface,
  options: {
    material: number;
    seed: number;
    rows: number;
    perRow: number;
    round: number;
    relief: number;
    base: number;
    shadow: number;
    amp: number;
  },
): void {
  const seed = options.seed;
  const rowHigh = surf.height / options.rows;
  const tileW = surf.width / options.perRow;
  surf.each((x, y, i) => {
    const placeX = x + 0.5;
    const placeY = y + 0.5;
    const k = Math.floor(placeY / rowHigh);
    const shifted = wrap(placeX + (k % 2) * tileW * 0.5, surf.width);
    const column = Math.floor(shifted / tileW);
    const relU = (shifted - column * tileW) / tileW;
    const relV = (placeY - k * rowHigh) / rowHigh;
    const centred = 2 * relU - 1;
    const curve = Math.sqrt(Math.max(0, 1 - centred * centred));
    const foot = 1 - options.round * (1 - curve);
    const edge = Math.min(relU, 1 - relU) * tileW;
    surf.material[i] = options.material;
    if (relV > foot || edge < 0.5) {
      surf.tone[i] = 0.12 + speckle(seed, x, y) * 0.04;
      surf.relief[i] = -0.5;
      return;
    }
    const id = k * 64 + column;
    const n = fbm(seed + id, x, y, surf.width, surf.height, { cells: 6, octaves: 3 });
    surf.tone[i] =
      options.base +
      (hash01(seed, id) - 0.5) * 2 * 0.1 +
      (n - 0.5) * options.amp -
      (1 - relV) * options.shadow +
      speckle(seed, x, y) * 0.05;
    surf.relief[i] = relV * options.relief + curve * 0.8 + (n - 0.5) * 0.4;
  });
}

/** Clay barrel tiles: `cols` columns of half-round tiles `relief` round, in `rows` rows, each tile's round foot
 *  (`lobe`, a share of a row) hanging over the row below, whose shadowed head takes `gapMaterial`. */
export function barrelTiles(
  surf: Surface,
  options: {
    material: number;
    gapMaterial: number;
    seed: number;
    rows: number;
    cols: number;
    base: number;
    relief: number;
    lobe: number;
  },
): void {
  const seed = options.seed;
  const cellW = surf.width / options.cols;
  const rowHigh = surf.height / options.rows;
  surf.each((x, y, i) => {
    const placeX = x + 0.5;
    const placeY = y + 0.5;
    const column = Math.floor(placeX / cellW);
    const relU = (placeX - column * cellW) / cellW;
    let k = Math.floor(placeY / rowHigh);
    let relV = (placeY - k * rowHigh) / rowHigh;
    const centred = 2 * relU - 1;
    const roll = Math.sqrt(Math.max(0, 1 - centred * centred));
    // each tile's round foot hangs over the head of the row below; between the feet, that row's head lies in shadow
    const under = relV < options.lobe * roll;
    if (under) {
      k -= 1;
      relV += 1;
    }
    const id = wrap(k, options.rows) * 64 + column;
    const shadow = !under && relV < options.lobe + 0.1;
    const n = fbm(seed + id, x, y, surf.width, surf.height, { cells: 6, octaves: 3 });
    surf.material[i] = shadow ? options.gapMaterial : options.material;
    surf.tone[i] =
      options.base +
      (hash01(seed, id) - 0.5) * 0.2 +
      (n - 0.5) * 0.2 -
      (shadow ? 0.25 : 0) +
      speckle(seed, x, y) * 0.04;
    surf.relief[i] = roll * options.relief + relV * 0.8 + (n - 0.5) * 0.4;
  });
}
