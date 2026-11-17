/** Catmull-Rom through `start`..`end` at `fraction`, `previous` and `next` the samples either side. */
function catmull(previous: number, start: number, end: number, next: number, fraction: number): number {
  return (
    start +
    0.5 *
      fraction *
      (end -
        previous +
        fraction * (2 * previous - 5 * start + 4 * end - next + fraction * (3 * (start - end) + next - previous)))
  );
}

/** A grid's sample at (across, down), the edge samples repeating past it. */
function sampler(values: ArrayLike<number>, width: number, height: number) {
  return (across: number, down: number): number => {
    const [clampedX, clampedY] = [Math.min(width - 1, Math.max(0, across)), Math.min(height - 1, Math.max(0, down))];
    return values[clampedY * width + clampedX] ?? 0;
  };
}

/**
 * The value of a grid of samples, row by row, at (gridX, gridY) in samples from sample (0, 0), along Catmull-Rom
 * splines through them: the land crate's own cubic, and the curve the GPU draws the 1 km land along. Edge samples
 * repeat.
 */
export function splineAt(
  values: ArrayLike<number>,
  width: number,
  height: number,
  gridX: number,
  gridY: number,
): number {
  const [column, row] = [Math.floor(gridX), Math.floor(gridY)];
  const sample = sampler(values, width, height);
  const along = (down: number) =>
    catmull(
      sample(column - 1, down),
      sample(column, down),
      sample(column + 1, down),
      sample(column + 2, down),
      gridX - column,
    );
  return catmull(along(row - 1), along(row), along(row + 1), along(row + 2), gridY - row);
}

/**
 * As `splineAt`, held between the lowest and the highest of the four samples round the point: the close-up's ground,
 * as the GPU's spline_at draws it. The exact ground steps sheer at a city's pads (a terrace, a plaza), and a cubic
 * through a step overshoots it by about 7 %, a ridge metres high along every pad's edge; held, the pad stays level to
 * its last sample and the ground falls from there.
 */
export function heldSplineAt(
  values: ArrayLike<number>,
  width: number,
  height: number,
  gridX: number,
  gridY: number,
): number {
  const [column, row] = [Math.floor(gridX), Math.floor(gridY)];
  const sample = sampler(values, width, height);
  const round = [sample(column, row), sample(column + 1, row), sample(column, row + 1), sample(column + 1, row + 1)];
  const value = splineAt(values, width, height, gridX, gridY);
  return Math.min(Math.max(value, Math.min(...round)), Math.max(...round));
}
