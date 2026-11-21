// The menu's shared parts as the game draws them (`ui/`): its palette, a surface's bevel in any four colours, words at
// the face's steps, keycaps and a line of what the keys do, a picture fitted as Enhanced Plus fits its icons, the
// pixel glyphs, and a tile: Enhanced Plus's dark well, its bevel in its rarity's tones and its glow sunk inside, with
// what it shows of the item beyond its picture (its element in the corner, its growth's gauge, its gilded frame).

import type { GearItem } from '../network/gearMessages.ts';
import { ELEMENTS, RARITIES, fullyUpgraded, upgraded } from '../player/gear.ts';
import { diagonalFit, drawnBounds, fitIcon } from '../player/iconFit.ts';
import type { Picture as Pixels } from '../player/picture.ts';
import type { Child, Drawing, Node, Text } from '../ui/node.ts';
import { colourOf } from '../ui/quads.ts';
import { elementSvg } from './elementGlyphs.ts';
import { BAND_CELLS, type Emblem, SIGN_CELLS, type Shape, emblemPixels, plateEnd } from './emblemArt.ts';
import type { Glyph } from './gearCards.ts';
import { glyphSvg, nodeGlyphSvg, ringSvg } from './gearGlyphs.ts';

/** What a press or a key does, as a line of keycaps shows it: the key, then its words. */
export type Hint = readonly [key: string, words: string];

/** The menu's own tones, over the kit's. */
export const INK = {
  word: '#efe8d6',
  faint: '#a89f88',
  brass: '#c08a3e',
  brassLit: '#f3cf86',
  ground: '#0e1013',
  well: '#101216',
  wellLit: '#171a20',
  stoneHi: '#6d6252',
  stoneLo: '#231e18',
  outline: '#050608',
  gain: '#74d9a0',
  loss: '#e8968a',
  answer: '#f0b545',
  key: '#16181d',
} as const;

/** How the menu stands on this screen: the step its names take (two where it is wide), the step its labels take
 *  (two where it is wide and tall), whether it is short, its card's width, and the screen's device pixels a CSS
 *  pixel, which pictures are fitted to. */
export interface Sizes {
  readonly name: number;
  readonly label: number;
  readonly short: boolean;
  readonly card: number;
  readonly ratio: number;
}

/** The menu's sizes on a view `width` by `height` CSS pixels, as its sheet's media queries chose them. */
export function sizesOf(width: number, height: number, ratio: number): Sizes {
  const wide = (width >= 1500 && width < 2400) || (width >= 2400 && height < 1300);
  const tall = wide && height >= 900;
  return {
    name: wide ? 2 : 1,
    label: tall ? 2 : 1,
    short: height <= 800 || (width >= 2400 && height >= 1300),
    card: tall ? 440 : 300,
    ratio,
  };
}

/** `rgb` ("r,g,b") at `alpha`, as CSS writes it. */
export const rgba = (rgb: string, alpha: number): string => `rgba(${rgb},${alpha})`;

/** `rgb` at `alpha` laid over the opaque `base`, as one colour. */
export function over(rgb: string, alpha: number, base: string): string {
  const [red = 0, green = 0, blue = 0] = rgb.split(',').map(Number);
  const [baseRed, baseGreen, baseBlue] = colourOf(base);
  const mixed = [red, green, blue].map((channel, place) => {
    const under = ([baseRed, baseGreen, baseBlue][place] ?? 0) * 255;
    return Math.round(channel * alpha + under * (1 - alpha));
  });
  return `rgb(${mixed.join(',')})`;
}

/** A bevel's four edges (top, right, bottom, left), each `depth` deep, as `border-color` and `border-width` take
 *  them; with `ring`, a 1 px line of it outside, as the sheet's outline shadow; faded to `alpha`. */
