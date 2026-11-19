import type { CourseBlock } from '../../../../server/roomDoor.ts';
import { type Deck, deckToWorld, type Lying } from '../../ships/deck.ts';

/** How wide a block of deck is across and along her, in her own metres: her grid's cells taken three by three, fine
 *  enough that a way between her fittings is as wide as she was built with. */
const BLOCK_CELLS = 3;
/** A block stands where at least this many of its cells are hers; fewer is the deck's ragged edge. */
const CELLS_HELD = 3;
/** Heights are kept to this, metres, so a deck's gentle sheer makes few blocks. */
const HEIGHT_STEP = 0.05;

/** How many squares in from each end of a row her rail stands at most (a metre and a half): outboard of it are her
 *  channels. */
const RAIL_WITHIN = 5;
/** How far a square her deck has no height in stands over the lowest of its row, metres: past what a jump reaches. */
const WALL_RISE_M = 1.9;

/** The highest of a square's cells, kept to `HEIGHT_STEP`, or null for a square too few of her cells hold. */
function square(deck: Deck, row: number, column: number): number | null {
  let [held, highest] = [0, -Infinity];
  for (let down = row * BLOCK_CELLS; down < Math.min(deck.rows, (row + 1) * BLOCK_CELLS); down++)
    for (let side = column * BLOCK_CELLS; side < Math.min(deck.columns, (column + 1) * BLOCK_CELLS); side++) {
      const height = deck.heights[down * deck.columns + side] ?? null;
      if (height === null) continue;
      held += 1;
      highest = Math.max(highest, height);
    }
  return held >= CELLS_HELD ? Math.round(highest / HEIGHT_STEP) * HEIGHT_STEP : null;
}

/** The squares of a row outboard of her rail, from one end: her channels and chains, lower than the rail, which a
 *  body over the rail would stand on in no part of the level. Her rail is the highest of the first `RAIL_WITHIN`
 *  squares held; a row with no rail higher than its deck keeps them all. */
function channels(heights: readonly (number | null)[], from: 1 | -1): number[] {
  const held = heights.flatMap((height, column) => (height === null ? [] : [column]));
  const outer = (from === 1 ? held : held.reverse()).slice(0, RAIL_WITHIN);
  const highest = Math.max(...outer.map((column) => heights[column] ?? -Infinity));
  return outer.slice(
    0,
    outer.findIndex((column) => heights[column] === highest),
  );
}

/** The height of each square of `BLOCK_CELLS` cells across her grid: the highest of her cells there, her rails and
 *  bulwarks as walls; null off her deck and outboard of her rails. A square inside a row that her deck has no height
 *  in (a mast, a gun, a spar, an opening into her hold) stands as a wall, as her deck walks at sea. */
function squares(deck: Deck): (number | null)[][] {
  const across = Math.ceil(deck.columns / BLOCK_CELLS);
  const along = Math.ceil(deck.rows / BLOCK_CELLS);
  const rows: (number | null)[][] = [];
  for (let row = 0; row < along; row++) {
    const heights = Array.from({ length: across }, (unused, column) => square(deck, row, column));
    for (const column of [...channels(heights, 1), ...channels(heights, -1)]) heights[column] = null;
    const first = heights.findIndex((height) => height !== null);
    const last = heights.findLastIndex((height) => height !== null);
    const wall = Math.min(...heights.filter((height): height is number => height !== null)) + WALL_RISE_M;
    for (let column = first; first >= 0 && column <= last; column++) heights[column] ??= wall;
    rows.push(heights);
  }
  return rows;
}

/**
 * A ship's deck as blocks a body stands on, in the world as she lies: her grid's heights in squares across her own
 * frame, each run of equal heights along a row one block, runs alike in rows one after another joined; none where
 * the middle of a square lies on one of `under` (another ship's deck, whose hull stands there). Her heading must be
 * square to the world's axes, so every block is too.
 */
export function deckBlocks(deck: Deck, lying: Lying, under: readonly CourseBlock[] = []): CourseBlock[] {
  const size = deck.cell * BLOCK_CELLS;
  const kept = squares(deck).map((row, along) =>
    row.map((height, across) => {
      const [x, y] = deckToWorld(lying, deck.west + (across + 0.5) * size, deck.north + (along + 0.5) * size, 0);
      const taken = under.some((block) => x >= block.minX && x <= block.maxX && y >= block.minY && y <= block.maxY);
      return taken ? null : height;
    }),
  );
  // Runs of one height along each row, as [first, last, height] in squares.
  const runs = kept.map((row) => {
    const found: [number, number, number][] = [];
    row.forEach((height, across) => {
      const open = found.at(-1);
      if (height === null) return;
      if (open && open[1] === across - 1 && open[2] === height) open[1] = across;
      else found.push([across, across, height]);
    });
    return found;
  });
  const blocks: CourseBlock[] = [];
  const done = runs.map((row) => row.map(() => false));
  runs.forEach((row, along) =>
    row.forEach(([first, last, height], index) => {
      if (done[along]?.[index]) return;
      let end = along;
      for (;;) {
        const next = runs[end + 1]?.findIndex((run) => run[0] === first && run[1] === last && run[2] === height);
        if (next === undefined || next < 0) break;
        end += 1;
        const nextDone = done[end];
        if (nextDone) nextDone[next] = true;
      }
      const corners = [
        deckToWorld(lying, deck.west + first * size, deck.north + along * size, height),
        deckToWorld(lying, deck.west + (last + 1) * size, deck.north + (end + 1) * size, height),
      ];
      const [eastings, southings] = [corners.map((corner) => corner[0]), corners.map((corner) => corner[1])];
      const top = corners[0]?.[2] ?? 0;
      blocks.push({
        minX: Math.min(...eastings),
        minY: Math.min(...southings),
        maxX: Math.max(...eastings),
        maxY: Math.max(...southings),
        top,
      });
    }),
  );
  return blocks;
}
