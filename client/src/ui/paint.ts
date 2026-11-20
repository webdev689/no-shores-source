// The kit's roles as the GPU paints them: the frame, bevels, grounds and shadows `plus/kit.ts` gives a page's
// surfaces, as quads under a surface's words. Every length is in CSS pixels, drawn at `scale` device pixels each, so
// a whole scale keeps every edge on whole pixels.
import { BAND, framePixels, FRAME_SIDE, OUTSET } from '../plus/frame.ts';
import { BEVELS, TONES } from '../plus/tones.ts';
import { type Box, type Colour, colourOf, type QuadList, UNCLIPPED } from './quads.ts';

/** Where a tile lies in the atlas, laid from its RGBA pixels the first time it is wanted. */
export type Tiles = (key: string, width: number, height: number, pixels: () => Uint8Array) => Box | null;

/** How a pressable surface stands: at rest, under the pointer or focus, held down, or not to be pressed. */
export type State = 'rest' | 'hover' | 'active' | 'disabled';

/** The roles the GPU paints: the kit's, less the band roles a sheet lays as rules. */
export type PaintedRole = 'window' | 'panel' | 'button' | 'primary' | 'warn' | 'tile' | 'chip' | 'well' | 'track';

/** A box shadow as CSS writes it: its offset, its spread and its colour. */
interface Shade {
  readonly dx: number;
  readonly dy: number;
  readonly spread: number;
  readonly colour: string;
}

/** A role's paint in one state. */
export interface Look {
  /** The bevel's four edges, top, right, bottom, left, as `border-color` takes them. */
  readonly bevel?: string;
  readonly ground?: string;
  /** A lit band along the top and a shaded one along the foot, inside the bevel. */
  readonly bands?: readonly {
    readonly top: number;
    readonly lit: string;
    readonly foot: number;
    readonly shade: string;
  }[];
  /** Shadows outside the box, listed topmost first as CSS lists them. */
  readonly drops?: readonly Shade[];
  /** Shadows inside the bevel, listed topmost first. */
  readonly insets?: readonly Shade[];
  /** How far the whole surface moves down and right. */
  readonly shift?: number;
  /** The colour of its words. */
  readonly word: string;
}

const RING: Shade = { dx: 0, dy: 0, spread: 1, colour: TONES.outline };
const LIT_BAND = { top: 2, lit: 'rgba(255,255,255,0.08)', foot: 3, shade: 'rgba(0,0,0,0.32)' };
const PRESS_DROP: Shade = { dx: 2, dy: 2, spread: 1, colour: 'rgba(0,0,0,0.45)' };
const HELD: Shade = { dx: 2, dy: 2, spread: 0, colour: 'rgba(0,0,0,0.5)' };
const DISABLED: Look = {
  bevel: 'rgba(125,116,96,0.3) rgba(125,116,96,0.3) rgba(125,116,96,0.3) rgba(125,116,96,0.3)',
  ground: 'rgba(12,14,18,0.6)',
  drops: [{ dx: 0, dy: 0, spread: 1, colour: 'rgba(5,6,8,0.6)' }],
  word: TONES.wordDim,
};

/** A press in brass, stone or blood: raised at rest, lit under the pointer, sunk while held. */
function pressLooks(
  edges: { rest: string; hover: string; held: string },
  grounds: [string, string],
  word: [string, string],
) {
  const press = (bevel: string, ground: string, colour: string): Look => ({
    bevel,
    ground,
    bands: [LIT_BAND],
    drops: [RING, PRESS_DROP],
    word: colour,
  });
  return {
    rest: press(edges.rest, grounds[0], word[0]),
    hover: press(edges.hover, grounds[1], word[1]),
    active: { ...press(edges.held, grounds[1], word[1]), drops: [RING], insets: [HELD], shift: 1 },
    disabled: DISABLED,
  };
}

