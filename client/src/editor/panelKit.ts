// The World Editor's panel as the interface draws it, in the editor's own look, as it is a tool and not one of the
// game's screens. Presses are dark slate with a hairline edge and rounded corners, lit blue when chosen;
// headings small capitals in grey; the slider, the lists to choose from and the fields in the dark grey of a
// browser's own. Each builder reads what was done to it this frame through the interface and answers its node.
import { choice, slider } from '../ui/controls.ts';
import type { Child, Drawing, Node } from '../ui/node.ts';
import { type Box, colourOf } from '../ui/quads.ts';
import { wrapped } from '../ui/text.ts';
import type { Interface } from '../ui/ui.ts';
import { type UiRenderer, uiScale } from '../ui/uiRenderer.ts';

/** The panel's colours. */
export const INK = {
  words: '#e8e8e8',
  dim: '#9aa4b0',
  ground: '#14181d',
  edge: '#2a3038',
  press: '#222a33',
  pressEdge: '#36404c',
  chosen: '#3b5b7d',
  chosenEdge: '#6f9fd1',
  fits: '#8fd18f',
  outside: '#f0a35a',
  warning: '#ff6b5b',
  control: '#3b3b3b',
  controlEdge: '#858585',
  controlLit: '#99c8ff',
  white: '#ffffff',
} as const;

/** Where the interface keeps what the field being typed in would hand over were the focus taken now. */
export const TYPED = 'editor:typed';

/** The panel's width, its edge included, in the interface's pixels. */
export const PANEL_WIDTH = 300;

/** The interface's pixels a CSS pixel at the screen's `ratio`: the interface lays itself at a whole number of device
 *  pixels to its own, so at a fractional ratio its pixel is not a CSS pixel. */
export const inwardAt = (ratio: number): number => ratio / uiScale(ratio);

/** The panel's drawn width in CSS pixels at the screen's `ratio`: where the view right of it starts. */
export const panelCss = (ratio: number): number => PANEL_WIDTH / inwardAt(ratio);

/** A box of `colour` with its corners rounded `radius` device pixels, row by row of device pixels. */
function roundedFill(ui: UiRenderer, box: Box, radius: number, colour: string, fade: number, clip: Box): void {
  const [red, green, blue, alpha] = colourOf(colour);
  const tone = [red, green, blue, alpha * fade] as const;
  const round = Math.min(radius, box.width / 2, box.height / 2);
  const rows = Math.ceil(round);
  for (let row = 0; row < rows; row++) {
    const from = round - row - 0.5;
    const inset = Math.round(round - Math.sqrt(Math.max(0, round * round - from * from)));
    const width = box.width - 2 * inset;
    ui.quads.add({ x: box.x + inset, y: box.y + row, width, height: 1 }, tone, clip);
    ui.quads.add({ x: box.x + inset, y: box.y + box.height - 1 - row, width, height: 1 }, tone, clip);
  }
  ui.quads.add({ x: box.x, y: box.y + rows, width: box.width, height: box.height - 2 * rows }, tone, clip);
}

/** A colour as the interface reads it: `#rrggbbaa`, which it does not, as `rgba(...)`; any other as it is. */
export function readable(colour: string): string {
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(colour);
  if (!hex?.[1] || !hex[2]) return colour;
  const [red, green, blue] = [0, 2, 4].map((from) => Number.parseInt(hex[1]?.slice(from, from + 2) ?? '0', 16));
  return `rgba(${red}, ${green}, ${blue}, ${Number.parseInt(hex[2], 16) / 255})`;
}

/** A rounded box of `fill` inside an `edge` a CSS pixel wide, its corners `radius` CSS pixels round. */
export function rounded(fill: string | null, edge: string | null, radius: number): Drawing {
  return (ui, box, scale, clip, fade) => {
    if (edge) roundedFill(ui, box, radius * scale, edge, fade, clip);
    const inner = edge
      ? { x: box.x + scale, y: box.y + scale, width: box.width - 2 * scale, height: box.height - 2 * scale }
      : box;
    if (fill) roundedFill(ui, inner, Math.max(0, radius - 1) * scale, fill, fade, clip);
  };
}

