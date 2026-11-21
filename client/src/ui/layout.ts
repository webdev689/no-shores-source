// Lays out a tree of nodes (`node.ts`) in a view, after Clay's model: widths fitted to content from the leaves up,
// then shared out from the root down (what grows takes the room left, evened from the smallest; what overflows
// shrinks, the largest first, never under its widest word); words wrapped to their widths; then heights the same way;
// then every box placed. Every length comes out in whole CSS pixels, so every edge lands on whole screen pixels at the
// interface's whole scale.
import type { Box } from './quads.ts';
import type { Align, Child, Laid, Node, Padding, Size, Span } from './node.ts';
import { type Face, lineHeight, widthOf, wrapped } from './text.ts';

/** A node at work: its children in the flow and those floated, its size, the least it can shrink to, and its place. */
interface Item {
  readonly node: Node;
  readonly kids: Item[];
  readonly floats: Item[];
  readonly pad: readonly [number, number, number, number];
  w: number;
  h: number;
  least: number;
  x: number;
  y: number;
  lines: Span[][];
  content: number;
}

/** What a layout needs besides the tree: the face to measure words in, and each scrolled node's scroll by its id. */
export interface LayoutContext {
  readonly face: Face;
  readonly scrollOf?: (id: string) => number;
}

const sidesOf = (padding: Padding | undefined): readonly [number, number, number, number] => {
  if (padding === undefined) return [0, 0, 0, 0];
  if (typeof padding === 'number') return [padding, padding, padding, padding];
  if (padding.length === 2) return [padding[0], padding[1], padding[0], padding[1]];
  return padding;
};

const shownKids = (children: readonly Child[] | undefined): Node[] =>
  (children ?? []).filter((child): child is Node => Boolean(child));

function build(node: Node): Item {
  const kids: Item[] = [];
  const floats: Item[] = [];
  for (const child of shownKids(node.children)) (child.float ? floats : kids).push(build(child));
  return { node, kids, floats, pad: sidesOf(node.padding), w: 0, h: 0, least: 0, x: 0, y: 0, lines: [], content: 0 };
}

const percentOf = (size: Size | undefined): number | null =>
  typeof size === 'string' && size.endsWith('%') ? Number.parseFloat(size) / 100 : null;

const clamp = (value: number, low = 0, high = Number.POSITIVE_INFINITY) => Math.max(low, Math.min(high, value));

/** The text's words as one string, and the colour of each of its characters. */
function flat(words: string | readonly Span[], colour: string | undefined): { text: string; colours: string[] } {
  const spans: readonly Span[] = typeof words === 'string' ? [{ words, colour }] : words;
  const colours: string[] = [];
  let text = '';
  for (const span of spans) {
    text += span.words;
    colours.push(...Array.from(span.words, () => span.colour ?? colour ?? ''));
  }
  return { text, colours };
}

/** The text's lines at `width` units (unbroken when `width` is null), each a list of spans by colour. */
function linesOf(face: Face, item: Item, width: number | null): Span[][] {
  const text = item.node.text;
  if (!text) return [];
  const size = text.size ?? 1;
  const tracking = text.tracking ?? 1;
  const { text: all, colours } = flat(text.words, text.colour);
  const chars = [...all];
  const lines: Span[][] = [];
  let next = 0;
  for (const paragraph of all.split('\n')) {
    const broken =
      width === null || text.wrap === false || text.ellipsis
        ? [paragraph]
        : text.balance
          ? balanced(face, paragraph, size, width, tracking)
          : wrapped(face, paragraph, size, width, tracking);
    for (const line of broken) {
      const spans: Span[] = [];
      for (const char of line) {
        const colour = colours[next] ?? '';
        const last = spans.at(-1);
        if (last && last.colour === colour) spans[spans.length - 1] = { words: last.words + char, colour };
        else spans.push({ words: char, colour });
        next += 1;
      }
      lines.push(width !== null && text.ellipsis ? cut(face, spans, size, width, tracking) : spans);
      // The space a break took, or the paragraph's newline.
      if (chars[next] === ' ' || chars[next] === '\n') next += 1;
    }
  }
  return lines;
}

