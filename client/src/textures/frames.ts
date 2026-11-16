// The parts a face carries over its material: timber frames, corner stones, bands, pillars, frames, runes, shelves
// and carved faces. Each draws in the same layers the materials use, so one light falls on wall and part alike.
// Sizes are in texels.
import { fbm, hash01, smooth, speckle, stream, type Stream } from './noise.ts';
import { atan2, exp, hypot, sin } from './portableMath.ts';
import { blocks, type BlockOptions } from './stone.ts';
import { box, ellipse, stroke, type Surface } from './surface.ts';

/** A timber's material and grain: `base` its tone, `lift` how far it stands from the wall. */
export interface BeamOptions {
  material: number;
  seed: number;
  base: number;
  lift: number;
}

/** A straight beam `w` texels wide: grain along it, edges rounded. */
export function beam(
  surf: Surface,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  w: number,
  options: BeamOptions,
): void {
  const seed = options.seed;
  const len = hypot(toX - fromX, toY - fromY);
  stroke(fromX, fromY, toX, toY, w, w, (x, y, along, across) => {
    const grain = fbm(seed, Math.floor(along * len * 0.25) + across * 6, across * 4 + 3, 64, 64, {
      cells: 8,
      octaves: 3,
    });
    const line = Math.abs(sin((across * w * 1.7 + grain * 4) * 1.3)) > 0.92 ? -0.12 : 0;
    surf.put(x, y, {
      material: options.material,
      tone: options.base + (grain - 0.5) * 0.35 + line + speckle(seed, x, y) * 0.04,
      relief: options.lift + (1 - across * across) * 1.2,
    });
  });
}

/** Points along a curve from one end to the other bowing outward by `bow` (0 straight, 1 a quarter circle). */
function arcPoints(fromX: number, fromY: number, toX: number, toY: number, bow: number, steps: number): number[][] {
  const points: number[][] = [];
  const centreX = (fromX + toX) / 2;
  const centreY = (fromY + toY) / 2;
  const normX = -(toY - fromY);
  const normY = toX - fromX;
  const len = hypot(normX, normY) || 1;
  const midX = centreX + (normX / len) * bow * len * 0.25;
  const midY = centreY + (normY / len) * bow * len * 0.25;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push([
      (1 - t) * (1 - t) * fromX + 2 * (1 - t) * t * midX + t * t * toX,
      (1 - t) * (1 - t) * fromY + 2 * (1 - t) * t * midY + t * t * toY,
    ]);
  }
  return points;
}

/**
 * A timber frame: `posts` at x places, `rails` at y places, `braces` as [fromX, fromY, toX, toY, bow] each, `w` the
 * timbers' width. A post at x 0 straddles the picture's edge, so walls set side by side share it.
 */
export function timberFrame(
  surf: Surface,
  options: {
    material: number;
    base: number;
    w: number;
    posts: readonly number[];
    rails: readonly number[];
    braces?: readonly (readonly number[])[];
  },
): void {
  const w = options.w;
  const timber = { material: options.material, seed: 311, base: options.base, lift: 2 };
  for (const y of options.rails) beam(surf, -2, y, surf.width + 2, y, w, timber);
  for (const brace of options.braces ?? []) {
    const points = arcPoints(brace[0], brace[1], brace[2], brace[3], brace[4], 16);
    for (let k = 0; k + 1 < points.length; k++)
      beam(surf, points[k][0], points[k][1], points[k + 1][0], points[k + 1][1], w + 1, {
        ...timber,
        seed: timber.seed + 7 + k,
      });
  }
  for (const x of options.posts) {
    beam(surf, x, -2, x, surf.height + 2, w, { ...timber, seed: timber.seed + x });
    if (x <= w / 2)
      beam(surf, x + surf.width, -2, x + surf.width, surf.height + 2, w, { ...timber, seed: timber.seed + x });
  }
}

/** Corner stones up the left side: alternating long and short dressed blocks, `w` texels wide at the long ones and
 *  about `tall` high, standing proud of the wall, set in `mortar`. */
