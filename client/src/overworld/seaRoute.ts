import type { HeightGrid, Point2 } from './ground.ts';

/**
 * Which coarse cells are land, for planning a voyage: `land` 1 where a cell holds any land at all, so a route
 * through a water cell never touches land; `coastM`, each cell centre's distance to the nearest land cell's centre.
 */
export interface SeaMask {
  readonly width: number;
  readonly height: number;
  readonly leftM: number;
  readonly topM: number;
  readonly cellM: number;
  readonly land: Uint8Array;
  readonly coastM: Float32Array;
}

/** A rectangle of the map, metres. */
export interface MapRect {
  readonly leftM: number;
  readonly topM: number;
  readonly widthM: number;
  readonly heightM: number;
}

/** Cell sizes, metres: about 2 km over one landmass's window, and over the whole frame 8,192 m, which divides the
 *  frame into 600 by 375 cells. */
export const SEA_CELLS = { windowM: 2_000, frameM: 8_192 } as const;

/**
 * How a route keeps off the coast: a step within `marginM` of land costs up to `1 + marginCost` times as much, so a route
 * runs that far out where it can and still hugs the coast where it must, into a harbour or a strait. A goal on land
 * within `landingReachM` of the water is sailed to the nearest water; farther inland it is refused.
 */
export const ROUTE = { marginM: 4_000, marginCost: 4, landingReachM: 10_000 } as const;

/** The most points the sea room takes in one course (crates/room/src/sea.rs `COURSE_LIMIT`), and how many of them a
 *  route leaves for its bends round the sea's islands (`detour`), which come after it is planned: a route round a
 *  great island's coast would hold more, and the room would sail none of it. */
export const COURSE_POINTS = { most: 64, bends: 16 } as const;

/** Why no route: a point off the mask, a start on land far from the water, a goal too far inland, or no water
 *  joining the two. */
export type RouteRefusal = 'outside' | 'aground' | 'inland' | 'no way';

/** A route over water, as a polyline from the start to its end, with its length; `toShore` when the goal stood on
 *  land or on water the start cannot reach (a lake), and the route ends at the reachable water nearest it. */
export type SeaRoute =
  | { readonly ok: true; readonly points: Point2[]; readonly lengthM: number; readonly toShore: boolean }
  | { readonly ok: false; readonly reason: RouteRefusal };

/** A mask with each water cell's distance to land, by a two-pass chamfer over the grid (1 and root 2 a step). */
function withCoast(grid: Omit<SeaMask, 'coastM'>): SeaMask {
  const { width, height, land, cellM } = grid;
  const steps = new Float32Array(width * height);
  for (let i = 0; i < steps.length; i++) steps[i] = land[i] ? 0 : Number.POSITIVE_INFINITY;
  const reach = (index: number, x: number, y: number, step: number) => {
    if (x >= 0 && y >= 0 && x < width && y < height) steps[index] = Math.min(steps[index], steps[y * width + x] + step);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      reach(index, x - 1, y, 1);
      reach(index, x - 1, y - 1, Math.SQRT2);
      reach(index, x, y - 1, 1);
      reach(index, x + 1, y - 1, Math.SQRT2);
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const index = y * width + x;
      reach(index, x + 1, y, 1);
      reach(index, x + 1, y + 1, Math.SQRT2);
      reach(index, x, y + 1, 1);
      reach(index, x - 1, y + 1, Math.SQRT2);
    }
  }
  for (let i = 0; i < steps.length; i++) steps[i] *= cellM;
  return { ...grid, coastM: steps };
}

/** The mask over a landmass's grid (its `LandView`), in cells of `cellM`: land wherever any grid cell above the sea
 *  covers any of the cell. */
