// A dungeon's landmarks as the page reads them: each one the layout stands, with landmarks.json's footprint and
// solids turned and moved as the rules turn and move them.
import table from '../../../content/dungeon/landmarks.json' with { type: 'json' };
import type { DungeonLayout, StyleKey } from './dungeonLayout.ts';
import type { Place, Turns } from './dungeonModules.ts';

/** A landmark as the layout stands it: its module and style, where it is laid (its footprint W × D metres before
 *  the turn), the cells it covers and its solids in the dungeon's frame. */
export type PlacedLandmark = {
  readonly module: string;
  readonly style: StyleKey;
  readonly place: Place;
  readonly cells: readonly number[];
  readonly solids: readonly (readonly [number, number, number, number, number])[];
};

/** Every landmark the layout stands, read with landmarks.json: its cells, and its solids turned as the rules turn
 *  them, a point (x, y) of a footprint W × D to (x, y), (D − y, x), (W − x, D − y) or (y, W − x). */
export function placedLandmarks(layout: DungeonLayout): PlacedLandmark[] {
  const size = layout.cell;
  return layout.landmarks.flatMap(([module, x, y, quarter]) => {
    const entry = table.landmarks.find((landmark) => landmark.module === module);
    if (!entry) return [];
    const turns = (quarter % 4) as Turns;
    const [wide = 1, deep = 1] = entry.cells;
    const [width, depth] = [wide * size, deep * size];
    const [across, down] = turns % 2 === 1 ? [deep, wide] : [wide, deep];
    const [column, row] = [Math.round(x / size), Math.round(y / size)];
    const cells: number[] = [];
    for (let step = 0; step < down; step++)
      for (let beside = 0; beside < across; beside++) cells.push((row + step) * layout.columns + column + beside);
    const turned = (pointX: number, pointY: number): readonly [number, number] =>
      (
        [
          [pointX, pointY],
          [depth - pointY, pointX],
          [width - pointX, depth - pointY],
          [pointY, width - pointX],
        ] as const
      )[turns];
    const solids = entry.solids.map(([westX = 0, northY = 0, eastX = 0, southY = 0, top = 0]) => {
      const [first, second] = [turned(westX, northY), turned(eastX, southY)];
      return [
        Math.min(first[0], second[0]) + x,
        Math.min(first[1], second[1]) + y,
        Math.max(first[0], second[0]) + x,
        Math.max(first[1], second[1]) + y,
        top,
      ] as const;
    });
    const place: Place = { origin: [x, y, 0], turns, footprint: [width, depth] };
    return [{ module, style: entry.style as StyleKey, place, cells, solids }];
  });
}
