import { boxSeen, type Planes } from '../frustum.ts';

/** Quads along each side of a ring's square, and how many rings, each twice as coarse as the one inside it. */
export const CLIPMAP_QUADS = 96;
export const CLIPMAP_LEVELS = 15;

/**
 * One ring: a square of CLIPMAP_QUADS² quads `spacing` metres wide, its north-west corner at `corner` (window
 * metres), and where the finer ring inside it lies in its own quads (none for the finest).
 */
export interface ClipLevel {
  readonly corner: readonly [number, number];
  readonly spacing: number;
  readonly hole: readonly [number, number] | null;
}

/** The finest ring's spacing for an eye `height` metres above the ground: a power of two from 0.25 m up, so the
 *  rings only ever double or halve as the eye climbs. */
export function finestSpacing(height: number): number {
  return 2 ** Math.floor(Math.log2(Math.max(0.25, Math.abs(height) / 40)));
}

/**
 * The rings round an eye at (x, y), window metres. Each ring's corner lies on whole steps of twice its spacing,
 * which is the next ring's spacing, so every edge of a ring runs along the next ring's grid and the land never
 * moves under the eye: the rings jump a step at a time as it travels.
 */
export function clipmapLevels(x: number, y: number, finest: number): ClipLevel[] {
  const levels: ClipLevel[] = [];
  for (let level = 0; level < CLIPMAP_LEVELS; level++) {
    const spacing = finest * 2 ** level;
    const snap = (value: number) => Math.floor(value / (2 * spacing)) * 2 * spacing - (CLIPMAP_QUADS / 2) * spacing;
    const corner = [snap(x), snap(y)] as const;
    const inner = levels[level - 1];
    const hole = inner
      ? ([(inner.corner[0] - corner[0]) / spacing, (inner.corner[1] - corner[1]) / spacing] as const)
      : null;
    levels.push({ corner, spacing, hole });
  }
  return levels;
}

/** The bearings round a ring's middle its quads are drawn by: the view draws only the sectors it meets. */
export const CLIPMAP_SECTORS = 32;

/** The quads, in each axis from the first to before the last, that every ring but the finest always leaves to the
 *  finer ring: that ring's corner falls a quarter of the way in or one quad further, so these lie under it wherever
 *  the eye stands. */
export const UNDER_FINER = [CLIPMAP_QUADS / 4 + 1, (CLIPMAP_QUADS * 3) / 4] as const;

/** The order a ring's quads are drawn in: round the finer ring sector by sector, then under it sector by sector. */
export interface QuadOrder {
  /** Each quad's number (row times CLIPMAP_QUADS, plus column), in the order drawn. */
  readonly quads: Uint32Array;
  /** Where each of the 2 x CLIPMAP_SECTORS sectors begins in `quads`, and where the last ends. */
  readonly starts: Uint32Array;
  /** Each sector's least column and row, then its most. */
  readonly spans: Uint8Array;
}

/** The quads ordered by sector, once: a sector is its quads' bearing from the ring's middle, and those under the
 *  finer ring come after the rest, so a coarser ring leaves them out by drawing less. */
