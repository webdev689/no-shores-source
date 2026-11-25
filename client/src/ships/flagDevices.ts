// What a flag bears over its ground, drawn in its ink on the flag's square picture: shapes laid by where a texel falls
// on the flag (a cross set toward the hoist, a saltire, a bar, quarters, a border, a star) and signs drawn pixel for
// pixel (an anchor, a gull, a bolt, a lamp, a moon), each pixel two texels across and three down, so a sign stands
// square on a flag half again as long as it is deep. A flag's picture is the same bytes every time.

/** Whether a texel `along` the flag from its hoist and `down` it (each 0 to 1) is ink for a shape `device`; none for a
 *  device drawn as a sign. */
export function shapeInks(device: string, along: number, down: number): boolean | null {
  // A flag is half again as long as it is deep: a band a share of its depth wide is two thirds that share along it.
  const lengthwise = (depth: number) => depth / 1.5;
  switch (device) {
    case 'cross':
      return Math.abs(along - 0.36) < lengthwise(0.09) || Math.abs(down - 0.5) < 0.09;
    case 'saltire':
      return Math.abs(along - down) < 0.1 || Math.abs(along - (1 - down)) < 0.1;
    case 'bar':
      return Math.abs(down - 0.5) < 0.14;
    case 'quarters':
      return along < 0.5 !== down < 0.5;
    case 'border':
      return along < lengthwise(0.1) || along > 1 - lengthwise(0.1) || down < 0.1 || down > 0.9;
    case 'star':
      return inStar(along, down);
    default:
      return null;
  }
}

/** A five-pointed star in the flag's middle, set square on it. */
function inStar(along: number, down: number): boolean {
  const [x, y] = [(along - 0.5) * 1.5, down - 0.5];
  const reach = Math.hypot(x, y);
  // Its edge swings between its points' reach and its notches' as the angle turns through a fifth.
  const turn = Math.atan2(x, -y);
  const fifth = (2 * Math.PI) / 5;
  const into = Math.abs(((((turn % fifth) + fifth) % fifth) / fifth) * 2 - 1);
  return reach < 0.17 + 0.17 * into;
}

/** The signs drawn pixel for pixel, each row a run of pixels, `#` ink and `.` the ground. */
const SIGNS: Readonly<Record<string, readonly string[]>> = {
  anchor: [
    '.....#.....',
    '....#.#....',
    '.....#.....',
    '..#######..',
    '.....#.....',
    '.....#.....',
    '.....#.....',
    '#....#....#',
    '##...#...##',
    '.##..#..##.',
    '..#######..',
  ],
  gull: [
    '...........',
    '...........',
    '##.......##',
    '.##.....##.',
    '..##...##..',
    '...##.##...',
    '....###....',
    '.....#.....',
    '...........',
    '...........',
    '...........',
  ],
  bolt: [
    '......###..',
    '.....###...',
    '....###....',
    '...###.....',
    '..#######..',
    '.....###...',
    '....###....',
    '...###.....',
    '..##.......',
    '.#.........',
    '...........',
  ],
  lamp: [
    '.....#.....',
    '....###....',
    '....###....',
    '.....#.....',
    '...#####...',
    '..#.....#..',
    '..#.###.#..',
    '..#.###.#..',
    '..#.....#..',
    '...#####...',
    '..#######..',
  ],
  moon: [
    '....####...',
    '...##......',
    '..##.......',
    '.##........',
    '.##........',
    '.##........',
    '.##........',
    '..##.......',
    '...##......',
    '....####...',
    '...........',
  ],
};

/** Texels a sign's pixel takes across and down the flag's square picture. */
export const SIGN_TEXELS = [2, 3] as const;

/** Whether a texel at (`x`, `y`) of a `size` square picture is ink for a sign `device`, its rows laid in the picture's
 *  middle; none for a device that is no sign. */
export function signInks(device: string, x: number, y: number, size: number): boolean | null {
  const rows = SIGNS[device];
  if (!rows) return null;
  const [across, down] = SIGN_TEXELS;
  const width = (rows[0]?.length ?? 0) * across;
  const [left, top] = [(size - width) >> 1, (size - rows.length * down) >> 1];
  const [column, row] = [Math.floor((x - left) / across), Math.floor((y - top) / down)];
  if (x < left || y < top || row >= rows.length) return false;
  return rows[row]?.[column] === '#';
}

/** Every device a flag of the catalogue may bear, the shapes' and the signs'. */
export const DEVICES: readonly string[] = [
  'cross',
  'saltire',
  'bar',
  'quarters',
  'border',
  'star',
  ...Object.keys(SIGNS),
];
