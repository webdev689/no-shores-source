// What the fight's bars draw inside their boxes, as quads: a strip's bands (a lit line on top, its colour, a shaded
// foot), a hatch, the pieces a loss breaks off, and the marks across a bar. Every length is in CSS pixels, drawn at
// `scale` device pixels each and snapped to whole device pixels; colours are CSS colours the kit writes.
import { BAR_EDGE, BAR_TONES, type BarTone, barFrameCells, tipOf } from '../plus/barFrame.ts';
import { pieceAt } from '../plus/barLoss.ts';
import type { LostLook, Meter } from '../plus/meter.ts';
import { TONES } from '../plus/tones.ts';
import type { Box } from '../ui/quads.ts';
import { colourOf } from '../ui/quads.ts';
import type { Drawing, Node } from '../ui/node.ts';
import { baselineOf, lineHeight } from '../ui/text.ts';
import type { UiRenderer } from '../ui/uiRenderer.ts';

/** `one` mixed with `share` of `two`, as CSS's `color-mix(in srgb, one, two share)` writes it. */
export function mix(one: string, two: string, share: number): string {
  const [first, second] = [colourOf(one), colourOf(two)];
  const [red, green, blue, alpha] = first.map((channel, index) => channel * (1 - share) + (second[index] ?? 0) * share);
  const byte = (channel = 0) => Math.round(channel * 255);
  return `rgba(${byte(red)}, ${byte(green)}, ${byte(blue)}, ${alpha ?? 1})`;
}

/** `css` at `alpha` times its own opacity. */
export function faded(css: string, alpha: number): string {
  const [red, green, blue, own] = colourOf(css);
  const byte = (channel: number) => Math.round(channel * 255);
  return `rgba(${byte(red)}, ${byte(green)}, ${byte(blue)}, ${own * alpha})`;
}

/** A bar's box and how it is drawn this frame: its device box, device pixels a CSS pixel, its clip and its fade. */
export interface Pen {
  readonly ui: UiRenderer;
  readonly box: Box;
  readonly scale: number;
  readonly clip: Box;
  readonly fade?: number;
}

const snap = (box: Box): Box => {
  const [left, top] = [Math.round(box.x), Math.round(box.y)];
  return { x: left, y: top, width: Math.round(box.x + box.width) - left, height: Math.round(box.y + box.height) - top };
};

/** Fills `box` (device pixels) with `css`, faded by the pen's fade. */
export function paintBox(pen: Pen, box: Box, css: string): void {
  if (css === 'transparent') return;
  const [red, green, blue, alpha] = colourOf(css);
  pen.ui.quads.add(snap(box), [red, green, blue, alpha * (pen.fade ?? 1)], pen.clip);
}

/** The part of the pen's box from `from` to `to` (shares of its width), moved by `x`, `y` CSS pixels. */
export function span(pen: Pen, from: number, to: number, x = 0, y = 0): Box {
  const { box, scale } = pen;
  const left = box.x + Math.max(0, Math.min(1, from)) * box.width;
  const right = box.x + Math.max(0, Math.min(1, to)) * box.width;
  return { x: left + x * scale, y: box.y + y * scale, width: right - left, height: box.height };
}

/** A strip over `box` in bands from the top: a top line `top` CSS pixels deep, its body, and a foot `foot` deep. */
export function bands(
  pen: Pen,
  box: Box,
  colours: {
    readonly top?: string;
    readonly topDeep?: number;
    readonly body: string;
    readonly foot?: string;
    readonly footDeep?: number;
  },
): void {
  const top = (colours.topDeep ?? 0) * pen.scale;
  const foot = (colours.footDeep ?? 0) * pen.scale;
  paintBox(pen, { ...box, y: box.y + top, height: box.height - top - foot }, colours.body);
  if (colours.top && top > 0) paintBox(pen, { ...box, height: top }, colours.top);
  if (colours.foot && foot > 0) paintBox(pen, { ...box, y: box.y + box.height - foot, height: foot }, colours.foot);
}