/** The ring keyboard focus draws round a control. */
const focusRing = (ui: Interface, id: string): Partial<Node> =>
  ui.focused(id) && ui.keyFocused ? { outline: { width: 2, colour: INK.controlLit } } : {};

/** Words in the panel's face, in `colour`. */
export function words(text: string, colour: string = INK.words, more: Partial<Node> = {}): Node {
  return { text: { words: text, colour }, ...more };
}

/** A press with words, lit when `chosen`; `run` when it is pressed. */
export function press(
  ui: Interface,
  id: string,
  text: string,
  run: () => void,
  more: { readonly chosen?: boolean } & Partial<Node> = {},
): Node {
  const { chosen = false, ...rest } = more;
  if (ui.clicked(id)) run();
  return {
    id,
    press: true,
    label: text,
    // A browser's words end without the spacing after their last letter, which the face's measure keeps.
    padding: [6, 8, 6, 9],
    draw: rounded(chosen ? INK.chosen : INK.press, chosen ? INK.chosenEdge : INK.pressEdge, 4),
    children: [{ text: { words: text, colour: INK.words, wrap: false } }],
    ...focusRing(ui, id),
    ...rest,
  };
}

/** Presses and words that run on to the next line where they reach the panel's edge, 6 px apart. */
export const row = (children: readonly Child[], gap = 6): Node => ({ width: 'grow', wrap: true, gap, children });

/** Room `height` pixels tall, parting two blocks. */
export const space = (height: number): Node => ({ height });

/** A paragraph of words that wrap to the panel's width. */
export const paragraph = (text: string, colour: string = INK.dim): Node => ({
  width: 'grow',
  text: { words: text, colour },
});

/** A heading over a part of the panel: small capitals spaced wide, in grey. */
export const heading = (text: string): Node => ({
  width: 'grow',
  text: { words: text.toUpperCase(), colour: INK.dim, tracking: 3 },
});

/** A value set along a track by dragging its thumb or by the arrows with focus, as a browser's range draws it:
 *  answers its node and the value now. */
export function range(
  ui: Interface,
  id: string,
  value: number,
  limits: { readonly low: number; readonly high: number; readonly step: number },
): { node: Node; value: number } {
  // The slider's own box is the span its thumb's middle moves along, so a press lands the thumb under the pointer;
  // the track reaches past it by the thumb's half and a margin, 129 px in all.
  const thumb = 14;
  const reach = thumb / 2 + 2;
  const set = slider(ui, id, value, { ...limits, width: 129 - 2 * reach });
  const share = limits.high > limits.low ? (set.value - limits.low) / (limits.high - limits.low) : 0;
  const draw: Drawing = (renderer, box, scale, clip, fade) => {
    const track = {
      x: box.x - (thumb / 2) * scale,
      y: box.y + 4 * scale,
      width: box.width + thumb * scale,
      height: 8 * scale,
    };
    rounded(INK.control, INK.controlEdge, 4)(renderer, track, scale, clip, fade);
    const middle = Math.round(box.x + box.width * share);
    rounded(INK.controlLit, null, 4)(renderer, { ...track, width: middle - track.x }, scale, clip, fade);
    const disc = { x: middle - (thumb / 2) * scale, y: box.y + scale, width: thumb * scale, height: thumb * scale };
    rounded(INK.controlLit, null, thumb / 2)(renderer, disc, scale, clip, fade);
  };
  const node: Node = {
    ...set.node,
    role: undefined,
    padding: 0,
    height: 16,
    children: [],
    draw,
  };
  return { node: { padding: [0, reach], children: [node], ...focusRing(ui, id) }, value: set.value };
}

/** The chevron a browser's list draws at its end. */
const CHEVRON = {
  key: 'editor-chevron',
  source: {
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="6" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" fill="none" stroke="#ffffff" stroke-width="1.6"/></svg>',
  },
} as const;

/** Dresses `node`, a choice from the shared controls, in a browser's own look: its press dark grey, its list a dark
 *  panel with the chosen option lit. */