export function quoins(
  surf: Surface,
  options: { material: number; mortar: number; w: number; tall: number; base: number },
): void {
  const seed = 321;
  const gap = 1;
  const rows = Math.round(surf.height / options.tall);
  const rowHigh = surf.height / rows;
  for (let k = 0; k < rows; k++) {
    const quoinW = k % 2 === 0 ? options.w : Math.round(options.w * 0.6);
    const top = k * rowHigh;
    const bottom = (k + 1) * rowHigh;
    const toneShift = (hash01(seed, k) - 0.5) * 0.12;
    box(0, top, quoinW, bottom, (x, y) => {
      const inset = Math.min(x - 0 + 0.5, quoinW - x - 0.5, y - top + 0.5, bottom - y - 0.5);
      if (inset < gap * 0.6) {
        surf.put(x, y, { material: options.mortar, tone: 0.2, relief: 0 });
        return;
      }
      const n = fbm(seed + k, x, y, surf.width, surf.height, { cells: 8, octaves: 3 });
      surf.put(x, y, {
        material: options.material,
        tone: options.base + toneShift + (n - 0.5) * 0.3 + speckle(seed, x, y) * 0.05,
        relief: 2.2 + smooth(0, 2, inset) * 1.4 + (n - 0.5) * 0.6,
      });
    });
  }
}

/** A horizontal band from `top` to `bottom` (a cornice, a plinth, a string course): a rounded moulding `relief`
 *  high. */
export function band(
  surf: Surface,
  top: number,
  bottom: number,
  options: { material: number; base: number; relief: number },
): void {
  const seed = 331;
  box(0, top, surf.width, bottom, (x, y, _along, down) => {
    const n = fbm(seed, x, y, surf.width, surf.height, { cells: 8, octaves: 2 });
    surf.put(x, y, {
      material: options.material,
      tone: options.base + (n - 0.5) * 0.2 + speckle(seed, x, y) * 0.04,
      relief: 2 + sin(down * Math.PI) * options.relief,
    });
  });
}

/** A run of blocks across a band, standing `lift` proud of the wall so it throws a soft shadow below it. */
export function blockBand(surf: Surface, top: number, bottom: number, options: BlockOptions & { lift?: number }): void {
  blocks(surf, { ...options, rows: 1, relief: options.relief ?? 1.4 }, { x0: 0, y0: top, x1: surf.width, y1: bottom });
  surf.each((_placeX, _placeY, i) => (surf.relief[i] += options.lift ?? 2.5), 0, top, surf.width, bottom);
}

/** A column filling `left` to `right`: a round shaft, a capital band at the top and a base at the foot, a shadow
 *  either side. */
export function pillar(surf: Surface, left: number, right: number, options: { material: number; base: number }): void {
  const seed = 361;
  const cap = 6;
  const foot = 6;
  box(left, 0, right, surf.height, (x, y, along) => {
    const centred = 2 * along - 1;
    const round = Math.sqrt(Math.max(0, 1 - centred * centred));
    const n = fbm(seed, x, y, surf.width, surf.height, { cells: 6, octaves: 3 });
    const banded = y < cap || y >= surf.height - foot;
    surf.put(x, y, {
      material: options.material,
      tone: options.base + (n - 0.5) * 0.25 + speckle(seed, x, y) * 0.04 - (banded ? 0.05 : 0),
      relief: 2.5 + round * 2 + (banded ? 1.2 : 0),
    });
  });
  box(left - 1, 0, left, surf.height, (x, y) => surf.nudge(x, y, -0.12));
  box(right, 0, right + 1, surf.height, (x, y) => surf.nudge(x, y, -0.18));
}

/** A border round the whole picture `w` texels wide (a panel's frame, a slab's chamfer). */
export function frame(surf: Surface, w: number, options: { material: number; base: number }): void {
  surf.each((x, y) => {
    const inset = Math.min(x, surf.width - 1 - x, y, surf.height - 1 - y);
    if (inset >= w) return;
    surf.put(x, y, {
      material: options.material,
      tone: options.base + speckle(3, x, y) * 0.04 + (x < y ? 0.06 : -0.06),
      relief: 2.5 + (w - inset) * 0.3,
    });
  });
}

