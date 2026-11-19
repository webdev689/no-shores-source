import type { CourseBlock } from '../../../../server/roomDoor.ts';
import { type Deck, deckToWorld, type Lying } from '../../ships/deck.ts';

/** How wide a block of deck is across and along her, in her own metres: her grid's cells taken five by five. */
const BLOCK_CELLS = 5;
/** A block stands where at least this many of its cells are hers; fewer is the deck's ragged edge. */
const CELLS_HELD = 5;
/** Heights are kept to this, metres, so a deck's gentle sheer makes few blocks. */
const HEIGHT_STEP = 0.05;

/** A ship laid in the wreck: where she lies (square to the world's axes) and the places cut from her deck, world
 *  metres, where the other ship broke through her or a ramp lands. */
export interface ShipLaid {
  readonly lying: Lying;
  readonly cuts: readonly (readonly [number, number, number, number])[];
}

/** The height of each square of `BLOCK_CELLS` cells across her grid: the highest of her cells there, her rails and
 *  bulwarks as walls; a gap within a row (a hatch, a mast, a gun) filled at the row's lowest, so no body falls
 *  through her; null off her deck. */
function squares(deck: Deck): (number | null)[][] {
  const across = Math.ceil(deck.columns / BLOCK_CELLS);
  const along = Math.ceil(deck.rows / BLOCK_CELLS);
  const rows: (number | null)[][] = [];
  for (let row = 0; row < along; row++) {
    const heights: (number | null)[] = [];
    for (let column = 0; column < across; column++) {
      let [held, highest] = [0, -Infinity];
      for (let down = row * BLOCK_CELLS; down < Math.min(deck.rows, (row + 1) * BLOCK_CELLS); down++)
        for (let side = column * BLOCK_CELLS; side < Math.min(deck.columns, (column + 1) * BLOCK_CELLS); side++) {
          const height = deck.heights[down * deck.columns + side] ?? null;
          if (height === null) continue;
          held += 1;
          highest = Math.max(highest, height);
        }
      heights.push(held >= CELLS_HELD ? Math.round(highest / HEIGHT_STEP) * HEIGHT_STEP : null);
    }
    const first = heights.findIndex((height) => height !== null);
    const last = heights.findLastIndex((height) => height !== null);
    const lowest = Math.min(...heights.filter((height): height is number => height !== null));
    for (let column = first; first >= 0 && column <= last; column++) heights[column] ??= lowest;
    rows.push(heights);
  }
  return rows;
}

/** Whether a world point lies in any of the cuts. */
function cut(cuts: ShipLaid['cuts'], x: number, y: number): boolean {
  return cuts.some(([minX, minY, maxX, maxY]) => x >= minX && x <= maxX && y >= minY && y <= maxY);
}

/**
 * A ship's deck as blocks a body stands on, in the world as she lies: her grid's heights in squares half a metre
 * across her own frame, each run of equal heights along a row one block, runs alike in rows one after another
 * joined. Her heading must be square to the world's axes, so every block is too.
 */
export function deckBlocks(deck: Deck, laid: ShipLaid): CourseBlock[] {
  const { lying } = laid;
  const size = deck.cell * BLOCK_CELLS;
  const heights = squares(deck);
  const kept = heights.map((row, along) =>
    row.map((height, across) => {
      if (height === null) return null;
      const [x, y] = deckToWorld(lying, deck.west + (across + 0.5) * size, deck.north + (along + 0.5) * size, 0);
      return cut(laid.cuts, x, y) ? null : height;
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