function dressed(node: Node, chosen: string, width: number): Node {
  const options = node.children?.[2];
  const list =
    options &&
    ({
      ...options,
      role: undefined,
      fill: INK.control,
      outline: { width: 1, colour: INK.controlEdge },
      padding: 1,
      gap: 0,
      width,
      children: options.children?.map((option) =>
        option
          ? {
              ...option,
              role: undefined,
              padding: [1, 4],
              fill: option.id?.endsWith(`:${chosen}`) ? INK.chosen : undefined,
              children: option.children,
            }
          : option,
      ),
    } satisfies Node);
  return {
    ...node,
    role: undefined,
    padding: [1, 6, 1, 4],
    gap: 6,
    width,
    height: 16,
    alignY: 'center',
    draw: rounded(INK.control, INK.controlEdge, 2),
    children: [
      { ...(node.children?.[0] || {}), text: { words: node.label ?? '', colour: INK.white, wrap: false } },
      { width: 10, height: 6, picture: CHEVRON },
      list,
    ],
  };
}

/** One of `options` chosen from a list that opens under it, as a browser's own list looks; answers its node and the
 *  choice now. */
export function chooser(
  ui: Interface,
  id: string,
  chosen: string,
  options: readonly { readonly value: string; readonly words: string }[],
): { node: Node; chosen: string } {
  const made = choice(ui, id, chosen, options);
  const widest = Math.max(...options.map((option) => ui.renderer.measure(option.words, 1)));
  return { chosen: made.chosen, node: { ...dressed(made.node, made.chosen, widest + 22), ...focusRing(ui, id) } };
}

/** A line of words to type, as a browser's own field looks, `width` pixels wide (a 24 character field's). Its value is
 *  `value` until it is typed in; what is typed is handed to `commit` once Enter is pressed or the focus leaves it, so
 *  each edit is one undo step. */
export function textField(
  ui: Interface,
  id: string,
  value: string,
  commit: (text: string) => void,
  more: { readonly placeholder?: string; readonly most?: number; readonly width?: number } = {},
): Node {
  const focused = ui.focused(id);
  const was = ui.store.get(`${id}:focused`) === true;
  ui.store.set(`${id}:focused`, focused);
  const typed = ui.fieldText(id, value);
  if ((ui.submitted(id) || (was && !focused)) && typed !== value) commit(typed);
  else if (!focused && !was && typed !== value) ui.setFieldText(id, value);
  // What a press on the view hands over first (`EditorFrame.settle`).
  if (focused) ui.store.set(TYPED, typed !== value ? () => commit(typed) : null);
  // The ground is drawn by a node of its own, under the field, which draws its words before its own drawing.
  return {
    width: more.width ?? 165,
    height: 19,
    draw: rounded(INK.control, INK.controlEdge, 2),
    children: [
      {
        id,
        label: more.placeholder ?? value,
        field: { placeholder: more.placeholder, most: more.most ?? 48 },
        width: 'grow',
        height: 'grow',
        padding: [2, 4],
        ...focusRing(ui, id),
      },
    ],
  };
}

/** Hands what is being typed in a field to it now and takes the focus from it, as a press elsewhere takes the focus;
 *  the field does not hand it over again as it sees the focus gone. */
export function settleTyping(ui: Interface): void {
  const typing = ui.typing;
  if (!typing) return;
  const commit = ui.store.get(TYPED);
  ui.store.delete(TYPED);
  ui.store.set(`${typing.id}:focused`, false);
  if (typeof commit === 'function') (commit as () => void)();
  ui.focusOn(null);
}

/** A press of words with a dotted line under each of its lines, read as a link. */
export function link(ui: Interface, id: string, text: string, run: () => void): Node {
  if (ui.clicked(id)) run();
  const underline: Drawing = (renderer, box, scale, clip, fade) => {
    const lines = wrapped(renderer.face, text, 1, box.width / scale);
    const [red, green, blue, alpha] = colourOf(INK.words);
    lines.forEach((line, index) => {
      const width = renderer.measure(line, 1) * scale;
      const y = box.y + (index * 13 + 12) * scale;
      for (let x = 0; x < width; x += 2 * scale)
        renderer.quads.add({ x: box.x + x, y, width: scale, height: scale }, [red, green, blue, alpha * fade], clip);
    });
  };
  return {
    id,
    press: true,
    label: text,
    width: 'grow',
    text: { words: text, colour: INK.words },
    draw: underline,
    ...focusRing(ui, id),
  };
}

