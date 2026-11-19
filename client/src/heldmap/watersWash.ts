// The waters as the held map shows them: a faint wash over the charted sea in each water's holder's colour, soft
// across borders, the contested waters and the seam hatched, and each water's name and level band lettered at the
// sea cell of it farthest from land and from other waters. Worked out on the grid the waters' rules judge, which the
// game hands over in the map's own terms (`MapWaters`); nothing here draws.

/** Who holds a water, as the waters' rules name them. */
export type WaterHolder = 'home' | 'contested' | 'grey-tithe' | 'pirates';

/** One water as the map letters it: its continent's index and id, its name and holder, and its level band. */
export interface MapWater {
  readonly continent: number;
  readonly id: string;
  readonly name: string | null;
  readonly holder: WaterHolder;
  readonly levels: readonly [number, number] | null;
}

/** The waters judged at the middle of each cell over the frame, row by row from the north-west: each cell's water by
 *  its continent's index (-1 on land) and whether it lies on the contested seam; each water; and the port cities' ids,
 *  every other city being ruins. */
export interface MapWaters {
  readonly columns: number;
  readonly rows: number;
  readonly cellM: number;
  readonly water: Int16Array;
  readonly seam: Uint8Array;
  readonly waters: readonly MapWater[];
  readonly mainPorts: readonly string[];
}

/** Each holder's colour on the map, and the word its key names it by. */
export const HOLDER_COLOURS: Readonly<Record<WaterHolder, string>> = {
  home: '#3f7f6f',
  'grey-tithe': '#5d6670',
  pirates: '#8a2f2a',
  contested: '#b8862f',
};
export const HOLDER_WORDS: readonly (readonly [WaterHolder, string])[] = [
  ['home', 'Home'],
  ['grey-tithe', 'Grey Tithe'],
  ['pirates', 'Pirates'],
  ['contested', 'Contested'],
];

/** The wash a cell at a time: `colour` RGBA, its colour the holders' of the sea round it blended over the cells either
 *  side, its alpha the share of them that is charted sea, the colour multiplied by it; `hatch` the share of them that
 *  is contested. */
export interface WatersWash {
  readonly colour: Uint8Array;
  readonly hatch: Uint8Array;
}

const rgbOf = (hex: string): readonly [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

/** A cell's holder: contested on the seam, else its water's; null on land. */
export function holderOf(waters: MapWaters, index: number): WaterHolder | null {
  const water = waters.water[index] ?? -1;
  if (water < 0) return null;
  return waters.seam[index] ? 'contested' : (waters.waters[water]?.holder ?? 'home');
}

/** The wash over the waters, only where `charted` (a byte a cell, the waters' own cells) is set. Each cell blends the
 *  charted sea cells within one of it, so a border is soft over a cell or two once the map samples it between cells. */
export function washOf(waters: MapWaters, charted: Uint8Array): WatersWash {
  const { columns, rows } = waters;
  const cells = waters.water;
  if (charted.length !== cells.length) throw new Error('the charted sea is not on the waters’ grid');
  const colours = Object.fromEntries(
    Object.entries(HOLDER_COLOURS).map(([holder, hex]) => [holder, rgbOf(hex)]),
  ) as Record<WaterHolder, readonly [number, number, number]>;
  const colour = new Uint8Array(cells.length * 4);
  const hatch = new Uint8Array(cells.length);
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      let [red, green, blue, sea, contested] = [0, 0, 0, 0, 0];
      for (let down = -1; down <= 1; down++)
        for (let across = -1; across <= 1; across++) {
          const [x, y] = [column + across, row + down];
          if (x < 0 || y < 0 || x >= columns || y >= rows) continue;
          const near = y * columns + x;
          const holder = charted[near] ? holderOf(waters, near) : null;
          if (!holder) continue;
          const [cellRed, cellGreen, cellBlue] = colours[holder];
          [red, green, blue, sea] = [red + cellRed, green + cellGreen, blue + cellBlue, sea + 1];
          if (holder === 'contested') contested++;
        }
      const index = row * columns + column;
      if (sea === 0) continue;
      // Kept premultiplied by its alpha, so the map's sampling between a washed cell and a bare one never darkens it.
      const share = sea / 9;
      colour.set(
        [(red / sea) * share, (green / sea) * share, (blue / sea) * share, share * 255].map(Math.round),
        index * 4,
      );
      hatch[index] = Math.round((contested / sea) * 255);
    }
  return { colour, hatch };
}

/** Each water's label point by continent index: the middle of its sea cell farthest, counted in cells, from land,
 *  from other waters and from the frame's edge (the first such cell row by row on a tie), metres. */
export function labelPoints(waters: MapWaters): Map<number, readonly [number, number]> {
  const { columns, rows, cellM } = waters;
  const cells = waters.water;
  const water = (index: number) => cells[index] ?? -1;
  // Chamfer distances, 3 a side and 4 a corner, in two passes, kept inside each water.
  const far = new Float64Array(cells.length).fill(Infinity);
  const near = (column: number, row: number, index: number, steps: readonly (readonly [number, number, number])[]) => {
    const own = water(index);
    if (own < 0) return;
    let best = far[index] ?? Infinity;
    for (const [across, down, cost] of steps) {
      const [x, y] = [column + across, row + down];
      if (x < 0 || y < 0 || x >= columns || y >= rows) best = Math.min(best, cost);
      else if (water(y * columns + x) !== own) best = Math.min(best, cost);
      else best = Math.min(best, (far[y * columns + x] ?? Infinity) + cost);
    }
    far[index] = best;
  };
  const before = [
    [-1, 0, 3],
    [0, -1, 3],
    [-1, -1, 4],
    [1, -1, 4],
  ] as const;
  const after = [
    [1, 0, 3],
    [0, 1, 3],
    [1, 1, 4],
    [-1, 1, 4],
  ] as const;
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) near(column, row, row * columns + column, before);
  for (let row = rows - 1; row >= 0; row--)
    for (let column = columns - 1; column >= 0; column--) near(column, row, row * columns + column, after);
  const best = new Map<number, { index: number; away: number }>();
  for (let index = 0; index < cells.length; index++) {
    const own = water(index);
    const away = far[index] ?? 0;
    if (own >= 0 && away > (best.get(own)?.away ?? -1)) best.set(own, { index, away });
  }
  const points = new Map<number, readonly [number, number]>();
  for (const [own, { index }] of best)
    points.set(own, [((index % columns) + 0.5) * cellM, (Math.floor(index / columns) + 0.5) * cellM]);
  return points;
}

/** The waters any of whose sea is charted, by continent index. */
export function chartedWaters(waters: MapWaters, charted: Uint8Array): Set<number> {
  const found = new Set<number>();
  waters.water.forEach((water, index) => {
    if (charted[index] && water >= 0) found.add(water);
  });
  return found;
}

/** A water's words on the map: its name and its level band, "The Fen Deeps, 22-26". */
export function waterWords(water: MapWater): string {
  const name = water.name ?? water.id;
  return water.levels ? `${name}, ${water.levels[0]}-${water.levels[1]}` : name;
}