/** A band of carved runes across the box: glyphs cut as hollows in a raised strip. */
export function runes(
  surf: Surface,
  left: number,
  top: number,
  right: number,
  bottom: number,
  options: { material: number; seed: number },
): void {
  const material = options.material;
  const rng = stream(options.seed);
  box(left, top, right, bottom, (x, y, _along, down) =>
    surf.put(x, y, { material, tone: 0.45 + speckle(7, x, y) * 0.04, relief: 2.5 + sin(down * Math.PI) * 0.6 }),
  );
  const rowsDown = bottom - top - 4;
  for (let x = left + 2; x < right - 4; x += 5 + rng.int(2)) {
    const strokes = 2 + rng.int(3);
    for (let k = 0; k < strokes; k++) {
      const fromX = x + rng.int(4);
      const fromY = top + 2 + rng.int(rowsDown);
      const toX = x + rng.int(4);
      const toY = top + 2 + rng.int(rowsDown);
      stroke(fromX, fromY, toX, toY, 1, 1, (placeX, placeY) =>
        surf.put(placeX, placeY, { material, tone: 0.18, relief: 1 }),
      );
    }
  }
}

/** Shelves across the box: `rows` boards of `wood` against a dark `back`, each with goods on it picked from `goods`;
 *  books take a material from `spines`, jars and bottles from `vessels`. A good the shelf does not know is a gap. */
export interface ShelfOptions {
  rows: number;
  back: number;
  wood: number;
  goods: readonly string[];
  spines: readonly number[];
  vessels: readonly number[];
}

export function shelves(
  surf: Surface,
  left: number,
  top: number,
  right: number,
  bottom: number,
  options: ShelfOptions,
): void {
  const seed = 381;
  const rng = stream(seed);
  const rowHigh = (bottom - top) / options.rows;
  box(left, top, right, bottom, (x, y) =>
    surf.put(x, y, { material: options.back, tone: 0.18 + speckle(seed, x, y) * 0.04, relief: -2 }),
  );
  for (const side of [left, right - 3])
    box(side, top, side + 3, bottom, (x, y, along) =>
      surf.put(x, y, { material: options.wood, tone: 0.45 + sin(along * Math.PI) * 0.1, relief: 2 }),
    );
  for (let k = 0; k < options.rows; k++) {
    const board = top + (k + 1) * rowHigh - 3;
    box(left, board, right, board + 3, (x, y, _along, down) =>
      surf.put(x, y, { material: options.wood, tone: 0.55 - down * 0.25, relief: 2 }),
    );
    let x = left + 4;
    while (x < right - 6) {
      const kind = rng.pick(options.goods);
      if (kind === 'book') x += book(surf, rng, x, board, rowHigh, options.spines);
      else if (kind === 'jar' || kind === 'bottle') {
        const radius = kind === 'bottle' ? 1.6 : 2.6 + rng.next();
        const bodyH = kind === 'bottle' ? 7 : 6;
        const material = rng.pick(options.vessels);
        ellipse(x + radius, board - bodyH / 2, radius, bodyH / 2, (placeX, placeY, relU, relV) =>
          surf.put(placeX, placeY, { material, tone: 0.45 - relU * 0.2 - relV * 0.1, relief: 2 + (1 - relU * relU) }),
        );
        if (kind === 'bottle')
          box(x + radius - 0.6, board - bodyH - 3, x + radius + 0.6, board - bodyH + 1, (placeX, placeY) =>
            surf.put(placeX, placeY, { material, tone: 0.5, relief: 2 }),
          );
        x += radius * 2 + 1.5;
      } else if (kind === 'sack') {
        const radius = 3 + rng.next() * 2;
        ellipse(x + radius, board - radius, radius, radius, (placeX, placeY, relU, relV) =>
          surf.put(placeX, placeY, {
            material: options.wood,
            tone: 0.5 - relU * 0.15 - relV * 0.15,
            relief: 2 + (1 - relU * relU - relV * relV) * 2,
          }),
        );
        x += radius * 2 + 1;
      } else x += 3;
    }
  }
}

