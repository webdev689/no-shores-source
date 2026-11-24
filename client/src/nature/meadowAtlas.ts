// The meadow's sprites side by side in one picture, top row first, each sprite's cell a power of two so every level
// of its chain halves exactly: a 32-pixel tuft is laid at two texels a pixel, so the chain's second level is the
// owner's picture again, texel for texel. The chain keeps each sprite's share of its cell drawn at every level, so a
// far tuft of flowers is as sparse as a near one and a bush as full, never blurred to a block or thinned to nothing.
import { MEADOW_SPRITES, type MeadowPicture, type MeadowSprite } from './meadowArt.ts';

/** The atlas's cells: the five sprites and three of air no tuft wears. */
export const MEADOW_SLOTS = 8;
/** A cell's side, texels: the bush's own 64. */
export const MEADOW_CELL = 64;

/** A picture's texels, RGBA, top row first. */
export interface Level {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/** A sprite's drawn box: the least rectangle of its square holding every texel it draws, as shares of the square, u
 *  across from its left and v up from its foot. A card is cut to it, so no pixel is shaded where it draws nothing. */
export interface SpriteBox {
  readonly u0: number;
  readonly u1: number;
  readonly v0: number;
  readonly v1: number;
}

const rgbOf = (hex: string): [number, number, number] =>
  [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)) as [number, number, number];

/** The sprites laid in their cells, each at whole texels a pixel, its foot on the cell's bottom row. */
export function meadowAtlas(sprites: readonly MeadowSprite[] = MEADOW_SPRITES): Level {
  if (sprites.length > MEADOW_SLOTS) throw new Error(`${sprites.length} sprites in an atlas of ${MEADOW_SLOTS}`);
  const width = MEADOW_SLOTS * MEADOW_CELL;
  const data = new Uint8Array(width * MEADOW_CELL * 4);
  sprites.forEach(({ name, picture }, slot) => {
    const side = picture.rows.length;
    if (picture.rows.some((row) => row.length !== side) || MEADOW_CELL % side !== 0)
      throw new Error(`${name}: a ${side}-row sprite does not tile a ${MEADOW_CELL} cell`);
    const scale = MEADOW_CELL / side;
    const colours = picture.colours.map(rgbOf);
    for (let y = 0; y < MEADOW_CELL; y++)
      for (let x = 0; x < MEADOW_CELL; x++) {
        const letter = picture.rows[Math.floor(y / scale)]?.[Math.floor(x / scale)] ?? '.';
        if (letter === '.') continue;
        const texel = (y * width + slot * MEADOW_CELL + x) * 4;
        data.set([...(colours[letter.charCodeAt(0) - 97] ?? [0, 0, 0]), 255], texel);
      }
  });
  return { width, height: MEADOW_CELL, data };
}

/** Each cell's drawn share of itself, at a level. */
export function slotCoverage(level: Level): number[] {
  const across = level.width / MEADOW_SLOTS;
  return Array.from({ length: MEADOW_SLOTS }, (unused, slot) => {
    if (across < 1) return 0;
    let drawn = 0;
    for (let y = 0; y < level.height; y++)
      for (let x = slot * across; x < (slot + 1) * across; x++) if (level.data[(y * level.width + x) * 4 + 3]) drawn++;
    return drawn / (across * level.height);
  });
}

/** One level down, each cell keeping the share of itself it drew at the first level (`targets`): the blocks kept are
 *  those of the most drawn texels, then the higher, then the leftmost; a kept block is the mean of its drawn texels,
 *  so air never darkens an edge. Once a cell is under a texel wide, every drawn block is kept. */
export function halved(level: Level, targets: readonly number[]): Level {
  const [width, height] = [Math.max(1, level.width >> 1), Math.max(1, level.height >> 1)];
  const data = new Uint8Array(width * height * 4);
  const blocks: { x: number; y: number; drawn: number; texel: number }[] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let [drawn, red, green, blue] = [0, 0, 0, 0];
      for (const [stepX, stepY] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ]) {
        const from =
          (Math.min(level.height - 1, y * 2 + stepY) * level.width + Math.min(level.width - 1, x * 2 + stepX)) * 4;
        if (!level.data[from + 3]) continue;
        [drawn, red, green, blue] = [
          drawn + 1,
          red + level.data[from],
          green + level.data[from + 1],
          blue + level.data[from + 2],
        ];
      }
      const texel = (y * width + x) * 4;
      if (drawn) data.set([Math.round(red / drawn), Math.round(green / drawn), Math.round(blue / drawn)], texel);
      blocks.push({ x, y, drawn, texel });
    }
  const across = width / MEADOW_SLOTS;
  if (across < 1) {
    for (const block of blocks) if (block.drawn) data[block.texel + 3] = 255;
    return { width, height, data };
  }
  for (let slot = 0; slot < MEADOW_SLOTS; slot++) {
    const mine = blocks.filter((block) => block.drawn > 0 && block.x >= slot * across && block.x < (slot + 1) * across);
    mine.sort((a, b) => b.drawn - a.drawn || a.y - b.y || a.x - b.x);
    const keep = Math.min(mine.length, Math.max(1, Math.round((targets[slot] ?? 0) * across * height)));
    for (const block of mine.slice(0, keep)) data[block.texel + 3] = 255;
  }
  return { width, height, data };
}

/** The whole chain, the atlas first, down to a texel: a chain that stops short leaves the picture incomplete. */
export function meadowLevels(atlas: Level = meadowAtlas()): Level[] {
  const levels = [atlas];
  const targets = slotCoverage(atlas);
  for (let last = atlas; last.width > 1 || last.height > 1;) {
    last = halved(last, targets);
    levels.push(last);
  }
  return levels;
}

/** A sprite's drawn box. A sprite of air has a box of no area, so its card draws nothing. */
export function spriteBox(picture: MeadowPicture): SpriteBox {
  const side = picture.rows.length;
  let [left, right, top, bottom] = [Infinity, -Infinity, Infinity, -Infinity];
  picture.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '.') continue;
      [left, right, top, bottom] = [Math.min(left, x), Math.max(right, x), Math.min(top, y), Math.max(bottom, y)];
    }
  });
  if (right < left) return { u0: 0.5, u1: 0.5, v0: 0, v1: 0 };
  return { u0: left / side, u1: (right + 1) / side, v0: (side - 1 - bottom) / side, v1: (side - top) / side };
}

/** A sprite's mean colour (0..1 a channel) over the texels it draws. */
export function spriteMean(picture: MeadowPicture): [number, number, number] {
  const sum = [0, 0, 0];
  let drawn = 0;
  for (const row of picture.rows)
    for (const letter of row) {
      if (letter === '.') continue;
      const colour = rgbOf(picture.colours[letter.charCodeAt(0) - 97] ?? '#000000');
      colour.forEach((value, channel) => (sum[channel] += value));
      drawn++;
    }
  return sum.map((value) => value / Math.max(drawn, 1) / 255) as [number, number, number];
}