/** Each role's look in each state, as `plus/kit.ts` writes them for a page. */
export const LOOKS: Record<PaintedRole, Record<State, Look>> = {
  window: same({
    ground: TONES.ground,
    drops: [{ dx: 4, dy: 4, spread: OUTSET, colour: 'rgba(0,0,0,0.42)' }],
    word: TONES.word,
  }),
  panel: same({
    bevel: BEVELS.raised,
    ground: TONES.groundPanel,
    drops: [RING, { dx: 3, dy: 3, spread: 1, colour: 'rgba(0,0,0,0.4)' }],
    insets: [
      { dx: 0, dy: 0, spread: 1, colour: 'rgba(5,6,8,0.75)' },
      { dx: 0, dy: 3, spread: -1, colour: 'rgba(255,255,255,0.04)' },
    ],
    word: TONES.word,
  }),
  button: pressLooks(
    { rest: BEVELS.raised, hover: BEVELS.brass, held: BEVELS.sunk },
    [TONES.groundButton, TONES.groundButtonHi],
    [TONES.word, TONES.word],
  ),
  primary: pressLooks(
    { rest: BEVELS.brass, hover: BEVELS.brass, held: BEVELS.sunk },
    ['#2a2217', '#3a2e1c'],
    [TONES.word, TONES.word],
  ),
  warn: pressLooks(
    { rest: BEVELS.blood, hover: BEVELS.bloodHi, held: BEVELS.bloodSunk },
    ['#241514', '#321b19'],
    ['#f4dfd8', '#fff3ee'],
  ),
  tile: {
    rest: tileLook(BEVELS.raisedSoft),
    hover: tileLook(BEVELS.brass),
    active: tileLook(BEVELS.sunk),
    disabled: tileLook(BEVELS.raisedSoft),
  },
  chip: same({
    bevel: BEVELS.raisedSoft,
    ground: TONES.groundChip,
    drops: [RING, { dx: 2, dy: 2, spread: 1, colour: 'rgba(0,0,0,0.35)' }],
    word: TONES.word,
  }),
  well: same({ bevel: BEVELS.sunk, drops: [RING], insets: [HELD], word: TONES.word }),
  track: same({ bevel: BEVELS.sunk, ground: TONES.groundTrack, drops: [RING], word: TONES.word }),
};

function same(look: Look): Record<State, Look> {
  return { rest: look, hover: look, active: look, disabled: look };
}

function tileLook(bevel: string): Look {
  return {
    bevel,
    bands: [{ top: 2, lit: 'rgba(255,255,255,0.06)', foot: 0, shade: 'transparent' }],
    drops: [RING],
    word: TONES.word,
  };
}

/** `outer` less `hole`: up to four boxes, the bands above, below, left and right of the hole. */
export function without(outer: Box, hole: Box): Box[] {
  const [left, top] = [Math.max(outer.x, hole.x), Math.max(outer.y, hole.y)];
  const right = Math.min(outer.x + outer.width, hole.x + hole.width);
  const bottom = Math.min(outer.y + outer.height, hole.y + hole.height);
  if (right <= left || bottom <= top) return [outer];
  const bands = [
    { x: outer.x, y: outer.y, width: outer.width, height: top - outer.y },
    { x: outer.x, y: bottom, width: outer.width, height: outer.y + outer.height - bottom },
    { x: outer.x, y: top, width: left - outer.x, height: bottom - top },
    { x: right, y: top, width: outer.x + outer.width - right, height: bottom - top },
  ];
  return bands.filter((band) => band.width > 0 && band.height > 0);
}

/** `box` grown by `step` on every side. */
export function grown(box: Box, step: number): Box {
  return { x: box.x - step, y: box.y - step, width: box.width + 2 * step, height: box.height + 2 * step };
}

/** RGBA pixels of a `side` square from a colour or null at each pixel. */
function rgbaOf(colours: readonly (string | null)[]): Uint8Array {
  const pixels = new Uint8Array(colours.length * 4);
  colours.forEach((colour, index) => {
    if (!colour) return;
    const [red, green, blue, alpha] = colourOf(colour);
    pixels.set([red * 255, green * 255, blue * 255, alpha * 255].map(Math.round), index * 4);
  });
  return pixels;
}

/** A bevel `width` device pixels deep as a picture `2 * width + 1` square: each corner split on its diagonal, as a
 *  browser mitres a border, each pixel on the diagonal an even mix of the two edges. */
export function bevelPixels(bevel: string, width: number): (string | null)[] {
  const [top, right = top, bottom = top, left = right] = splitColours(bevel);
  const side = 2 * width + 1;
  const pixels: (string | null)[] = [];
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const [fromLeft, fromRight, fromTop, fromBottom] = [x, side - 1 - x, y, side - 1 - y];
      const across = Math.min(fromLeft, fromRight);
      const down = Math.min(fromTop, fromBottom);
      const level = fromTop <= fromBottom ? top : bottom;
      const upright = fromLeft <= fromRight ? left : right;
      if (across >= width && down >= width) pixels.push(null);
      else if (down === across) pixels.push(mixed(level, upright));
      else pixels.push(down < across ? level : upright);
    }
  }
  return pixels;
}

/** The even mix of two CSS colours, as CSS. */
function mixed(one: string, two: string): string {
  const [first, second] = [colourOf(one), colourOf(two)];
  const [red, green, blue, alpha] = first.map((channel, index) => (channel + (second[index] ?? 0)) / 2);
  return `rgba(${(red ?? 0) * 255}, ${(green ?? 0) * 255}, ${(blue ?? 0) * 255}, ${alpha ?? 1})`;
}

/** A CSS colour list's colours, commas inside `rgba()` kept. */
function splitColours(list: string): string[] {
  return list.match(/rgba?\([^)]*\)|#[0-9a-f]+|transparent/gi) ?? [];
}

