// Draws a laid tree (`layout.ts`) with the interface's renderer: each node's fill, role, outline, picture, words and
// field, at the interface's whole scale, faded with its parents and clipped as it was laid. Words take the colour of
// the role they sit on, as a sheet's `color` passes down; a held press moves its words with it.
import { TONES } from '../plus/tones.ts';
import type { FieldState } from './field.ts';
import { meet } from './layout.ts';
import type { Laid, Padding, Span } from './node.ts';
import { paint, type State } from './paint.ts';
import { type Box, type Colour, colourOf } from './quads.ts';
import { layLine, lineHeight } from './text.ts';
import type { UiRenderer } from './uiRenderer.ts';

/** What drawing needs of the interface's state. */
export interface DrawState {
  readonly clock: number;
  readonly field: (id: string) => FieldState | null;
  readonly focused: (id: string) => boolean;
  readonly state: (laid: Laid) => State;
  /** How far each field's words are scrolled to keep its caret in sight; kept between frames. */
  readonly fieldScroll: Map<string, number>;
}

const SELECTION = 'rgba(243,207,106,0.35)';

const sidesOf = (padding: Padding | undefined): readonly [number, number, number, number] => {
  if (padding === undefined) return [0, 0, 0, 0];
  if (typeof padding === 'number') return [padding, padding, padding, padding];
  if (padding.length === 2) return [padding[0], padding[1], padding[0], padding[1]];
  return padding;
};

const faded = (css: string, fade: number): Colour => {
  const [red, green, blue, alpha] = colourOf(css);
  return [red, green, blue, alpha * fade];
};

const scaled = (box: Box, scale: number): Box => ({
  x: box.x * scale,
  y: box.y * scale,
  width: box.width * scale,
  height: box.height * scale,
});

/** Draws one line of spans with its top-left at `x`, `y` (CSS pixels), each glyph in its span's colour or `colour`. */
function drawLine(
  ui: UiRenderer,
  spans: readonly Span[],
  where: {
    readonly x: number;
    readonly y: number;
    readonly size: number;
    readonly scale: number;
    readonly tracking?: number;
  },
  ink: {
    readonly colour: string;
    readonly edge?: 'shadow' | 'halo';
    readonly edgeColour?: string;
    readonly edgeWidth?: number;
    readonly fade: number;
  },
  clip: Box,
): void {
  const words = spans.map((span) => span.words).join('');
  const colours: string[] = [];
  for (const span of spans) colours.push(...Array.from(span.words, () => span.colour || ink.colour));
  const { glyphs } = layLine(ui.face, words, where.size, where.tracking);
  const { x, y, size, scale } = where;
  // A glyph in a clear colour keeps its room and draws nothing, its edge neither: words still to be typed.
  const unseen = colours.map((css) => colourOf(css)[3] <= 0);
  const drawn = (offsetX: number, offsetY: number, colourOf: (index: number) => Colour) => {
    for (const laid of glyphs) {
      if (unseen[laid.index]) continue;
      const texels = ui.glyphTexels(laid.glyph);
      if (!texels) continue;
      const box = {
        x: (x + laid.x + offsetX) * scale,
        y: (y + laid.y + offsetY) * scale,
        width: laid.glyph.width * size * scale,
        height: laid.glyph.height * size * scale,
      };
      ui.quads.add(box, colourOf(laid.index), clip, texels);
    }
  };
  const edge = faded(ink.edgeColour ?? TONES.outline, ink.fade);
  const step = ink.edgeWidth ?? 1;
  if (ink.edge === 'shadow') drawn(step, step, () => edge);
  if (ink.edge === 'halo')
    for (const [across, down] of [
      [-1, -1],
      [0, -1],
      [1, -1],
      [-1, 0],
      [1, 0],
      [-1, 1],
      [0, 1],
      [1, 1],
    ] as const)
      drawn(across * step, down * step, () => edge);
  const tones = new Map<string, Colour>();
  drawn(0, 0, (index) => {
    const css = colours[index] ?? ink.colour;
    let tone = tones.get(css);
    if (!tone) tones.set(css, (tone = faded(css, ink.fade)));
    return tone;
  });
}