export function quadOrder(): QuadOrder {
  const count = CLIPMAP_QUADS * CLIPMAP_QUADS;
  const half = CLIPMAP_QUADS / 2;
  const [first, last] = UNDER_FINER;
  const sectors = Uint8Array.from({ length: count }, (unused, quad) => {
    const [column, row] = [quad % CLIPMAP_QUADS, Math.floor(quad / CLIPMAP_QUADS)];
    const under = column >= first && column < last && row >= first && row < last;
    const turn = (Math.atan2(row + 0.5 - half, column + 0.5 - half) + Math.PI) / (2 * Math.PI);
    return (under ? CLIPMAP_SECTORS : 0) + Math.min(CLIPMAP_SECTORS - 1, Math.floor(turn * CLIPMAP_SECTORS));
  });
  const quads = Uint32Array.from({ length: count }, (unused, quad) => quad).sort(
    (one, other) => (sectors[one] ?? 0) - (sectors[other] ?? 0) || one - other,
  );
  const starts = new Uint32Array(2 * CLIPMAP_SECTORS + 1);
  const spans = new Uint8Array(2 * CLIPMAP_SECTORS * 4);
  for (let sector = 0; sector < 2 * CLIPMAP_SECTORS; sector++) spans.set([CLIPMAP_QUADS, CLIPMAP_QUADS], sector * 4);
  for (const quad of quads) {
    const sector = sectors[quad] ?? 0;
    starts[sector + 1] = (starts[sector + 1] ?? 0) + 1;
    const [column, row] = [quad % CLIPMAP_QUADS, Math.floor(quad / CLIPMAP_QUADS)];
    spans[sector * 4] = Math.min(spans[sector * 4] ?? 0, column);
    spans[sector * 4 + 1] = Math.min(spans[sector * 4 + 1] ?? 0, row);
    spans[sector * 4 + 2] = Math.max(spans[sector * 4 + 2] ?? 0, column);
    spans[sector * 4 + 3] = Math.max(spans[sector * 4 + 3] ?? 0, row);
  }
  for (let sector = 1; sector < starts.length; sector++)
    starts[sector] = (starts[sector] ?? 0) + (starts[sector - 1] ?? 0);
  return { quads, starts, spans };
}

/** Whether a view may see any of one sector of a ring: its quads as one box, a quad further back west and north,
 *  where a vertex near the ring's edge slides onto the coarser grid, upright from `heights`' lowest to its highest
 *  (metres from the eye). */
function sectorSeen(
  planes: Planes,
  ring: ClipLevel,
  fromEye: readonly [number, number],
  heights: readonly [number, number],
  spans: Uint8Array,
  sector: number,
): boolean {
  const along = (axis: 0 | 1, quads: number) => ring.corner[axis] + fromEye[axis] + quads * ring.spacing;
  const [column = 0, row = 0, lastColumn = 0, lastRow = 0] = spans.subarray(sector * 4, sector * 4 + 4);
  return boxSeen(
    planes,
    [along(0, column - 1), along(1, row - 1), heights[0]],
    [along(0, lastColumn + 1), along(1, lastRow + 1), heights[1]],
  );
}

/**
 * A frame's draws of the rings, four numbers each: the first of the order's quads drawn, how many, the first ring and
 * how many rings. Each ring draws the sectors `planes` may see (and the finest those under its middle too), from the
 * eye at `eye` (window metres, its height as drawn) over ground drawn between `heights` (metres, as drawn); rings
 * after one another drawing the same quads join in one draw.
 */
export function ringDraws(
  planes: Planes,
  rings: readonly ClipLevel[],
  eye: readonly [number, number, number],
  heights: readonly [number, number],
  order: QuadOrder,
): number[] {
  const draws: number[] = [];
  const fromEye = [-eye[0], -eye[1]] as const;
  const upright = [heights[0] - eye[2], heights[1] - eye[2]] as const;
  let [last, joined] = ['', 0];
  for (const [index, ring] of rings.entries()) {
    const runs: number[] = [];
    for (let sector = 0; sector < (index === 0 ? 2 : 1) * CLIPMAP_SECTORS; sector++) {
      const [first, end] = [order.starts[sector] ?? 0, order.starts[sector + 1] ?? 0];
      if (first === end || !sectorSeen(planes, ring, fromEye, upright, order.spans, sector)) continue;
      const tail = runs.length - 2;
      if (tail >= 0 && (runs[tail] ?? 0) + (runs[tail + 1] ?? 0) === first) runs[tail + 1] = end - (runs[tail] ?? 0);
      else runs.push(first, end - first);
    }
    const key = runs.join(' ');
    if (index > 0 && key === last) {
      for (let draw = draws.length - joined * 4; draw < draws.length; draw += 4)
        draws[draw + 3] = (draws[draw + 3] ?? 0) + 1;
      continue;
    }
    for (let run = 0; run < runs.length; run += 2) draws.push(runs[run] ?? 0, runs[run + 1] ?? 0, index, 1);
    [last, joined] = [key, runs.length / 2];
  }
  return draws;
}