/** One book standing on the board, a few leaning; answers how far along the next good stands. */
function book(
  surf: Surface,
  rng: Stream,
  x: number,
  board: number,
  rowHigh: number,
  spines: readonly number[],
): number {
  const bookW = 2 + rng.int(3);
  const bookH = Math.round(rowHigh * rng.range(0.55, 0.85));
  const material = rng.pick(spines);
  const lean = rng.next() < 0.12;
  box(x, board - bookH, x + bookW, board, (placeX, placeY, along) =>
    surf.put(lean ? placeX + Math.round((board - placeY) / 5) : placeX, placeY, {
      material,
      tone: 0.45 + sin(along * Math.PI) * 0.15 - (placeY === board - bookH + 2 ? 0.2 : 0),
      relief: 1 + sin(along * Math.PI),
    }),
  );
  return bookW + (rng.next() < 0.2 ? 2 : 0);
}

/**
 * A carved face on a plaque filling the box: brow, eye hollows, nose, mouth and a beard, as a relief lit with the
 * rest. A 'beast' has a lion's mane and muzzle, a 'demon' horns.
 */
export function reliefFace(
  surf: Surface,
  left: number,
  top: number,
  right: number,
  bottom: number,
  options: { material: number; kind: 'man' | 'beast' | 'demon'; base: number },
): void {
  const seed = 391;
  const w = right - left;
  const tall = bottom - top;
  const wide = stream(seed).range(0.85, 1.1);
  const beast = options.kind === 'beast';
  box(left, top, right, bottom, (x, y, along, down) => {
    const faceX = (along - 0.5) * 2 * wide;
    const faceY = down * 2 - 1;
    let relief = 1.5;
    // the plaque's own bevelled frame
    const inset = Math.min(along, 1 - along, down, 1 - down) * Math.min(w, tall);
    relief += smooth(0, 3, inset) * 0.8;
    const head = 1 - (faceX * faceX) / 0.55 - (faceY * faceY) / 0.85;
    if (head > 0) relief += Math.sqrt(head) * 5;
    const browY = faceY + 0.32;
    const brow = exp(-(browY * browY) / 0.006) * (1 - Math.abs(faceX) * 1.4);
    relief += Math.max(0, brow) * 2.2;
    for (const eyeX of [-0.28, 0.28]) {
      const offsetX = faceX - eyeX;
      const offsetY = faceY + 0.18;
      const dist = (offsetX * offsetX) / 0.02 + (offsetY * offsetY) / 0.012;
      if (dist < 1) relief -= (1 - dist) * 3.2;
    }
    const nose = exp(-(faceX * faceX) / 0.01) * smooth(-0.3, 0.1, faceY) * (1 - smooth(0.12, 0.2, faceY));
    relief += nose * 3;
    const mouthY = faceY - 0.38;
    const mouth = (mouthY * mouthY) / 0.003 + (faceX * faceX) / 0.06;
    if (mouth < 1) relief -= (1 - mouth) * (beast ? 3.4 : 2);
    if (!beast && faceY > 0.25 && head > -0.2)
      relief += fbm(seed, x * 2, y, surf.width, surf.height, { cells: 8, octaves: 2 }) * 2.4 * smooth(0.25, 0.5, faceY);
    if (beast) {
      const mane = Math.abs(hypot(faceX, faceY * 0.9) - 0.82);
      if (mane < 0.22) relief += (0.22 - mane) * 12 + sin(atan2(faceY, faceX) * 14) * 0.8;
    }
    if (options.kind === 'demon')
      for (const hornX of [-0.45, 0.45])
        if (Math.abs(faceX - hornX - faceY * 0.2 * Math.sign(hornX)) < 0.12 && faceY < -0.55) relief += 3;
    const n = fbm(seed + 1, x, y, surf.width, surf.height, { cells: 8, octaves: 3 });
    surf.put(x, y, {
      material: options.material,
      tone: options.base + (n - 0.5) * 0.25 + speckle(seed, x, y) * 0.04,
      relief: relief * 0.9,
    });
  });
}
