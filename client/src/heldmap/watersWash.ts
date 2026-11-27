// The waters as the held map shows them: a faint wash over the sea in each water's holder's colour, soft
// across borders, the Grey Tithe's and the Lattice's waters hatched, and each water's name and level band lettered at
// the sea cell of it farthest from land and from other waters. Worked out on the grid the waters' rules judge, which
// the game hands over in the map's own terms (`MapWaters`); nothing here draws.

/** Who holds a water, as the waters' rules name them. */
export type WaterHolder = 'home' | 'grey-tithe' | 'lattice';

/** One water as the map letters it: its continent's index and id, its name and holder, and its level band. */
export interface MapWater {
  readonly continent: number;
  readonly id: string;
  readonly name: string | null;
  readonly holder: WaterHolder;
  readonly levels: readonly [number, number] | null;
}

/** The waters judged at the middle of each cell over the frame, row by row from the north-west: each cell's water by
 *  its continent's index (-1 on land); each water; and the port cities' ids, every other city being ruins. */
export interface MapWaters {
  readonly columns: number;
  readonly rows: number;
  readonly cellM: number;
  readonly water: Int16Array;
  readonly waters: readonly MapWater[];
  readonly mainPorts: readonly string[];
}

/** Each holder's colour on the map, and the word its key names it by. Washed over the parchment at `WASH_STRENGTH`,
 *  none darkens it by more than 6 in lightness; two washes that are not told apart by at least 10 in CIEDE2000 are by
 *  their hatching (`HATCHES`). The Grey Tithe is the slate its ships are, the Lattice its crystal's red, lit. */
export const HOLDER_COLOURS: Readonly<Record<WaterHolder, string>> = {
  home: '#3f7f6f',
  'grey-tithe': '#6b7785',
  // The crystal's red (city/crystal.ts `CRYSTAL.red`) lit a third again, so its wash darkens the parchment no more
  // than the others' (the game's test holds the two alike).
  lattice: '#de3d49',
};
/** How strongly the holders' colours are washed over the sea; and the level lines laid over the Grey Tithe's
 *  wash in a dark slate and over the Lattice's in a dark crystal red, each line's colour, strength and spacing, device
 *  pixels. */
export const WASH_STRENGTH = 0.26;
export const HATCHES = {
  lattice: { colour: [96, 20, 28], strength: 0.3, spacingPx: 7 },
  'grey-tithe': { colour: [74, 85, 99], strength: 0.3, spacingPx: 7 },
} as const;
/** The map's parchment where its ink is laid, the forge's sheet's middle colour, under the sea's faint ink. */
export const MAP_PARCHMENT: readonly [number, number, number] = [208, 171, 118];
const SEA_INK = { colour: [58, 40, 22], strength: 0.08 } as const;

/** A holder's wash as the map shows it on the sea: its colour at `WASH_STRENGTH` over the parchment and the
 *  sea's faint ink, `#rrggbb`. */
export function washedOver(holder: WaterHolder): string {
  const own = rgbOf(HOLDER_COLOURS[holder]);
  return `#${MAP_PARCHMENT.map((channel, index) => {
    const inked = channel * (1 - SEA_INK.strength) + SEA_INK.colour[index]! * SEA_INK.strength;
    const washed = inked * (1 - WASH_STRENGTH) + own[index]! * WASH_STRENGTH;
    return Math.round(washed).toString(16).padStart(2, '0');
  }).join('')}`;
}
export const HOLDER_WORDS: readonly (readonly [WaterHolder, string])[] = [
  ['home', 'Home'],
  ['grey-tithe', 'Grey Tithe'],
  ['lattice', 'The Lattice'],
];

/** The difficulty ramp from the easiest level to the hardest: green, gold, orange, red, deep purple, each dark enough
 *  to read as ink on the parchment, at least 5 : 1 against the parchment a water's ring is filled with. */
const DIFFICULTY_STOPS: readonly (readonly [number, readonly [number, number, number]])[] = [
  [1, [37, 99, 39]],
  [8, [106, 85, 7]],
  [15, [137, 67, 20]],
  [22, [163, 36, 31]],
  [30, [90, 31, 110]],
];

