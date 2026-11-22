// The gauntlet, DFO's own pointer: a grey hand pointing up and to the left, and a second frame with the finger drawn
// in while a button is held. Pixel art kept as rows of its five colours, darkest first, so it needs no picture file:
// the mouse wears it as the canvas's cursor (`canvasEvents.ts`) and the pad's cursor is drawn from it (`padCursor.ts`).

/** Its size in pixels: never past 32 a side, as a browser shows a larger cursor only while it is wholly in the view. */
export const GAUNTLET_SIZE = { width: 31, height: 32 } as const;

/** The colours its rows name by digit; a dot is clear. */
const COLOURS = ['#08090c', '#0c0e12', '#30363e', '#5c646e', '#929aa4'] as const;

/** Its two frames, a row of digits each line of pixels; the point it presses is the top left in both. */
export const GAUNTLET = {
  point: [
    '000000.........................',
    '0111200...0000000..............',
    '012321000003221200.............',
    '0223322222223221200............',
    '00133321222233121200...........',
    '.02124423432134221200..........',
    '.00223431234213311220..........',
    '..00223431234213433100.........',
    '...0112343114433421120.........',
    '...0122234434332211110.........',
    '..00423234444432221110.........',
    '..023133333344433221100........',
    '..023123133444443221120........',
    '..0231142234444432223300.......',
    '..02343113433444332222300......',
    '..013322134334443322212200.....',
    '..0012222343334443233332200....',
    '...0012223433344444304333200...',
    '....0022224323244443334330200..',
    '.....0012332223444433234322200.',
    '......0012222344444332233322100',
    '.......001222334444442222322220',
    '........00123234444443322222110',
    '..........012223444431111122110',
    '..........002222344111212222110',
    '...........02122331111222221120',
    '...........00112211222222212200',
    '............021222232322211000.',
    '............0012222222211200...',
    '.............01112222112000....',
    '.............000111111000......',
    '...............00000000........',
  ],
  press: [
    '...............................',
    '..............000..............',
    '.............21200.............',
    '............3221200............',
    '....000000.233121200...........',
    '....01112032134221200..........',
    '....01232234213311220..........',
    '....022331234213433100.........',
    '....001343114433421120.........',
    '.....02234434332211110.........',
    '.....23234444432221110.........',
    '....3133333344433221100........',
    '...23123133444443221120........',
    '..0231142234444432223300.......',
    '..02343113433444332222300......',
    '..013322134334443322212200.....',
    '..0012222343334443233332200....',
    '...0012223433344444304333200...',
    '....0022224323244443334330200..',
    '.....0012332223444433234322200.',
    '......0012222344444332233322100',
    '.......001222334444442222322220',
    '........00123234444443322222110',
    '..........012223444431111122110',
    '..........002222344111212222110',
    '...........02122331111222221120',
    '...........00112211222222212200',
    '............021222232322211000.',
    '............0012222222211200...',
    '.............01112222112000....',
    '.............000111111000......',
    '...............00000000........',
  ],
} as const;
export type GauntletFrame = keyof typeof GAUNTLET;

/** What the interface asks the page to wear as the pointer's look where the gauntlet is worn. */
export const GAUNTLET_CURSOR = 'gauntlet';

/** The pointer's look in the game and the Test Ground: the gauntlet for the arrow and the hand; the text caret over a
 *  field and none (the pad's cursor drawn instead) kept. */
export const gauntletOver = (cursor: string): string =>
  cursor === 'default' || cursor === 'pointer' ? GAUNTLET_CURSOR : cursor;

/** Each pixel of `frame`: its column, its row and its colour's place in `COLOURS`, the clear left out. */
function painted(frame: GauntletFrame): { x: number; y: number; colour: number }[] {
  return GAUNTLET[frame].flatMap((row, y) =>
    [...row].flatMap((digit, x) => (digit === '.' ? [] : [{ x, y, colour: Number(digit) }])),
  );
}

/** `frame`'s RGBA pixels, row by row, for the interface to draw. */
export function gauntletPixels(frame: GauntletFrame): Uint8Array {
  const pixels = new Uint8Array(GAUNTLET_SIZE.width * GAUNTLET_SIZE.height * 4);
  for (const { x, y, colour } of painted(frame)) {
    const hex = COLOURS[colour] ?? '#000000';
    const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
    pixels.set([...channels, 255], (y * GAUNTLET_SIZE.width + x) * 4);
  }
  return pixels;
}

/** `frame` as an SVG picture's data URL, each pixel `scale` pixels a side and kept square-edged. */
function gauntletUrl(frame: GauntletFrame, scale: number): string {
  const { width, height } = GAUNTLET_SIZE;
  const paths = COLOURS.map((colour, place) => {
    const squares = painted(frame).filter((pixel) => pixel.colour === place);
    return `<path fill="${colour}" d="${squares.map(({ x, y }) => `M${x} ${y}h1v1h-1z`).join('')}"/>`;
  });
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width * scale}" height="${height * scale}" ` +
    `viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${paths.join('')}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const worn = new Map<GauntletFrame, readonly [string, string]>();

/** `frame` as the CSS cursor the canvas wears: the picture alone, for a browser that cannot choose by the screen's
 *  ratio, and then the picture at 1x and 2x for one that can, the point it presses at the top left. */
export function gauntletCss(frame: GauntletFrame): readonly [plain: string, sharp: string] {
  let css = worn.get(frame);
  if (!css) {
    const plain = gauntletUrl(frame, 1);
    css = [`${plain} 0 0, auto`, `image-set(${plain} 1x, ${gauntletUrl(frame, 2)} 2x) 0 0, auto`];
    worn.set(frame, css);
  }
  return css;
}