const lineWords = (line: readonly Span[]) => line.map((span) => span.words).join('');

/** `words` wrapped to `width` in as many lines as they need there, each line as even as can be: the narrowest width
 *  that keeps that many lines. */
function balanced(face: Face, words: string, size: number, width: number, tracking: number): string[] {
  const most = wrapped(face, words, size, width, tracking);
  if (most.length < 2) return most;
  let [low, high] = [0, width];
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (wrapped(face, words, size, middle, tracking).length > most.length) low = middle;
    else high = middle;
  }
  return wrapped(face, words, size, high, tracking);
}

const ELLIPSIS = '...';

/** `line` cut short with an ellipsis to fit `width` units, its colours kept; whole when it fits. */
function cut(face: Face, line: Span[], size: number, width: number, tracking: number): Span[] {
  if (widthOf(face, lineWords(line), size, tracking) <= width) return line;
  const chars = line.flatMap((span) => Array.from(span.words, (char) => ({ char, colour: span.colour })));
  while (chars.length > 0 && widthOf(face, chars.map((each) => each.char).join('') + ELLIPSIS, size, tracking) > width)
    chars.pop();
  const kept: Span[] = [];
  for (const { char, colour } of [
    ...chars,
    ...Array.from(ELLIPSIS, (char) => ({ char, colour: chars.at(-1)?.colour })),
  ]) {
    const last = kept.at(-1);
    if (last && last.colour === colour) kept[kept.length - 1] = { words: last.words + char, colour };
    else kept.push({ words: char, colour });
  }
  return kept;
}

/** Pass one, leaves up: each node's width as its content needs it, and the least it can shrink to. */
function fitWidths(face: Face, item: Item): void {
  for (const kid of [...item.kids, ...item.floats]) fitWidths(face, kid);
  const { node, pad } = item;
  const across = pad[1] + pad[3];
  let fit = 0;
  let least = 0;
  if (node.text) {
    const size = node.text.size ?? 1;
    const tracking = node.text.tracking ?? 1;
    const lines = linesOf(face, item, null);
    fit = Math.max(0, ...lines.map((line) => widthOf(face, lineWords(line), size, tracking)));
    least = node.text.ellipsis
      ? widthOf(face, ELLIPSIS, size, tracking)
      : node.text.wrap === false
        ? fit
        : Math.max(
            0,
            ...lines.flatMap((line) => lineWords(line).split(' ')).map((word) => widthOf(face, word, size, tracking)),
          );
  } else if (node.picture?.pixel && node.width === undefined) {
    fit = least = node.picture.pixel.width;
  } else {
    const row = node.direction !== 'column';
    const flowing = item.kids.filter((kid) => percentOf(kid.node.width) === null);
    const gaps = (node.gap ?? 0) * Math.max(0, item.kids.length - 1);
    if (row) {
      // A wrapping row would stand on one line, and can narrow to its widest child.
      fit = flowing.reduce((sum, kid) => sum + kid.w, 0) + gaps;
      least = node.wrap
        ? Math.max(0, ...flowing.map((kid) => kid.w))
        : flowing.reduce((sum, kid) => sum + kid.least, 0) + gaps;
    } else {
      fit = Math.max(0, ...flowing.map((kid) => kid.w));
      least = Math.max(0, ...flowing.map((kid) => kid.least));
    }
  }
  const sized = node.width;
  if (typeof sized === 'number') fit = least = sized;
  else {
    fit += across;
    least += across;
  }
  if (node.clip || node.scroll) least = across;
  item.w = clamp(fit, node.minWidth, node.maxWidth);
  item.least = clamp(Math.min(least, item.w), node.minWidth, node.maxWidth);
}

/** Even out `items`' sizes toward `target` (more or less in total), growing the smallest first or shrinking the
 *  largest first, each within its bounds; whole pixels, the remainder to the first. */
