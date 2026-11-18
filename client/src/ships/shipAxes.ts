/** Her own axes (to her bow, to starboard, up) in the world's (east, south, up), as she lies at `heading` (radians
 *  clockwise from north), her bow risen by `pitch` and heeled to starboard by `roll`: her roll, then her pitch, then
 *  her heading. */
export function shipAxes(
  heading: number,
  pitch: number,
  roll: number,
): readonly [readonly number[], readonly number[], readonly number[]] {
  const [forward, starboard, up] = [
    [Math.sin(heading), -Math.cos(heading), 0],
    [Math.cos(heading), Math.sin(heading), 0],
    [0, 0, 1],
  ];
  const [sinPitch, cosPitch, sinRoll, cosRoll] = [Math.sin(pitch), Math.cos(pitch), Math.sin(roll), Math.cos(roll)];
  const along = (ahead: number, aside: number, above: number) =>
    [0, 1, 2].map((axis) => ahead * (forward[axis] ?? 0) + aside * (starboard[axis] ?? 0) + above * (up[axis] ?? 0));
  return [
    along(cosPitch, 0, sinPitch),
    along(sinRoll * sinPitch, cosRoll, -sinRoll * cosPitch),
    along(-cosRoll * sinPitch, sinRoll, cosRoll * cosPitch),
  ];
}