export function edges(
  colours: readonly [string, string, string, string],
  depth: number | readonly [number, number, number, number] = 2,
  ring: string | null = null,
  alpha = 1,
): Drawing {
  const [top, right, bottom, left] = typeof depth === 'number' ? [depth, depth, depth, depth] : depth;
  return (ui, box, scale, clip, shown) => {
    const tone = (css: string) => {
      const [red, green, blue, opacity] = colourOf(css);
      return [red, green, blue, opacity * alpha * shown] as const;
    };
    const { x, y, width, height } = box;
    if (ring) {
      const line = scale;
      for (const part of [
        { x: x - line, y: y - line, width: width + 2 * line, height: line },
        { x: x - line, y: y + height, width: width + 2 * line, height: line },
        { x: x - line, y, width: line, height },
        { x: x + width, y, width: line, height },
      ])
        ui.quads.add(part, tone(ring), clip);
    }
    const [deepTop, deepRight, deepBottom, deepLeft] = [top * scale, right * scale, bottom * scale, left * scale];
    ui.quads.add({ x, y, width, height: deepTop }, tone(colours[0]), clip);
    ui.quads.add({ x, y: y + deepTop, width: deepLeft, height: height - deepTop }, tone(colours[3]), clip);
    ui.quads.add(
      { x: x + deepLeft, y: y + height - deepBottom, width: width - deepLeft, height: deepBottom },
      tone(colours[2]),
      clip,
    );
    ui.quads.add(
      { x: x + width - deepRight, y: y + deepTop, width: deepRight, height: height - deepTop - deepBottom },
      tone(colours[1]),
      clip,
    );
  };
}

/** The four edges of a frame in a rarity, lit top and left; the kit's plain stone without one. */
export function rarityEdges(rarity: number | null): [string, string, string, string] {
  const found = rarity === null ? undefined : RARITIES[rarity];
  const [lit, shade] = found ? [found.lit, found.shade] : [INK.stoneHi, INK.stoneLo];
  return [lit, shade, shade, lit];
}

/** A rarity's channels ("r,g,b") for its glow; the stone's without one. */
export const rarityRgb = (rarity: number | null): string =>
  (rarity === null ? undefined : RARITIES[rarity])?.rgb ?? '120,110,90';

/** Words at `size` steps of the face, in `colour`, on one line unless `wrap`. */
export function words(said: string, size = 1, colour?: string, more: Partial<Text> = {}): Node {
  return { text: { words: said, size, wrap: false, ...(colour && { colour }), ...more } };
}

/** A label as the sheet writes it: in capitals, faint. */
export const label = (said: string, size = 1, colour: string = INK.faint): Node =>
  words(said.toUpperCase(), size, colour);

/** A picture from SVG markup, `size` pixels a side. */
export function svgNode(key: string, svg: string, size: number, height = size): Node {
  return { width: size, height, picture: { key, source: { svg } } };
}

/** A glyph of the menu's, `size` pixels a side. */
export function glyphNode(glyph: Exclude<Glyph, 'item'>, size = 36, rarity = 0, tint = 0): Node {
  return svgNode(`glyph ${glyph} ${rarity} ${tint}`, glyphSvg(glyph, rarity, tint), size);
}

/** An element's glyph; nothing for none. */
export function elementNode(element: number, size: number): Node | null {
  return ELEMENTS[element] ? svgNode(`element ${element}`, elementSvg(element), size) : null;
}

/** A node's kind's glyph in `colour`. */
export const nodeGlyphNode = (kind: number, colour: string, size = 24): Node =>
  svgNode(`node ${kind} ${colour}`, nodeGlyphSvg(kind).replace('currentColor', colour), size);

/** A locked node's ring, grown `share` of the way to it, lit in `colour` over `dark`. */
export function ringNode(share: number, colour: string, dark: string, size: number): Node {
  const steps = Math.round(share * 100);
  return svgNode(`ring ${steps} ${colour}`, ringSvg(steps / 100, dark).replaceAll('currentColor', colour), size);
}

/** A key on a keycap: square and bevelled, as the kit's stone is. */
export function keycap(key: string, size = 1): Node {
  const line = size === 1 ? 16 : 28;
  return {
    fill: INK.key,
    draw: edges([INK.stoneHi, INK.stoneLo, INK.stoneLo, INK.stoneHi], [1, 1, 2, 1]),
    padding: [1, 5, 2, 5],
    minWidth: 18,
    height: line + 3,
    alignX: 'center',
    alignY: 'center',
    children: [words(key, size, INK.word)],
  };
}

