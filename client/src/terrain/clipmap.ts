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