/** The window's 4 px stone grain: a checker lit in its top-right and bottom-left quarters. */
function grainPixels(): Uint8Array {
  const pixels = new Uint8Array(4 * 4 * 4);
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) if (x >= 2 !== y >= 2) pixels.fill(255, (y * 4 + x) * 4, (y * 4 + x) * 4 + 4);
  return pixels;
}

/** Draws `tile` (texels) over `box` cut in nine: its corners `slice` texels square at `unit` pixels a texel, its
 *  edges stretched between, its middle left out; faded in by `fade`. */
export function nineSlice(
  quads: QuadList,
  box: Box,
  tile: Box,
  cut: { readonly slice: number; readonly unit: number; readonly fade?: number },
  clip: Box = UNCLIPPED,
): void {
  const { slice, unit, fade = 1 } = cut;
  const corner = slice * unit;
  const across = [
    [box.x, corner, tile.x, slice],
    [box.x + corner, box.width - 2 * corner, tile.x + slice, tile.width - 2 * slice],
    [box.x + box.width - corner, corner, tile.x + tile.width - slice, slice],
  ];
  const down = [
    [box.y, corner, tile.y, slice],
    [box.y + corner, box.height - 2 * corner, tile.y + slice, tile.height - 2 * slice],
    [box.y + box.height - corner, corner, tile.y + tile.height - slice, slice],
  ];
  down.forEach(([y, height, texelY, texelsHigh], row) =>
    across.forEach(([x, width, texelX, texelsWide], column) => {
      if (row === 1 && column === 1) return;
      const texels = { x: texelX, y: texelY, width: texelsWide, height: texelsHigh };
      quads.add({ x, y, width, height }, [1, 1, 1, fade], clip, texels);
    }),
  );
}

/** Paints `role` in `state` over `box` (device pixels), its bevel `border` CSS pixels deep, at `scale` device pixels a
 *  CSS pixel; answers the look, for the words laid on it, and the box as it stands (moved while held). */
export function paint(
  quads: QuadList,
  tiles: Tiles,
  role: PaintedRole,
  where: {
    readonly box: Box;
    readonly scale: number;
    readonly border?: number;
    readonly state?: State;
    /** How far it has faded in, 0 to 1. */
    readonly fade?: number;
  },
  clip: Box = UNCLIPPED,
): { look: Look; box: Box } {
  const { scale, border = 2, state = 'rest', fade = 1 } = where;
  const tone = (css: string): Colour => {
    const [red, green, blue, alpha] = colourOf(css);
    return [red, green, blue, alpha * fade];
  };
  const look = LOOKS[role][state];
  const shift = (look.shift ?? 0) * scale;
  const box = { ...where.box, x: where.box.x + shift, y: where.box.y + shift };
  const inner = grown(box, -border * scale);
  // CSS lists shadows topmost first; the bottom one is drawn first.
  // A shadow outside the box is never drawn under it, as CSS clips it, so a clear ground shows what lies behind.
  for (const drop of [...(look.drops ?? [])].reverse()) {
    const moved = { ...box, x: box.x + drop.dx * scale, y: box.y + drop.dy * scale };
    for (const part of without(grown(moved, drop.spread * scale), box)) quads.add(part, tone(drop.colour), clip);
  }
  if (look.ground) quads.add(role === 'window' ? inner : box, tone(look.ground), clip);
  if (role === 'window') {
    const grain = tiles('grain', 4, 4, grainPixels);
    if (grain) quads.add(inner, [1, 1, 1, 0.022 * fade], clip, { ...grain, tile: scale });
  }
  for (const band of look.bands ?? []) {
    quads.add({ ...inner, height: band.top * scale }, tone(band.lit), clip);
    const foot = band.foot * scale;
    if (band.shade !== 'transparent')
      quads.add({ ...inner, y: inner.y + inner.height - foot, height: foot }, tone(band.shade), clip);
  }
  for (const inset of [...(look.insets ?? [])].reverse()) {
    const hole = grown(
      { ...inner, x: inner.x + inset.dx * scale, y: inner.y + inset.dy * scale },
      -inset.spread * scale,
    );
    for (const part of without(inner, hole)) quads.add(part, tone(inset.colour), clip);
  }
  if (role === 'window') {
    const frame = tiles('frame', FRAME_SIDE, FRAME_SIDE, () => rgbaOf(framePixels()));
    if (frame) nineSlice(quads, grown(box, OUTSET * scale), frame, { slice: BAND, unit: scale, fade }, clip);
  } else if (look.bevel && border > 0) {
    // Drawn a device pixel a texel, as a browser mitres its corners at the screen's own pixels.
    const depth = border * scale;
    const side = 2 * depth + 1;
    const bevel = tiles(`bevel ${look.bevel} ${depth}`, side, side, () => rgbaOf(bevelPixels(look.bevel ?? '', depth)));
    if (bevel) nineSlice(quads, box, bevel, { slice: depth, unit: 1, fade }, clip);
  }
  return { look, box };
}