export function maskFromGrid(grid: HeightGrid, cellM: number = SEA_CELLS.windowM): SeaMask {
  const width = Math.ceil((grid.width * grid.cellM) / cellM);
  const height = Math.ceil((grid.height * grid.cellM) / cellM);
  const land = new Uint8Array(width * height);
  const span = (start: number) =>
    [Math.floor((start * grid.cellM) / cellM), Math.ceil(((start + 1) * grid.cellM) / cellM) - 1] as const;
  for (let row = 0; row < grid.height; row++) {
    for (let column = 0; column < grid.width; column++) {
      if (!(grid.heights[row * grid.width + column] > 0)) continue;
      const [[left, right], [top, bottom]] = [span(column), span(row)];
      for (let y = top; y <= Math.min(height - 1, bottom); y++) {
        for (let x = left; x <= Math.min(width - 1, right); x++) land[y * width + x] = 1;
      }
    }
  }
  return withCoast({ width, height, leftM: grid.leftM, topM: grid.topM, cellM, land });
}

/** The mask over a rectangle of the map from coast outlines (rings of points): land where a cell's centre is inside
 *  a ring or a ring's edge crosses the cell, so an isle smaller than a cell is still land. */
export function maskFromOutlines(
  rings: readonly (readonly Point2[])[],
  rect: MapRect,
  cellM: number = SEA_CELLS.frameM,
): SeaMask {
  const width = Math.ceil(rect.widthM / cellM);
  const height = Math.ceil(rect.heightM / cellM);
  const land = new Uint8Array(width * height);
  const cells = { leftM: rect.leftM, topM: rect.topM, cellM };
  const mark = (column: number, row: number) => {
    if (column >= 0 && row >= 0 && column < width && row < height) land[row * width + column] = 1;
    return true;
  };
  for (const ring of rings) {
    for (let row = 0; row < height; row++) {
      const y = rect.topM + (row + 0.5) * cellM;
      const crossings: number[] = [];
      ring.forEach(([fromX, fromY], index) => {
        const [toX, toY] = ring[(index + 1) % ring.length];
        if (fromY > y !== toY > y) crossings.push(fromX + ((y - fromY) / (toY - fromY)) * (toX - fromX));
      });
      crossings.sort((a, b) => a - b);
      for (let pair = 0; pair + 1 < crossings.length; pair += 2) {
        const first = Math.max(0, Math.ceil((crossings[pair] - rect.leftM) / cellM - 0.5));
        const last = Math.min(width - 1, Math.floor((crossings[pair + 1] - rect.leftM) / cellM - 0.5));
        for (let column = first; column <= last; column++) land[row * width + column] = 1;
      }
    }
    ring.forEach((point, index) => walkCells(cells, point, ring[(index + 1) % ring.length], mark));
  }
  return withCoast({ width, height, leftM: rect.leftM, topM: rect.topM, cellM, land });
}

/** The cell holding a point, or -1 off the mask. */
function cellOf(mask: SeaMask, point: Point2): number {
  const column = Math.floor((point[0] - mask.leftM) / mask.cellM);
  const row = Math.floor((point[1] - mask.topM) / mask.cellM);
  return column >= 0 && row >= 0 && column < mask.width && row < mask.height ? row * mask.width + column : -1;
}

const centreOf = (mask: SeaMask, index: number): Point2 => [
  mask.leftM + ((index % mask.width) + 0.5) * mask.cellM,
  mask.topM + (Math.floor(index / mask.width) + 0.5) * mask.cellM,
];

/** Every water cell joined to `start` by water, side to side (a route never cuts a corner between two land cells). */
function floodWater(mask: SeaMask, start: number): Uint8Array {
  const { width, height, land } = mask;
  const joined = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let [head, tail] = [0, 0];
  joined[start] = 1;
  queue[tail++] = start;
  while (head < tail) {
    const index = queue[head++];
    const [x, y] = [index % width, Math.floor(index / width)];
    for (const [stepX, stepY] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const [nextX, nextY] = [x + stepX, y + stepY];
      if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
      const next = nextY * width + nextX;
      if (land[next] || joined[next]) continue;
      joined[next] = 1;
      queue[tail++] = next;
    }
  }
  return joined;
}

/** The point nearest `point` in the nearest water cell within `reachM` of it (in `joined`, when given), a little
 *  inside that cell; null when none is in reach. */