/** A line of what the presses and keys do, each key on a keycap, keys that do the same joined by a slash. */
export function hintsNode(hints: readonly Hint[], size = 1, gap = 14): Node {
  return {
    gap,
    wrap: true,
    alignY: 'center',
    children: hints.map(([key, said]) => ({
      gap: 6,
      alignY: 'center',
      children: [...key.split(' / ').map((one) => keycap(one, size)), words(said, size, INK.faint)],
    })),
  };
}

/** Each picture's name for the atlas, by the picture it is. */
const named = new WeakMap<Pixels, string>();
let pictures = 0;
const nameOf = (picture: Pixels) => {
  let name = named.get(picture);
  if (!name) named.set(picture, (name = `pixels ${pictures++}`));
  return name;
};

/** Where each picture's drawn pixels lie, found once. */
const bounds = new WeakMap<Pixels, readonly [number, number, number, number]>();
function boundsOf(picture: Pixels): readonly [number, number, number, number] {
  let found = bounds.get(picture);
  if (!found) bounds.set(picture, (found = drawnBounds(picture.width, picture.height, picture.pixels) ?? [0, 0, 0, 0]));
  return found;
}

/** A picture's drawn part, trimmed of its clear margin, as a canvas of its own pixels. */
function trimmed(picture: Pixels): { canvas: OffscreenCanvas; width: number; height: number } | null {
  const [west, north, width, height] = boundsOf(picture);
  if (width === 0) return null;
  const canvas = new OffscreenCanvas(width, height);
  const image = new ImageData(new Uint8ClampedArray(picture.pixels), picture.width);
  canvas.getContext('2d')?.putImageData(image, -west, -north, west, north, width, height);
  return { canvas, width, height };
}

/** `own` grown by `whole` pixels each, kept square. */
function grownBy(own: OffscreenCanvas, whole: number): OffscreenCanvas {
  const grown = new OffscreenCanvas(own.width * whole, own.height * whole);
  const context = grown.getContext('2d');
  if (context) {
    context.imageSmoothingEnabled = false;
    context.drawImage(own, 0, 0, grown.width, grown.height);
  }
  return grown;
}

/** A picture in a box `box` CSS pixels a side, its clear margin trimmed and fitted as Enhanced Plus fits its icons
 *  (`fitIcon`), never past `cap` to a pixel of its own; an icon long and thin is laid on the box's diagonal, as a
 *  weapon is, unless capped. Drawn at the screen's own pixels: grown by whole pixels, then smoothed down once only
 *  where it must be. */
export function pictureNode(picture: Pixels, box: number, ratio: number, cap?: number): Node {
  const [, , width, height] = boundsOf(picture);
  const key = `${nameOf(picture)} ${box} ${ratio} ${cap ?? 'icon'}`;
  const laid = cap === undefined ? diagonalFit(width, height, box, ratio) : null;
  if (laid)
    return {
      width: box,
      height: box,
      picture: {
        key,
        source: {
          draw: (context, across, down) => {
            const own = trimmed(picture);
            if (!own) return;
            const grown = grownBy(own.canvas, laid.grown);
            const [long, short] = [own.width * laid.scale, own.height * laid.scale];
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = 'high';
            context.translate(across / 2, down / 2);
            context.rotate(laid.turn);
            context.drawImage(grown, -long / 2, -short / 2, long, short);
          },
        },
      },
    };
  const fit = fitIcon(width, height, box, ratio, cap);
  if (!fit) return { width: box, height: box };
  return {
    width: Math.ceil(fit.shownWidth),
    height: Math.ceil(fit.shownHeight),
    picture: {
      key,
      source: {
        draw: (context, across, down) => {
          const own = trimmed(picture);
          if (!own) return;
          const grown = grownBy(own.canvas, fit.grown);
          context.imageSmoothingEnabled = fit.smooth;
          context.imageSmoothingQuality = 'high';
          // Set on whole device pixels, so a pixel grown whole stays square.
          const [left, top] = [Math.floor((across - fit.width) / 2), Math.floor((down - fit.height) / 2)];
          context.drawImage(grown, left, top, fit.width, fit.height);
        },
      },
    },
  };
}