function evened(sizes: number[], lows: number[], highs: number[], change: number): number[] {
  const out = [...sizes];
  let left = change;
  const growing = change > 0;
  for (let round = 0; round < 64 && Math.abs(left) > 0.001; round++) {
    const open = out
      .map((_size, index) => index)
      .filter((index) => (growing ? out[index]! < highs[index]! : out[index]! > lows[index]!));
    if (open.length === 0) break;
    const edge = growing
      ? Math.min(...open.map((index) => out[index]!))
      : Math.max(...open.map((index) => out[index]!));
    const atEdge = open.filter((index) => out[index] === edge);
    const others = open.filter((index) => out[index] !== edge).map((index) => out[index]!);
    const next = others.length === 0 ? null : growing ? Math.min(...others) : Math.max(...others);
    let step = left / atEdge.length;
    if (next !== null) step = growing ? Math.min(step, next - edge) : Math.max(step, next - edge);
    for (const index of atEdge) {
      const bounded = growing
        ? Math.min(highs[index]! - out[index]!, step)
        : Math.max(lows[index]! - out[index]!, step);
      out[index] = out[index]! + bounded;
      left -= bounded;
    }
  }
  // Whole pixels: each floored, the pixels that frees given back one each from the first.
  const floored = out.map(Math.floor);
  let spare = Math.round(out.reduce((sum, size) => sum + size, 0) - floored.reduce((sum, size) => sum + size, 0));
  for (let index = 0; spare > 0 && index < floored.length; index++, spare--) floored[index]! += 1;
  return floored;
}

/** Shares one side out among `kids` along their parent's main axis: percents of `room`, then what is left to the
 *  growing, or taken from those that can shrink. */
function shareMain(kids: Item[], room: number, gap: number, side: 'w' | 'h', grows: boolean): void {
  const sizeOf = (kid: Item) => (side === 'w' ? kid.node.width : kid.node.height);
  for (const kid of kids) {
    const share = percentOf(sizeOf(kid));
    if (share !== null) kid[side] = Math.round(share * room);
  }
  const used = kids.reduce((sum, kid) => sum + kid[side], 0) + gap * Math.max(0, kids.length - 1);
  const free = room - used;
  const highOf = (kid: Item) => (side === 'w' ? kid.node.maxWidth : kid.node.maxHeight) ?? Number.POSITIVE_INFINITY;
  if (free > 0) {
    const growing = kids.filter((kid) => sizeOf(kid) === 'grow');
    if (growing.length === 0) return;
    const sizes = evened(
      growing.map((kid) => kid[side]),
      growing.map((kid) => kid[side]),
      growing.map(highOf),
      free,
    );
    growing.forEach((kid, index) => (kid[side] = sizes[index] ?? kid[side]));
  } else if (free < 0 && grows) {
    const shrinking = kids.filter((kid) => typeof sizeOf(kid) !== 'number' && percentOf(sizeOf(kid)) === null);
    if (shrinking.length === 0) return;
    const sizes = evened(
      shrinking.map((kid) => kid[side]),
      shrinking.map((kid) => kid.least),
      shrinking.map((kid) => kid[side]),
      free,
    );
    shrinking.forEach((kid, index) => (kid[side] = sizes[index] ?? kid[side]));
  }
}

/** A side across a parent: grown to fill `room`, a share of it, or fitted and kept within it. */
function crossSize(kid: Item, room: number, side: 'w' | 'h', shrinks: boolean): void {
  const size = side === 'w' ? kid.node.width : kid.node.height;
  const low = (side === 'w' ? kid.node.minWidth : kid.node.minHeight) ?? 0;
  const high = (side === 'w' ? kid.node.maxWidth : kid.node.maxHeight) ?? Number.POSITIVE_INFINITY;
  const share = percentOf(size);
  if (size === 'grow') kid[side] = clamp(room, low, high);
  else if (share !== null) kid[side] = clamp(Math.round(share * room), low, high);
  else if (shrinks && typeof size !== 'number') kid[side] = clamp(Math.min(kid[side], room), Math.max(low, kid.least));
}

const floatRoom = (item: Item, view: Box, side: 'w' | 'h') =>
  item.node.float?.to === 'screen' ? (side === 'w' ? view.width : view.height) : null;