function nearestWater(mask: SeaMask, point: Point2, reachM: number, joined: Uint8Array | null) {
  const { width, height, leftM, topM, cellM, land } = mask;
  const [column, row] = [Math.floor((point[0] - leftM) / cellM), Math.floor((point[1] - topM) / cellM)];
  const span = Math.ceil(reachM / cellM) + 1;
  let best: { index: number; point: Point2; distance: number } | null = null;
  for (let y = Math.max(0, row - span); y <= Math.min(height - 1, row + span); y++) {
    for (let x = Math.max(0, column - span); x <= Math.min(width - 1, column + span); x++) {
      const index = y * width + x;
      if (land[index] || (joined && !joined[index])) continue;
      const inset = cellM * 0.05;
      const left = leftM + x * cellM;
      const top = topM + y * cellM;
      const inside: Point2 = [
        Math.min(left + cellM - inset, Math.max(left + inset, point[0])),
        Math.min(top + cellM - inset, Math.max(top + inset, point[1])),
      ];
      const distance = Math.hypot(inside[0] - point[0], inside[1] - point[1]);
      if (distance <= reachM && (!best || distance < best.distance)) best = { index, point: inside, distance };
    }
  }
  return best;
}

/** A binary heap of cell indices by cost, lowest first; an index may stand in it more than once. */
class CellHeap {
  private readonly cells: number[] = [];
  private readonly costs: number[] = [];

  get size(): number {
    return this.cells.length;
  }

  push(cell: number, cost: number): void {
    let slot = this.cells.length;
    this.cells.push(cell);
    this.costs.push(cost);
    while (slot > 0) {
      const parent = (slot - 1) >> 1;
      if (this.costs[parent] <= cost) break;
      this.cells[slot] = this.cells[parent];
      this.costs[slot] = this.costs[parent];
      slot = parent;
    }
    this.cells[slot] = cell;
    this.costs[slot] = cost;
  }

  pop(): number {
    const top = this.cells[0];
    const [lastCell, lastCost] = [this.cells.pop() ?? 0, this.costs.pop() ?? 0];
    const count = this.cells.length;
    if (count === 0) return top;
    let slot = 0;
    for (;;) {
      const left = 2 * slot + 1;
      if (left >= count) break;
      const child = left + 1 < count && this.costs[left + 1] < this.costs[left] ? left + 1 : left;
      if (this.costs[child] >= lastCost) break;
      this.cells[slot] = this.cells[child];
      this.costs[slot] = this.costs[child];
      slot = child;
    }
    this.cells[slot] = lastCell;
    this.costs[slot] = lastCost;
    return top;
  }
}

const NEIGHBOURS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
] as const;

/** The cheapest chain of water cells from `start` to `goal` (A*, eight ways, never across a corner of land). */
function searchCells(mask: SeaMask, start: number, goal: number, marginM: number, marginCost: number): number[] {
  const { width, height, land, coastM, cellM } = mask;
  const spent = new Float64Array(width * height).fill(Number.POSITIVE_INFINITY);
  const cameFrom = new Int32Array(width * height).fill(-1);
  const done = new Uint8Array(width * height);
  const [goalX, goalY] = [goal % width, Math.floor(goal / width)];
  const estimate = (x: number, y: number) => {
    const [across, down] = [Math.abs(x - goalX), Math.abs(y - goalY)];
    return (Math.max(across, down) + (Math.SQRT2 - 1) * Math.min(across, down)) * cellM;
  };
  const open = new CellHeap();
  spent[start] = 0;
  open.push(start, estimate(start % width, Math.floor(start / width)));
  while (open.size > 0) {
    const index = open.pop();
    if (done[index]) continue;
    if (index === goal) break;
    done[index] = 1;
    const [x, y] = [index % width, Math.floor(index / width)];
    for (const [stepX, stepY, length] of NEIGHBOURS) {
      const [nextX, nextY] = [x + stepX, y + stepY];
      if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
      const next = nextY * width + nextX;
      if (land[next] || done[next]) continue;
      if (stepX && stepY && (land[y * width + nextX] || land[nextY * width + x])) continue;
      const near = marginM > 0 ? Math.max(0, 1 - coastM[next] / marginM) : 0;
      const cost = spent[index] + length * cellM * (1 + marginCost * near);
      if (cost >= spent[next]) continue;
      spent[next] = cost;
      cameFrom[next] = index;
      open.push(next, cost + estimate(nextX, nextY));
    }
  }
  const chain: number[] = [];
  for (let index = goal; index !== -1; index = cameFrom[index]) chain.push(index);
  return chain.reverse();
}