/** An item drawn small: its own picture, or, while it is drawn or where the forge draws nothing of it, its name's
 *  initials in its rarity's lit tone, as Enhanced Plus shows a piece without art. */
export function itemIconNode(picture: Pixels | null, name: string, box: number, sizes: Sizes, rarity: number): Node {
  if (picture) return pictureNode(picture, box, sizes.ratio);
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase();
  return words(initials, 2, RARITIES[rarity]?.lit ?? INK.word);
}

/** A tile's glow: its rarity's light sunk inside it from below, brighter under the pointer. */
function glow(rgb: string, lit: boolean): Node['picture'] {
  return {
    key: `glow ${rgb} ${lit}`,
    source: {
      draw: (context, width, height) => {
        const light = context.createRadialGradient(width / 2, height * 1.15, 0, width / 2, height * 1.15, height * 0.9);
        light.addColorStop(0, rgba(rgb, lit ? 0.4 : 0.3));
        light.addColorStop(1, rgba(rgb, 0));
        context.fillStyle = light;
        context.fillRect(0, 0, width, height);
        const inner = context.createRadialGradient(
          width / 2,
          height / 2,
          width * 0.3,
          width / 2,
          height / 2,
          width * 0.75,
        );
        inner.addColorStop(0, rgba(rgb, 0));
        inner.addColorStop(1, rgba(rgb, lit ? 0.32 : 0.2));
        context.fillStyle = inner;
        context.fillRect(0, 0, width, height);
      },
    },
  };
}

/** A gilded frame's corner, where its gold catches the light, stepped as the kit's bevels are. */
const GILDED_CORNER: Node = {
  width: 'grow',
  height: 'grow',
  float: { to: 'parent', clipped: true },
  picture: {
    key: 'gilded corner',
    source: {
      draw: (context, width) => {
        const step = width / 64;
        for (const [reach, colour] of [
          [12, 'rgba(255,232,160,0.25)'],
          [6, 'rgba(255,244,200,0.55)'],
        ] as const) {
          context.fillStyle = colour;
          context.beginPath();
          context.moveTo(0, 0);
          context.lineTo(reach * step * 1.42, 0);
          context.lineTo(0, reach * step * 1.42);
          context.fill();
        }
      },
    },
  },
};

/** How a tile stands: at rest, lit under the pointer or the keys' focus, open (its flyout shown), or vacant. */
export type TileState = 'rest' | 'lit' | 'open';

/** A tile's colours where a rarity's are not used: its lit and shaded edges, its colour lit, and its glow's channels. */
export interface TileTone {
  readonly lit: string;
  readonly shade: string;
  readonly colour: string;
  readonly rgb: string;
}

/** A tile of `size` pixels a side: the well, the bevel in its rarity (or gilded, or brass while open), its glow, and
 *  `content` in its middle; `marks` stand over it (an item's element, gauge or count). */
export function tileNode(
  size: number,
  rarity: number | null,
  state: TileState,
  content: readonly Child[],
  more: Partial<Node> & {
    readonly gilded?: boolean;
    readonly marks?: readonly Child[];
    readonly faded?: number;
    /** Toned in these colours in place of the rarity's, as the Arts tone a tile in their element. */
    readonly toned?: TileTone;
  } = {},
): Node {
  const { gilded = false, marks = [], faded = 1, toned, ...node } = more;
  const found = toned ?? (rarity === null ? undefined : RARITIES[rarity]);
  const rgb = toned?.rgb ?? rarityRgb(rarity);
  const lit = state === 'lit';
  const bevel: [string, string, string, string] =
    state === 'open'
      ? [INK.brassLit, INK.brass, INK.brass, INK.brassLit]
      : gilded
        ? ['#fbe3a0', '#a8741f', '#a8741f', '#fbe3a0']
        : lit
          ? [
              found?.colour ?? INK.brassLit,
              found?.colour ?? INK.brassLit,
              found?.colour ?? INK.brassLit,
              found?.colour ?? INK.brassLit,
            ]
          : toned
            ? [toned.lit, toned.shade, toned.shade, toned.lit]
            : rarityEdges(rarity);
  return {
    width: size,
    height: size,
    padding: 2,
    alignX: 'center',
    alignY: 'center',
    fill: lit ? INK.wellLit : INK.well,
    picture: glow(rgb, lit || state === 'open'),
    draw: edges(bevel, 2, INK.outline, faded),
    ...(faded < 1 && { opacity: faded }),
    ...node,
    children: [
      {
        width: 'grow',
        height: 'grow',
        float: { to: 'parent', clipped: true },
        outline: { width: 1, colour: rgba(rgb, lit ? 0.45 : 0.3) },
      },
      ...content,
      gilded && GILDED_CORNER,
      ...marks,
    ],
  };
}