/** Pass two, root down: each node's final width. */
function shareWidths(item: Item, view: Box): void {
  const { node, pad } = item;
  const room = Math.max(0, item.w - pad[1] - pad[3]);
  const row = node.direction !== 'column';
  if (row && !node.wrap) shareMain(item.kids, room, node.gap ?? 0, 'w', true);
  else for (const kid of item.kids) crossSize(kid, room, 'w', true);
  for (const kid of item.floats) crossSize(kid, floatRoom(kid, view, 'w') ?? item.w, 'w', true);
  for (const kid of [...item.kids, ...item.floats]) shareWidths(kid, view);
}

/** Pass three, leaves up: words wrapped to their widths, then each node's height as its content needs it. */
function fitHeights(face: Face, item: Item): void {
  for (const kid of [...item.kids, ...item.floats]) fitHeights(face, kid);
  const { node, pad } = item;
  const down = pad[0] + pad[2];
  let fit = 0;
  let least = 0;
  if (node.text) {
    item.lines = linesOf(face, item, Math.max(1, item.w - pad[1] - pad[3]));
    fit = least = item.lines.length * lineHeight(node.text.size ?? 1);
  } else if (node.picture?.pixel && node.height === undefined) {
    fit = least = node.picture.pixel.height;
  } else {
    const row = node.direction !== 'column';
    const gap = node.gap ?? 0;
    const flowing = item.kids.filter((kid) => percentOf(kid.node.height) === null);
    if (row && node.wrap) {
      const lines = wrappedRows(item);
      fit =
        lines.reduce((sum, line) => sum + Math.max(0, ...line.map((kid) => kid.h)), 0) +
        gap * Math.max(0, lines.length - 1);
      least = fit;
    } else if (row) {
      fit = Math.max(0, ...flowing.map((kid) => kid.h));
      least = Math.max(0, ...flowing.map((kid) => kid.least));
    } else {
      const gaps = gap * Math.max(0, item.kids.length - 1);
      fit = flowing.reduce((sum, kid) => sum + kid.h, 0) + gaps;
      least = flowing.reduce((sum, kid) => sum + kid.least, 0) + gaps;
    }
  }
  if (typeof node.height === 'number') fit = least = node.height;
  else {
    fit += down;
    least += down;
  }
  if (node.clip || node.scroll) least = down;
  item.h = clamp(fit, node.minHeight, node.maxHeight);
  item.least = clamp(Math.min(least, item.h), node.minHeight, node.maxHeight);
}