/**
 * Calls `visit` with the column and row of each cell the straight line from `from` to `to` touches, in order, and
 * stops when it answers false. A line through a corner touches the cells on both sides of it, so a leg can never slip
 * between two cells that meet only at a corner.
 */
function walkCells(
  grid: { readonly leftM: number; readonly topM: number; readonly cellM: number },
  from: Point2,
  to: Point2,
  visit: (column: number, row: number) => boolean,
): boolean {
  const { leftM, topM, cellM } = grid;
  let [x, y] = [Math.floor((from[0] - leftM) / cellM), Math.floor((from[1] - topM) / cellM)];
  const [endX, endY] = [Math.floor((to[0] - leftM) / cellM), Math.floor((to[1] - topM) / cellM)];
  const [deltaX, deltaY] = [to[0] - from[0], to[1] - from[1]];
  const [stepX, stepY] = [Math.sign(deltaX), Math.sign(deltaY)];
  const edgeT = (cell: number, step: number, start: number, origin: number, delta: number) =>
    delta === 0 ? Number.POSITIVE_INFINITY : (origin + (cell + (step > 0 ? 1 : 0)) * cellM - start) / delta;
  let [nextX, nextY] = [edgeT(x, stepX, from[0], leftM, deltaX), edgeT(y, stepY, from[1], topM, deltaY)];
  const [spanX, spanY] = [deltaX === 0 ? 0 : cellM / Math.abs(deltaX), deltaY === 0 ? 0 : cellM / Math.abs(deltaY)];
  const cells = 1 + Math.abs(endX - x) + Math.abs(endY - y);
  for (let i = 0; i < cells; i++) {
    if (!visit(x, y)) return false;
    const corner = Math.abs(nextX - nextY) <= 1e-9 * Math.max(1, nextX);
    if (corner && i + 1 < cells && !visit(x + stepX, y)) return false;
    if (nextX < nextY) {
      x += stepX;
      nextX += spanX;
    } else {
      y += stepY;
      nextY += spanY;
    }
  }
  return true;
}

/** Whether the straight line from `from` to `to` crosses only water cells at least `floorM` from land. */
function lineClear(mask: SeaMask, from: Point2, to: Point2, floorM: number): boolean {
  const { width, height, land, coastM } = mask;
  return walkCells(mask, from, to, (x, y) => {
    const index = y * width + x;
    return x >= 0 && y >= 0 && x < width && y < height && !land[index] && coastM[index] >= floorM;
  });
}

/**
 * A route over water from `from` to `to`: A* over the mask's cells, then pulled straight wherever a straight line
 * keeps as far from land as the chain did there. A start on land in reach of the water sets off from the nearest
 * water; a goal on land in reach ends at the water nearest it.
 */
