/** Which frames of a plant's impostor sheet show it from a direction, and how much of each: the two azimuths round
 *  it either side of the view, and the two elevations either side. natureShader.ts chooses the same on the GPU. */
export interface Frames {
  readonly columns: readonly [number, number];
  /** How much of the second column: 0 shows the first alone. */
  readonly across: number;
  readonly rows: readonly [number, number];
  readonly down: number;
}

/**
 * The frames for a view: `toEye` from the plant to the eye in the plant's own game frame (x east, y south, z up,
 * its turn undone). The sheet was rendered in Blender's frame, its y the other way round, column c seen from
 * azimuth c of `azimuths` round from Blender's x, row r from `elevations[r]` degrees up.
 */
export function framesFor(
  toEye: readonly [number, number, number],
  azimuths: number,
  elevations: readonly number[],
): Frames {
  const [x, y, z] = [toEye[0], -toEye[1], toEye[2]];
  const turn = (Math.atan2(y, x) / (Math.PI * 2) + 1) % 1;
  const step = turn * azimuths;
  const first = Math.floor(step) % azimuths;
  const up = (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI;
  const last = elevations.length - 1;
  let row = 0;
  while (row < last - 1 && up > (elevations[row + 1] ?? 0)) row++;
  const low = elevations[row] ?? 0;
  const high = elevations[Math.min(row + 1, last)] ?? low;
  const down = high > low ? Math.min(1, Math.max(0, (up - low) / (high - low))) : 0;
  return {
    columns: [first, (first + 1) % azimuths],
    across: step - Math.floor(step),
    rows: [row, Math.min(row + 1, last)],
    down,
  };
}