/** A ring `width` CSS pixels wide round the outside of `box`, as a 1 px box shadow of no blur draws. */
export function ring(pen: Pen, box: Box, css: string, width = 1): void {
  const step = width * pen.scale;
  paintBox(pen, { x: box.x - step, y: box.y - step, width: box.width + 2 * step, height: step }, css);
  paintBox(pen, { x: box.x - step, y: box.y + box.height, width: box.width + 2 * step, height: step }, css);
  paintBox(pen, { x: box.x - step, y: box.y, width: step, height: box.height }, css);
  paintBox(pen, { x: box.x + box.width, y: box.y, width: step, height: box.height }, css);
}

/** `box` grown by `step` device pixels on every side (shrunk for a step below none). */
export const grownBy = (box: Box, step: number): Box => ({
  x: box.x - step,
  y: box.y - step,
  width: box.width + 2 * step,
  height: box.height + 2 * step,
});

/** A border round the inside of `box`, its sides as CSS's `border-color` and `border-width` list them (top, right,
 *  bottom, left; one left out takes the one across from it), each depth in CSS pixels. A side with no colour is not
 *  drawn and takes no room; the top and the bottom run the box's width, the sides between them. */
export function edges(pen: Pen, box: Box, colours: readonly string[], depths: number | readonly number[] = 1): void {
  const [top = '', right = top, bottom = top, left = right] = colours;
  const [up = 1, across = up, down = up, back = across] = typeof depths === 'number' ? [depths] : depths;
  const deep = (colour: string, depth: number) => (colour ? depth * pen.scale : 0);
  const [high, wide, low, near] = [deep(top, up), deep(right, across), deep(bottom, down), deep(left, back)];
  const between = { y: box.y + high, height: box.height - high - low };
  const sides: (readonly [Box, string])[] = [
    [{ ...box, height: high }, top],
    [{ ...box, y: box.y + box.height - low, height: low }, bottom],
    [{ ...box, ...between, width: near }, left],
    [{ ...box, ...between, x: box.x + box.width - wide, width: wide }, right],
  ];
  for (const [part, colour] of sides) if (colour && part.width > 0 && part.height > 0) paintBox(pen, part, colour);
}

/** `edges` as a node's drawing, faded to `fade` with the node; with `outline`, a 1 px ring of it round the outside. */
export const edged =
  (
    colours: readonly string[],
    depths: number | readonly number[] = 1,
    outline: string | null = null,
    fade = 1,
  ): Drawing =>
  (ui, box, scale, clip, shown) => {
    const pen = { ui, box, scale, clip, fade: fade * shown };
    if (outline) ring(pen, box, outline);
    edges(pen, box, colours, depths);
  };

/** The kit's fill (its `meter` role) over `box` in `fill`: a lit top line, a shaded 2 px foot and a lit right end. */
export function kitFill(pen: Pen, box: Box, fill: string): void {
  if (box.width <= 0) return;
  bands(pen, box, {
    top: mix(fill, '#ffffff', 0.34),
    topDeep: 1,
    body: fill,
    foot: mix(fill, '#000000', 0.36),
    footDeep: 2,
  });
  const end = Math.min(box.width, 2 * pen.scale);
  paintBox(pen, { ...box, x: box.x + box.width - end, width: end }, 'rgba(255,255,255,0.42)');
}

/** The iron hatch, red stripes running up to the right 4 px wide and dark 2 px between. */
const HATCH_SIDE = 8;
function hatchPixels(): Uint8Array {
  const pixels = new Uint8Array(HATCH_SIDE * HATCH_SIDE * 4);
  for (let y = 0; y < HATCH_SIDE; y++)
    for (let x = 0; x < HATCH_SIDE; x++) {
      const red = (x + y) % HATCH_SIDE < 6;
      pixels.set(red ? [0xd8, 0x34, 0x2c, 255] : [0x7a, 0x14, 0x10, 255], (y * HATCH_SIDE + x) * 4);
    }
  return pixels;
}

/** Fills `box` with the iron hatch. */
export function hatch(pen: Pen, box: Box): void {
  const tile = pen.ui.tileTexels('iron hatch', HATCH_SIDE, HATCH_SIDE, hatchPixels);
  if (tile) pen.ui.quads.add(snap(box), [1, 1, 1, pen.fade ?? 1], pen.clip, { ...tile, tile: pen.scale });
}

/** A falling piece of a bar `fill`: its two halves, the left one 55% of it, each where it has fallen and how much of
 *  it shows, edged in the outline, lit cream on top and shaded at its foot. */