/** What an item's icon shows of it beyond its picture: a weapon's element as a glyph in its corner; and, after
 *  Destiny 1, a gauge along its foot that fills as its nodes are bought, until, fully upgraded, its frame is gilded
 *  and the gauge goes. */
export function itemMarks(item: GearItem): { readonly marks: Child[]; readonly gilded: boolean } {
  const element = elementNode(item.element, 16);
  const share = upgraded(item);
  const gilded = fullyUpgraded(item);
  const marks: Child[] = [
    element && { ...element, float: { to: 'parent', clipped: true, anchor: [1, 0], at: [1, 0], x: -3, y: 3 } },
  ];
  if (share !== null && !gilded)
    marks.push({
      width: 'grow',
      height: 3,
      fill: 'rgba(5,6,8,0.85)',
      float: { to: 'parent', clipped: true, anchor: [0, 1], at: [0, 1] },
      children: [{ width: `${Math.round(share * 100)}%`, height: 'grow', fill: INK.gain }],
    });
  return { marks, gilded };
}

/** What a tile is called aloud: its name, then its rarity and what it is. */
export function tileLabel(name: string, rarity: number | null, what = ''): string {
  const tier = rarity === null ? '' : (RARITIES[rarity]?.name ?? '');
  const said = [tier, what].filter(Boolean).join(' ');
  return said ? `${name}, ${said}` : name;
}

/** An emblem in its shape at `cells` across, its cells kept whole, drawn `width` by `height` pixels. */
export function emblemNode(emblem: Emblem, shape: Shape, cells: number, width: number, height: number): Node {
  return {
    width,
    height,
    picture: {
      key: `emblem ${emblem.id} ${shape} ${cells}`,
      source: { pixels: () => new Uint8Array(emblemPixels(emblem, shape, cells).buffer) },
      pixel: { width: Math.max(SIGN_CELLS, Math.round(cells)), height: SIGN_CELLS },
    },
  };
}

/** An emblem's nameplate behind a row `height` pixels tall, run on as its band at whole cells and the colour it ends
 *  in filling on past it; `children` stand over it from `inset` pixels in, in a column. */
export function plateNode(
  emblem: Emblem,
  height: number,
  inset: number,
  children: readonly Child[],
  more: Partial<Node> = {},
): Node {
  return {
    width: 'grow',
    height,
    clip: true,
    fill: plateEnd(emblem),
    children: [
      emblemNode(emblem, 'band', BAND_CELLS, (BAND_CELLS * height) / SIGN_CELLS, height),
      {
        width: 'grow',
        height: 'grow',
        float: { to: 'parent', clipped: true },
        direction: 'column',
        alignY: 'center',
        gap: 4,
        padding: [0, 0, 0, inset],
        ...more,
        children,
      },
    ],
  };
}

/** The keys' focus round a press `width` by `height`: a white ring 2 px out, as the sheet marks what is selected. */
export function focusRing(width: number, height: number): Node {
  return {
    width: width + 8,
    height: height + 8,
    float: { to: 'parent', clipped: true, x: -4, y: -4 },
    outline: { width: 2, colour: '#f2efe6' },
  };
}

/** A press in the kit's `role` with its words, and with `key`, the key that does it too, on a keycap. */
export function pressNode(
  id: string,
  said: string,
  role: 'button' | 'primary' | 'warn' = 'button',
  key = '',
  size = 1,
  more: Partial<Node> = {},
): Node {
  return {
    id,
    press: true,
    role,
    label: said,
    padding: [9, 16],
    gap: 8,
    alignY: 'center',
    ...more,
    children: [words(said, size), key !== '' && keycap(key, size), ...(more.children ?? [])],
  };
}
