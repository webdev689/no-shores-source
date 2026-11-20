// A 4 by 4 matrix's inverse, so a pass can read a pixel's depth back into the point drawn there, measured from the eye.

/** The inverse of the column-major `matrix`, worked in double precision; null when it has none. */
export function inverted(matrix: ArrayLike<number>): Float32Array | null {
  // Gauss-Jordan on the matrix beside the identity, each column's pivot the row with the largest value in it.
  const grid = new Float64Array(32);
  const cell = (row: number, column: number) => grid[row * 8 + column] ?? 0;
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 4; column++) grid[row * 8 + column] = matrix[column * 4 + row] ?? 0;
    grid[row * 8 + 4 + row] = 1;
  }
  for (let column = 0; column < 4; column++) {
    let pivot = column;
    for (let row = column + 1; row < 4; row++)
      if (Math.abs(cell(row, column)) > Math.abs(cell(pivot, column))) pivot = row;
    const lead = cell(pivot, column);
    if (Math.abs(lead) < 1e-300) return null;
    for (let across = 0; across < 8; across++) {
      const kept = cell(column, across);
      grid[column * 8 + across] = cell(pivot, across) / lead;
      if (pivot !== column) grid[pivot * 8 + across] = kept;
    }
    for (let row = 0; row < 4; row++) {
      const share = row === column ? 0 : cell(row, column);
      for (let across = 0; across < 8; across++)
        grid[row * 8 + across] = cell(row, across) - share * cell(column, across);
    }
  }
  const out = new Float32Array(16);
  for (let row = 0; row < 4; row++)
    for (let column = 0; column < 4; column++) out[column * 4 + row] = cell(row, 4 + column);
  return out;
}