/** The colour of a level on the difficulty ramp, blended between its stops. */
export function levelColour(level: number): string {
  const last = DIFFICULTY_STOPS.length - 1;
  const after = DIFFICULTY_STOPS.findIndex(([stop]) => level <= stop);
  const [high, highColour] = DIFFICULTY_STOPS[after < 0 ? last : Math.max(1, after)] ?? DIFFICULTY_STOPS[last]!;
  const [low, lowColour] = DIFFICULTY_STOPS[after < 0 ? last - 1 : Math.max(0, after - 1)] ?? DIFFICULTY_STOPS[0]!;
  const share = Math.min(1, Math.max(0, (level - low) / (high - low)));
  const channel = (index: 0 | 1 | 2) =>
    Math.round(lowColour[index] + (highColour[index] - lowColour[index]) * share)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

/** A water's colour on the difficulty ramp, by the middle of its level band; the ink's own with no band. */
export function difficultyColour(levels: readonly [number, number] | null): string | null {
  return levels ? levelColour((levels[0] + levels[1]) / 2) : null;
}

/** The wash a cell at a time: `colour` RGBA, its colour the holders' of the sea round it blended over the cells either
 *  side, its alpha the share of them that is sea, the colour multiplied by it; `hatch` two bytes a cell, the
 *  share of them that is the Lattice's and the share that is the Grey Tithe's. */
export interface WatersWash {
  readonly colour: Uint8Array;
  readonly hatch: Uint8Array;
}

function rgbOf(hex: string): readonly [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

/** How far each cell lies from the nearest coast, metres (the coast field's, on the same cells), and how far from its
 *  coast a home water stays home (crates/world/src/waters.rs `HOME_REACH_M`). */
export interface HomeReach {
  readonly distance: Float32Array;
  readonly reachM: number;
}

/** A cell's holder: its water's, but the Grey Tithe's over a home water's open sea past its `reach`; null on land. */
export function holderOf(waters: MapWaters, index: number, reach?: HomeReach): WaterHolder | null {
  const water = waters.water[index] ?? -1;
  if (water < 0) return null;
  const holder = waters.waters[water]?.holder ?? 'home';
  return holder === 'home' && reach && (reach.distance[index] ?? 0) > reach.reachM ? 'grey-tithe' : holder;
}

/** The wash over the waters, home waters' open sea past their `reach` washed as the Grey Tithe's. Each cell blends the
 *  sea cells within one of it, so a border is soft over a cell or two once the map samples it between cells. */
export function washOf(waters: MapWaters, reach?: HomeReach): WatersWash {
  const { columns, rows } = waters;
  const cells = waters.water;
  const colours = Object.fromEntries(
    Object.entries(HOLDER_COLOURS).map(([holder, hex]) => [holder, rgbOf(hex)]),
  ) as Record<WaterHolder, readonly [number, number, number]>;
  const colour = new Uint8Array(cells.length * 4);
  const hatch = new Uint8Array(cells.length * 2);
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      let [red, green, blue, sea, lattice, tithe] = [0, 0, 0, 0, 0, 0];
      for (let down = -1; down <= 1; down++)
        for (let across = -1; across <= 1; across++) {
          const [x, y] = [column + across, row + down];
          if (x < 0 || y < 0 || x >= columns || y >= rows) continue;
          const near = y * columns + x;
          const holder = holderOf(waters, near, reach);
          if (!holder) continue;
          const [cellRed, cellGreen, cellBlue] = colours[holder];
          [red, green, blue, sea] = [red + cellRed, green + cellGreen, blue + cellBlue, sea + 1];
          if (holder === 'lattice') lattice++;
          if (holder === 'grey-tithe') tithe++;
        }
      const index = row * columns + column;
      if (sea === 0) continue;
      // Kept premultiplied by its alpha, so the map's sampling between a washed cell and a bare one never darkens it.
      const share = sea / 9;
      colour.set(
        [(red / sea) * share, (green / sea) * share, (blue / sea) * share, share * 255].map(Math.round),
        index * 4,
      );
      hatch.set([Math.round((lattice / sea) * 255), Math.round((tithe / sea) * 255)], index * 2);
    }
  return { colour, hatch };
}

/** A locked sea's shade a cell at a time, a byte each: 255 over the sea of each water in `locked` (by continent index)
 *  and over its island's land, a cell inside one of `lands` (a byte a cell, 1 inside a locked island's outline) or
 *  whose nearest coast is the island's (`field`), blended over the cells either side so its edge is soft once the map
 *  samples it between cells. */
export function shutCells(
  waters: MapWaters,
  field: { readonly island: Uint8Array },
  locked: ReadonlySet<number>,
  lands: readonly Uint8Array[] = [],
): Uint8Array {
  const { columns, rows } = waters;
  const shut = (index: number) => {
    const water = waters.water[index] ?? -1;
    if (water >= 0) return locked.has(water);
    return locked.has(field.island[index] ?? -1) || lands.some((inside) => inside[index] === 1);
  };
  const cells = new Uint8Array(columns * rows);
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      let count = 0;
      for (let down = -1; down <= 1; down++)
        for (let across = -1; across <= 1; across++) {
          const [x, y] = [column + across, row + down];
          if (x >= 0 && y >= 0 && x < columns && y < rows && shut(y * columns + x)) count++;
        }
      cells[row * columns + column] = Math.round((count / 9) * 255);
    }
  return cells;
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