export function planSeaRoute(
  mask: SeaMask,
  from: Point2,
  to: Point2,
  options: {
    readonly marginM?: number;
    readonly marginCost?: number;
    readonly landingReachM?: number;
    /** The most points the route may hold; past it, those it can best do without are left out (`fewest`). */
    readonly mostPoints?: number;
  } = {},
): SeaRoute {
  const { marginM = ROUTE.marginM, marginCost = ROUTE.marginCost, landingReachM = ROUTE.landingReachM } = options;
  let [start, goal] = [cellOf(mask, from), cellOf(mask, to)];
  if (start < 0 || goal < 0) return { ok: false, reason: 'outside' };
  const lead: Point2[] = [from];
  if (mask.land[start]) {
    const water = nearestWater(mask, from, landingReachM, null);
    if (!water) return { ok: false, reason: 'aground' };
    lead.push(water.point);
    start = water.index;
  }
  const joined = floodWater(mask, start);
  let end: Point2 = to;
  const toShore = mask.land[goal] === 1 || !joined[goal];
  if (toShore) {
    const water = nearestWater(mask, to, landingReachM, joined);
    if (!water) return { ok: false, reason: mask.land[goal] ? 'inland' : 'no way' };
    [end, goal] = [water.point, water.index];
  }
  const chain = searchCells(mask, start, goal, marginM, marginCost);
  const points: Point2[] = [lead[lead.length - 1], ...chain.slice(1, -1).map((cell) => centreOf(mask, cell)), end];
  const cells = [start, ...chain.slice(1, -1), goal];
  const pulled: Point2[] = [...lead.slice(0, -1), points[0]];
  for (let anchor = 0; anchor < points.length - 1;) {
    let reached = anchor + 1;
    let floorM = Math.min(marginM, mask.coastM[cells[anchor]], mask.coastM[cells[reached]]);
    for (let candidate = anchor + 2; candidate < points.length; candidate++) {
      const candidateFloor = Math.min(floorM, mask.coastM[cells[candidate]]);
      if (!lineClear(mask, points[anchor], points[candidate], candidateFloor)) break;
      [reached, floorM] = [candidate, candidateFloor];
    }
    pulled.push(points[reached]);
    anchor = reached;
  }
  const kept = fewest(mask, pulled, options.mostPoints ?? Infinity, marginM);
  let lengthM = 0;
  for (let i = 1; i < kept.length; i++) {
    lengthM += Math.hypot(kept[i][0] - kept[i - 1][0], kept[i][1] - kept[i - 1][1]);
  }
  return { ok: true, points: kept, lengthM, toShore };
}

/** A route's `points` over `mask` with no more than `most`, its ends kept: each time, the point whose loss lengthens
 *  the way least, of those whose neighbours a straight leg joins as clear of land as the nearer of their cells lies
 *  (no nearer than the pull itself keeps), is left out; past those, any whose neighbours a leg joins over water a
 *  cell from land, as the pull's own legs run at a coast. Where none can go, the rest stand. */
function fewest(mask: SeaMask, points: readonly Point2[], most: number, marginM: number): Point2[] {
  const kept = [...points];
  const apart = (one: Point2, other: Point2) => Math.hypot(other[0] - one[0], other[1] - one[1]);
  const coastOf = (point: Point2) => mask.coastM[cellOf(mask, point)] ?? 0;
  const floors = [
    (before: Point2, after: Point2) => Math.min(marginM, coastOf(before), coastOf(after)),
    () => Math.min(marginM, mask.cellM),
  ];
  for (const floorOf of floors) {
    while (kept.length > Math.max(2, most)) {
      let [drop, least] = [-1, Number.POSITIVE_INFINITY];
      for (let index = 1; index < kept.length - 1; index++) {
        const [before, middle, after] = [kept[index - 1], kept[index], kept[index + 1]];
        const longer = apart(before, middle) + apart(middle, after) - apart(before, after);
        if (longer < least && lineClear(mask, before, after, floorOf(before, after))) [drop, least] = [index, longer];
      }
      if (drop < 0) break;
      kept.splice(drop, 1);
    }
  }
  return kept;
}

/** `mask` with every cell whose middle lies within `reachM` of a locked sea's (`locked` at a world point) made land,
 *  so no route runs into a locked sea or along its edge; the mask itself is left as it was. */
export function lockedOut(mask: SeaMask, locked: (x: number, y: number) => boolean, reachM: number): SeaMask {
  const { width, height, leftM, topM, cellM } = mask;
  const shut = new Uint8Array(width * height);
  for (let row = 0; row < height; row++)
    for (let column = 0; column < width; column++)
      shut[row * width + column] = locked(leftM + (column + 0.5) * cellM, topM + (row + 0.5) * cellM) ? 1 : 0;
  const reach = Math.ceil(reachM / cellM);
  const land = Uint8Array.from(mask.land);
  for (let row = 0; row < height; row++)
    for (let column = 0; column < width; column++) {
      if (!shut[row * width + column]) continue;
      for (let down = Math.max(0, row - reach); down <= Math.min(height - 1, row + reach); down++)
        for (let across = Math.max(0, column - reach); across <= Math.min(width - 1, column + reach); across++)
          land[down * width + across] = 1;
    }
  return { ...mask, land };
}