export function piece(
  pen: Pen,
  from: number,
  width: number,
  halves: readonly ({ readonly x: number; readonly y: number; readonly opacity: number } | null)[],
  fill: string,
): void {
  const parts = [
    [from, from + width * 0.55],
    [from + width * 0.55, from + width],
  ] as const;
  parts.forEach(([start, end], index) => {
    const place = halves[index];
    if (!place || place.opacity <= 0) return;
    const half = { ...pen, fade: (pen.fade ?? 1) * place.opacity };
    const box = span(half, start, end, place.x, place.y);
    ring(half, box, TONES.outline);
    bands(half, box, {
      top: '#fff6e4',
      topDeep: 2,
      body: fill,
      foot: mix(fill, '#000000', 0.35),
      footDeep: 3,
    });
  });
}

/** A mark across a bar at `share` of it, `width` CSS pixels wide in `css` and reaching `over` past its top and foot,
 *  with a line of `side` either side (one on the right when `rightOnly`). */
export function markAt(
  pen: Pen,
  share: number,
  look: {
    readonly css: string;
    readonly width: number;
    readonly over?: number;
    readonly side?: string;
    readonly rightOnly?: boolean;
  },
): void {
  const { box, scale } = pen;
  const middle = box.x + share * box.width;
  const over = (look.over ?? 0) * scale;
  const tall = { y: box.y - over, height: box.height + 2 * over };
  const half = (look.width * scale) / 2;
  paintBox(pen, { x: middle - half, width: 2 * half, ...tall }, look.css);
  if (!look.side) return;
  if (!look.rightOnly) paintBox(pen, { x: middle - half - scale, width: scale, ...tall }, look.side);
  paintBox(pen, { x: middle + half, width: scale, ...tall }, look.side);
}

/** A vital's frame's RGBA pixels, as the interface lays a tile. */
export const barFramePixels = (height: number, tone: BarTone): Uint8Array => cellsPixels(barFrameCells(height, tone));

/** Cells, each its colour or null where clear, as RGBA texels. */
function cellsPixels(cells: readonly (string | null)[]): Uint8Array {
  const pixels = new Uint8Array(cells.length * 4);
  cells.forEach((colour, index) => {
    if (!colour) return;
    const [red, green, blue, alpha] = colourOf(colour);
    pixels.set([red * 255, green * 255, blue * 255, alpha * 255].map(Math.round), index * 4);
  });
  return pixels;
}

/** A vital's pointed frame round `box` (its outer box, frame and all), `height` CSS pixels tall, in `tone` (keyed by
 *  `name`): each point at 1:1, the one column between them stretched along the bar. */
export function barFrame(pen: Pen, height: number, tone: BarTone, name: string): void {
  const tip = tipOf(height);
  const width = tip * 2 + 1;
  const tile = pen.ui.tileTexels(`bar frame ${name} ${height}`, width, height, () => barFramePixels(height, tone));
  if (!tile) return;
  const { box, scale } = pen;
  const colour: [number, number, number, number] = [1, 1, 1, pen.fade ?? 1];
  const add = (x: number, across: number, texelX: number, texels: number) =>
    pen.ui.quads.add(snap({ x, y: box.y, width: across, height: height * scale }), colour, pen.clip, {
      ...tile,
      x: tile.x + texelX,
      width: texels,
    });
  add(box.x, tip * scale, 0, tip);
  add(box.x + tip * scale, box.width - 2 * tip * scale, tip, 1);
  add(box.x + box.width - tip * scale, tip * scale, tip + 1, tip);
}

/** A picture `width` by `height` cells, made once by `cells` and kept as `key`, drawn at `pen`'s box's top left, each
 *  cell a CSS pixel. */
export function drawCells(
  pen: Pen,
  key: string,
  width: number,
  height: number,
  cells: () => readonly (string | null)[],
): void {
  const tile = pen.ui.tileTexels(key, width, height, () => cellsPixels(cells()));
  if (!tile) return;
  const box = snap({ x: pen.box.x, y: pen.box.y, width: width * pen.scale, height: height * pen.scale });
  pen.ui.quads.add(box, [1, 1, 1, pen.fade ?? 1], pen.clip, tile);
}

/** How far inside a vital's box its trough stands: the frame's top and foot, and each point. */
export const frameInset = (height: number): readonly [number, number] => [BAR_EDGE, tipOf(height)];