/** A wrapping row's children in lines, each line as many as fit across it. */
function wrappedRows(item: Item): Item[][] {
  const room = item.w - item.pad[1] - item.pad[3];
  const gap = item.node.gap ?? 0;
  const lines: Item[][] = [];
  let line: Item[] = [];
  let used = 0;
  for (const kid of item.kids) {
    if (line.length > 0 && used + gap + kid.w > room) {
      lines.push(line);
      line = [];
      used = 0;
    }
    used += (line.length > 0 ? gap : 0) + kid.w;
    line.push(kid);
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

/** Pass four, root down: each node's final height. A scrolled node's children keep their heights; it scrolls. */
function shareHeights(item: Item, view: Box): void {
  const { node, pad } = item;
  const room = Math.max(0, item.h - pad[0] - pad[2]);
  const column = node.direction === 'column';
  if (column) shareMain(item.kids, room, node.gap ?? 0, 'h', !node.scroll);
  else if (!node.wrap) for (const kid of item.kids) crossSize(kid, room, 'h', false);
  for (const kid of item.floats) crossSize(kid, floatRoom(kid, view, 'h') ?? item.h, 'h', false);
  for (const kid of [...item.kids, ...item.floats]) shareHeights(kid, view);
}

const startOf = (align: Align | undefined, free: number) =>
  free <= 0 || !align || align === 'start' ? 0 : align === 'center' ? Math.floor(free / 2) : free;

export const meet = (one: Box, two: Box): Box => {
  const x = Math.max(one.x, two.x);
  const y = Math.max(one.y, two.y);
  const right = Math.min(one.x + one.width, two.x + two.width);
  const bottom = Math.min(one.y + one.height, two.y + two.height);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
};

/** Pass five, root down: every box placed, and the laid list in drawing order. */
function place(
  item: Item,
  context: LayoutContext,
  view: Box,
  clip: Box,
  z: number,
  parent: Laid | null,
  out: { laid: Laid; order: number }[],
): void {
  const { node, pad } = item;
  item.x += node.offset?.[0] ?? 0;
  item.y += node.offset?.[1] ?? 0;
  const box = { x: item.x, y: item.y, width: item.w, height: item.h };
  const inner = {
    x: item.x + pad[3],
    y: item.y + pad[0],
    width: item.w - pad[1] - pad[3],
    height: item.h - pad[0] - pad[2],
  };
  const gap = node.gap ?? 0;
  const column = node.direction === 'column';
  const scrolled = node.scroll && node.id ? (context.scrollOf?.(node.id) ?? 0) : 0;
  let content = 0;
  if (node.wrap && !column) {
    let top = 0;
    const lines = wrappedRows(item);
    for (const line of lines) {
      const across = line.reduce((sum, kid) => sum + kid.w, 0) + gap * (line.length - 1);
      const tall = Math.max(0, ...line.map((kid) => kid.h));
      let left = startOf(node.alignX, inner.width - across);
      for (const kid of line) {
        kid.x = inner.x + left;
        kid.y = inner.y + top + startOf(node.alignY, tall - kid.h) - scrolled;
        left += kid.w + gap;
      }
      top += tall + gap;
    }
    content = Math.max(0, top - gap);
  } else {
    const main =
      item.kids.reduce((sum, kid) => sum + (column ? kid.h : kid.w), 0) + gap * Math.max(0, item.kids.length - 1);
    // What a node holds is as tall as its column, or as its row's tallest; it scrolls up and down either way.
    content = column ? main : Math.max(0, ...item.kids.map((kid) => kid.h));
    let along = startOf(column ? node.alignY : node.alignX, (column ? inner.height : inner.width) - main);
    for (const kid of item.kids) {
      if (column) {
        kid.x = inner.x + startOf(node.alignX, inner.width - kid.w);
        kid.y = inner.y + along - scrolled;
        along += kid.h + gap;
      } else {
        kid.x = inner.x + along;
        kid.y = inner.y + startOf(node.alignY, inner.height - kid.h) - scrolled;
        along += kid.w + gap;
      }
    }
  }
  item.content = content + pad[0] + pad[2];
  const fade = (parent?.fade ?? 1) * (node.opacity ?? 1);
  const laid: Laid = { node, box, clip, z, lines: item.lines, content: item.content, fade, parent };
  out.push({ laid, order: out.length });
  const within = node.clip || node.scroll ? meet(clip, box) : clip;
  for (const kid of item.kids) place(kid, context, view, within, z, laid, out);
  for (const kid of item.floats) {
    const float = kid.node.float ?? {};
    const target = float.to === 'screen' ? view : box;
    const [atX, atY] = float.at ?? [0, 0];
    const [anchorX, anchorY] = float.anchor ?? [0, 0];
    kid.x = Math.round(target.x + atX * target.width - anchorX * kid.w + (float.x ?? 0));
    kid.y = Math.round(target.y + atY * target.height - anchorY * kid.h + (float.y ?? 0));
    place(kid, context, view, float.clipped ? within : view, float.z ?? z + 1, laid, out);
  }
}

/** Lays `root` out in `view` (CSS pixels): the root takes the view's room if it grows, else its own. Answers every
 *  node in drawing order, the lowest `z` first and, at one `z`, parents before children. */
export function layout(root: Node, view: Box, context: LayoutContext): Laid[] {
  const item = build(root);
  fitWidths(context.face, item);
  crossSize(item, view.width, 'w', true);
  shareWidths(item, view);
  fitHeights(context.face, item);
  crossSize(item, view.height, 'h', false);
  shareHeights(item, view);
  item.x = view.x;
  item.y = view.y;
  const out: { laid: Laid; order: number }[] = [];
  place(item, context, view, view, 0, null, out);
  return out.sort((one, two) => one.laid.z - two.laid.z || one.order - two.order).map((each) => each.laid);
}
