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

/**
 * The value of a grid of samples, row by row, at (gridX, gridY) in samples from sample (0, 0), along Catmull-Rom
 * splines through them: the land crate's own cubic, and the curve the GPU draws the land along. Edge samples repeat.
 */
export function splineAt(
  values: ArrayLike<number>,
  width: number,
  height: number,
  gridX: number,
  gridY: number,
): number {
  const [column, row] = [Math.floor(gridX), Math.floor(gridY)];
  const sample = (across: number, down: number) => {
    const [clampedX, clampedY] = [Math.min(width - 1, Math.max(0, across)), Math.min(height - 1, Math.max(0, down))];
    return values[clampedY * width + clampedX] ?? 0;
  };
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