/** Draws `laid`, in order, with `ui` at `scale` device pixels a CSS pixel. */
export function drawLaid(ui: UiRenderer, laid: readonly Laid[], scale: number, state: DrawState): void {
  const ink = new Map<Laid, string>();
  const shift = new Map<Laid, number>();
  const inkOf = (each: Laid | null): string => (each ? (ink.get(each) ?? inkOf(each.parent)) : TONES.ink);
  const shiftOf = (each: Laid | null): number => (each ? (shift.get(each) ?? 0) + shiftOf(each.parent) : 0);
  for (const each of laid) {
    const { node, fade } = each;
    if (fade <= 0) continue;
    const moved = shiftOf(each.parent);
    const box = { ...each.box, x: each.box.x + moved, y: each.box.y + moved };
    const device = scaled(box, scale);
    const clip = scaled(each.clip, scale);
    if (node.fill) ui.quads.add(device, faded(node.fill, fade), clip);
    if (node.role) {
      const look = paint(
        ui.quads,
        ui.tileTexels.bind(ui),
        node.role,
        { box: device, scale, border: node.bevel ?? 2, state: node.state ?? state.state(each), fade },
        clip,
      ).look;
      ink.set(each, look.word);
      if (look.shift) shift.set(each, look.shift);
    }
    if (node.outline) {
      const line = node.outline.width * scale;
      const tone = faded(node.outline.colour, fade);
      const { x, y, width, height } = device;
      for (const edge of [
        { x, y, width, height: line },
        { x, y: y + height - line, width, height: line },
        { x, y: y + line, width: line, height: height - 2 * line },
        { x: x + width - line, y: y + line, width: line, height: height - 2 * line },
      ])
        ui.quads.add(edge, tone, clip);
    }
    const [top, right, bottom, left] = sidesOf(node.padding);
    const inner = {
      x: box.x + left,
      y: box.y + top,
      width: box.width - left - right,
      height: box.height - top - bottom,
    };
    if (node.picture) ui.picture(node.picture, scaled(inner, scale), clip, fade);
    if (node.text) {
      const size = node.text.size ?? 1;
      const tall = node.text.leading ?? lineHeight(size);
      // The words stand in the middle of a line set taller (or shorter) than the face's own.
      const lift = Math.floor((tall - lineHeight(size)) / 2);
      each.lines.forEach((line, index) => {
        const tracking = node.text?.tracking;
        const width = layLine(ui.face, line.map((span) => span.words).join(''), size, tracking).width;
        const free = inner.width - width;
        const align = node.text?.align ?? 'start';
        const x = inner.x + (align === 'center' ? Math.floor(free / 2) : align === 'end' ? free : 0);
        const colour = node.text?.colour ?? inkOf(each.parent);
        drawLine(
          ui,
          line,
          { x, y: inner.y + index * tall + lift, size, scale, tracking },
          { colour, edge: node.text?.edge, edgeColour: node.text?.edgeColour, edgeWidth: node.text?.edgeWidth, fade },
          clip,
        );
      });
    }
    if (node.field && node.id) drawField(ui, each, inner, scale, clip, state, inkOf(each));
    node.draw?.(ui, device, scale, clip, fade);
  }
}

/** A field's words, or its placeholder dim while empty; its selection, and its caret blinking while it has focus. */
function drawField(
  ui: UiRenderer,
  each: Laid,
  inner: Box,
  scale: number,
  clip: Box,
  state: DrawState,
  ink: string,
): void {
  const id = each.node.id ?? '';
  const field = each.node.field;
  const words = state.field(id) ?? { text: '', caret: 0, anchor: 0 };
  const size = field?.size ?? 1;
  const shown = field?.secret ? '*'.repeat([...words.text].length) : words.text;
  const prefix = (upTo: number) =>
    field?.secret ? '*'.repeat([...words.text.slice(0, upTo)].length) : words.text.slice(0, upTo);
  const caretX = ui.measure(prefix(words.caret), size);
  const focused = state.focused(id);
  // The words scroll left just enough to keep the caret in sight.
  let scrolled = state.fieldScroll.get(id) ?? 0;
  scrolled = Math.max(0, Math.min(scrolled, caretX), caretX - inner.width + 1);
  state.fieldScroll.set(id, scrolled);
  const within = meet(clip, scaled(inner, scale));
  const tall = lineHeight(size);
  const top = inner.y + Math.floor((inner.height - tall) / 2);
  const left = inner.x - scrolled;
  if (focused && words.caret !== words.anchor) {
    const [from, to] = [Math.min(words.caret, words.anchor), Math.max(words.caret, words.anchor)];
    const start = ui.measure(prefix(from), size);
    const end = ui.measure(prefix(to), size);
    ui.quads.add(
      scaled({ x: left + start, y: top, width: end - start, height: tall }, scale),
      colourOf(SELECTION),
      within,
    );
  }
  if (shown)
    drawLine(ui, [{ words: shown }], { x: left, y: top, size, scale }, { colour: ink, fade: each.fade }, within);
  else if (field?.placeholder)
    drawLine(
      ui,
      [{ words: field.placeholder }],
      { x: inner.x, y: top, size, scale },
      { colour: TONES.wordDim, fade: each.fade },
      within,
    );
  if (focused && Math.floor(state.clock * 2) % 2 === 0)
    ui.quads.add(scaled({ x: left + caretX, y: top, width: 1, height: tall }, scale), faded(ink, each.fade), within);
}