/** A list's item with its bullet. */
export const bulleted = (item: Node): Node => ({
  width: 'grow',
  children: [
    { width: 18, padding: [6, 0, 0, 5], children: [{ width: 3, height: 3, draw: rounded(INK.words, null, 1.5) }] },
    { ...item, width: 'grow' },
  ],
});

/** A control in a line with its words before and after it: the words on the line the control stands on, those after
 *  it running on to a line of their own where they reach the panel's edge. */
export const inline = (label: string, control: Node, after: string): Node => ({
  width: 'grow',
  minHeight: 21,
  gap: 4,
  children: [
    words(label, INK.words, { padding: [8, 0, 0, 0] }),
    { padding: [3, 3, 0, 2], children: [control] },
    { width: 'grow', padding: [8, 0, 0, 0], text: { words: after, colour: INK.words } },
  ],
});

/** `node` with room after it, as the space after a word parts it from the next. */
export const spaced = (node: Node, room = 2): Node => ({ padding: [0, room, 0, 0], children: [node] });

/** A block of the panel with the room it keeps above and below it; with no node, an empty paragraph, whose room still
 *  parts its neighbours. */
export interface Block {
  readonly node: Child;
  readonly top?: number;
  readonly bottom?: number;
}

/** Blocks one under another, the room between two the larger of the rooms they keep, never the two added. */
export function stacked(blocks: readonly Block[]): Child[] {
  const laid: Child[] = [];
  let pending = 0;
  for (const { node, top = 0, bottom = 0 } of blocks) {
    if (!node) {
      pending = Math.max(pending, top, bottom);
      continue;
    }
    if (Math.max(pending, top) > 0) laid.push(space(Math.max(pending, top)));
    laid.push(node);
    pending = bottom;
  }
  if (pending > 0) laid.push(space(pending));
  return laid;
}

/** A paragraph as a block, its margins a line of words; empty, it is only its margins. */
export const said = (text: string, colour: string = INK.dim): Block => ({
  node: text ? paragraph(text, colour) : null,
  top: 11,
  bottom: 11,
});

/** A list's row of the panel, lit with an edge round it when chosen. */
export function listRow(
  ui: Interface,
  id: string,
  label: string,
  chosen: boolean,
  run: () => void,
  more: Partial<Node>,
): Node {
  if (ui.clicked(id)) run();
  const lit = rounded(INK.press, INK.chosenEdge, 5);
  return {
    id,
    press: true,
    label,
    width: 'grow',
    padding: [5, 6],
    ...(chosen
      ? { draw: (renderer, box, scale, clip, fade) => lit(renderer, grown(box, scale), scale, clip, fade) }
      : {}),
    ...(ui.focused(id) && ui.keyFocused ? { outline: { width: 2, colour: INK.controlLit } } : {}),
    ...more,
  };
}

const grown = (box: Box, step: number): Box => ({
  x: box.x - step,
  y: box.y - step,
  width: box.width + 2 * step,
  height: box.height + 2 * step,
});

/** A square of colour with its corners rounded, holding a mark in black. */
export const swatch = (colour: string, mark: string): Node => ({
  width: 22,
  height: 22,
  alignX: 'center',
  alignY: 'center',
  draw: rounded(colour, null, 4),
  children: [{ text: { words: mark, colour: '#000000', wrap: false } }],
});

/** The interface: what the mode lays over its view, under the panel at the left, which scrolls. */
export function editorRoot(drawn: { readonly over: readonly Child[]; readonly panel: readonly Child[] }): Node {
  return {
    width: 'grow',
    height: 'grow',
    children: [
      { float: { to: 'screen' }, width: 'grow', height: 'grow', through: true, children: drawn.over },
      {
        width: PANEL_WIDTH,
        height: 'grow',
        // Over every name and plate the view lays, however they float.
        float: { to: 'screen', z: 5 },
        children: [
          {
            id: 'editor-panel',
            width: 'grow',
            height: 'grow',
            scroll: true,
            direction: 'column',
            padding: [12, 14],
            fill: INK.ground,
            children: drawn.panel,
          },
          { width: 1, height: 'grow', fill: INK.edge },
        ],
      },
    ],
  };
}
