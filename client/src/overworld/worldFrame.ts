// The world's frame, and the grid the held map lays its coasts and waters on over it.

/** The world's frame, metres. */
export const WORLD_FRAME = { widthM: 4_915_200, heightM: 3_072_000 } as const;
/** A cell's side of the held map's grid, metres: the frame is 1,024 of them across and 640 down. */
export const CHART_CELL_M = 4_800;
export const CHART_COLUMNS = WORLD_FRAME.widthM / CHART_CELL_M;
export const CHART_ROWS = WORLD_FRAME.heightM / CHART_CELL_M;