/** Draws `meter`'s lost strip, its fill in `fill` and its falling pieces into the trough `pen` holds. */
export function drawMeter(pen: Pen, meter: Meter, fill: string, lost: LostLook): void {
  const { share, at } = meter.shown;
  if (at > share) {
    const strip = span(pen, 0, at);
    if (lost === 'faint') bands(pen, strip, { body: faded(fill, 0.35) });
    else {
      const cream = '#fff6e4';
      bands(pen, strip, { top: faded(cream, 0.6), topDeep: 1, body: faded(mix(fill, cream, 0.55), 0.6) });
    }
  }
  kitFill(pen, span(pen, 0, share), fill);
  for (const each of meter.pieces) {
    const halves = [pieceAt(each.age, 'left'), pieceAt(each.age, 'right')];
    if (halves.some(Boolean)) piece(pen, each.left, each.width, halves, fill);
  }
}

/** A long thin bar as the kit lays the vitals on foot and a ship's at sea: `length` by `height` CSS pixels at `zoom`,
 *  its trough on `ground` (the track's own unless said) inside the fine stone frame with its pointed ends, its fill
 *  drawn by `fill` and its frame flashed to `alert` (keyed by `name`) while one is given. */
export function thinBarNode(bar: {
  readonly name: string;
  readonly label: string;
  readonly length: number;
  readonly height: number;
  readonly zoom: number;
  readonly fill: (pen: Pen) => void;
  readonly alert?: BarTone | null;
  readonly ground?: string;
  readonly children?: readonly Node[];
}): Node {
  const { height, zoom } = bar;
  return {
    width: bar.length * zoom,
    height: height * zoom,
    label: bar.label,
    draw: (ui, box, scale, clip, fade) => {
      const pen = { ui, box, scale: scale * zoom, clip, fade };
      const [edge, tip] = frameInset(height);
      const trough = {
        x: box.x + tip * pen.scale,
        y: box.y + edge * pen.scale,
        width: box.width - 2 * tip * pen.scale,
        height: box.height - 2 * edge * pen.scale,
      };
      const inside = { ...pen, box: trough };
      paintBox(inside, trough, bar.ground ?? TONES.groundTrack);
      bar.fill(inside);
      barFrame(pen, height, BAR_TONES.stone, 'stone');
      if (bar.alert) barFrame(pen, height, bar.alert, bar.name);
    },
    children: bar.children ?? [],
  };
}

/** A key on a keycap, as the display's keys are drawn: stone lit at its top and left and dark at its right and foot
 *  (two pixels deep there), on a dark ground inside the outline, at least `least` CSS pixels wide and `tall` high;
 *  `face` stands on the cap in place of the key's words where one is given (a mouse's button drawn). */
export function keycapNode(
  key: string,
  size: number,
  least: number,
  tall: number,
  zoom = 1,
  face: Node | null = null,
): Node {
  return {
    minWidth: least * zoom,
    height: tall * zoom,
    padding: [zoom, 5 * zoom, 2 * zoom, 5 * zoom],
    alignX: 'center',
    alignY: 'center',
    fill: '#16181d',
    draw: (ui, box, scale, clip, fade) => {
      const pen = { ui, box, scale: scale * zoom, clip, fade };
      const step = pen.scale;
      ring(pen, box, TONES.outline);
      paintBox(pen, { ...box, height: step }, TONES.stoneLit);
      paintBox(pen, { ...box, y: box.y + step, width: step, height: box.height - step }, TONES.stoneLit);
      paintBox(
        pen,
        { ...box, x: box.x + box.width - step, y: box.y + step, width: step, height: box.height - step },
        TONES.stoneDark,
      );
      paintBox(
        pen,
        { ...box, x: box.x + step, y: box.y + box.height - 2 * step, width: box.width - step, height: 2 * step },
        TONES.stoneDark,
      );
    },
    children: [face ?? { text: { words: key, size: size * zoom, colour: TONES.word, wrap: false } }],
  };
}

/** How far words at `size` rise from the foot of a row whose largest words are at `largest`, so the two stand on one
 *  baseline, as a sheet's `align-items: baseline` stands them. */
export const baselineRise = (size: number, largest: number): number =>
  lineHeight(largest) - baselineOf(largest) - (lineHeight(size) - baselineOf(size));
