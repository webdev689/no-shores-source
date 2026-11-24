// The key strip drawn: a compact panel at the bottom right, as the action lists of large games stand in a corner. Its
// head names the moment in faint capitals beside a brass diamond; under a rule each control is a row, its keys on
// small caps (the mouse's buttons and the pad's drawn) in a column of their own, right-aligned so the words beside them
// line up, and the key to every control last under a rule of its own. The panel is dark glass edged in brass at its
// left, as the notices are edged; it stands clear over whatever stood at the view's foot beneath it last frame. A
// control that is held has its cap ringed, traced round as far as it is held.
import { edged, paintBox } from '../combat/barDraw.ts';
import { TONES } from '../plus/tones.ts';
import type { Drawing, Node } from '../ui/node.ts';
import type { Box } from '../ui/quads.ts';
import { drawings, ruleUnder } from './hudParts.ts';
import type { StripRow } from './hints.ts';
import { iconNode, isMouse } from './keyIcons.ts';
import { padIconNode } from './padIcons.ts';
import { traced } from './usePrompt.ts';

/** A row's height, a cap's and its least width, and the room kept round the panel, CSS pixels at the first step. */
const ROW = 19;
const CAP = 17;
const CAP_LEAST = 15;
const SIDE = 28;
const FOOT = 22;
/** How far the panel keeps over what stands under it, and its widest guess before it is first laid. */
const CLEAR = 8;
const GUESS = 200;
/** A cap's stone, lit on its top and left, its foot deeper; and the panel's glass and its brass edge. */
const CAP_EDGES = ['#6d6252', '#231e18', '#231e18', '#6d6252'];
const CAP_FILL = '#16181d';
const GLASS = 'rgba(8,9,12,0.7)';
const GLASS_EDGES = ['rgba(5,6,8,0.9)', 'rgba(5,6,8,0.9)', 'rgba(5,6,8,0.9)', TONES.brass];
const FAINT = TONES.stoneHi;
const RING_FAINT = 'rgba(239,232,214,0.22)';

/** What the strip shows this frame: the moment's name, its rows (the key to every control last), the control held now
 *  and how far (0 to 1), and the view's zoom (2 past 1440p). */
export interface StripShown {
  readonly title: string;
  readonly rows: readonly StripRow[];
  readonly held: { readonly names: string; readonly share: number } | null;
  readonly zoom: number;
}

/** How high the panel's foot stands over the view's, CSS pixels: its own 22, or 8 over the highest of `under` (what
 *  stood at the view's foot last frame) that it would stand over, judged by where it stood last frame (`was`). */
export function stripFoot(
  view: { readonly width: number; readonly height: number },
  was: Box | null,
  under: readonly (Box | null)[],
  zoom: number,
): number {
  const right = view.width - SIDE * zoom;
  const left = was ? was.x : right - GUESS * zoom;
  let foot = FOOT * zoom;
  for (const box of under)
    if (box && box.x < right && box.x + box.width + CLEAR * zoom > left)
      foot = Math.max(foot, view.height - box.y + CLEAR * zoom);
  return foot;
}

/** The panel at `foot` over the view's foot (`stripFoot`); none with no rows. */
export function stripNode(shown: StripShown, foot: number): Node | null {
  const { rows, zoom } = shown;
  if (rows.length === 0) return null;
  const [body, last] = [rows.slice(0, -1), rows.slice(-1)];
  // The rule over the last row runs through both columns, which stand side by side with no gap between.
  const rule: Node = { width: 'grow', height: 7 * zoom, draw: midRule };
  const keys = (row: StripRow): Node => ({
    height: ROW * zoom,
    gap: 3 * zoom,
    alignY: 'center',
    children: row[0]
      .split(' / ')
      .map((key) => capNode(key, zoom, row[2] === shown.held?.names ? shown.held.share : null)),
  });
  const said = (row: StripRow, colour: string): Node => ({
    height: ROW * zoom,
    alignY: 'center',
    padding: [0, 0, 0, 8 * zoom],
    children: [{ text: { words: row[1], size: zoom, colour, edge: 'shadow', edgeColour: '#000', wrap: false } }],
  });
  return {
    id: 'hud:hints',
    through: true,
    direction: 'column',
    fill: GLASS,
    draw: edged(
      GLASS_EDGES,
      [1, 1, 1, 2].map((depth) => depth * zoom),
    ),
    padding: [6, 10, 6, 10].map((side) => side * zoom) as [number, number, number, number],
    float: { to: 'screen', at: [1, 1], anchor: [1, 1], x: -SIDE * zoom, y: -foot },
    children: [
      shown.title !== '' && {
        width: 'grow',
        gap: 6 * zoom,
        alignY: 'center',
        padding: [0, 0, 5 * zoom, 0],
        draw: ruleUnder(),
        children: [
          { width: 5 * zoom, height: 5 * zoom, draw: diamond },
          { text: { words: shown.title.toUpperCase(), size: zoom, colour: FAINT, tracking: 3, wrap: false } },
        ],
      },
      shown.title !== '' && { height: 3 * zoom },
      {
        children: [
          {
            direction: 'column',
            alignX: 'end',
            children: [...body.map(keys), ...(body.length > 0 ? [rule] : []), ...last.map(keys)],
          },
          {
            direction: 'column',
            children: [
              ...body.map((row) => said(row, TONES.ink)),
              ...(body.length > 0 ? [rule] : []),
              ...last.map((row) => said(row, FAINT)),
            ],
          },
        ],
      },
    ],
  };
}

/** A key on its small cap, its words at the view's `zoom`: the mouse's button drawn as the mouse and the pad's as the
 *  pad's, with no cap; an arrow drawn on its cap. `held` (0 to 1) rings the cap as far as it is held, over a faint
 *  whole ring; null for a control not held. */
function capNode(key: string, zoom: number, held: number | null = null): Node {
  if (key.startsWith('pad:')) return padCapNode(key.slice('pad:'.length), zoom);
  // The mouse a texel a pixel, edged dark; an arrow a texel a pixel on its cap.
  const mouse = isMouse(key);
  const icon = iconNode(key, mouse ? zoom - 1 : zoom);
  if (icon && mouse) return icon;
  return {
    minWidth: CAP_LEAST * zoom,
    height: CAP * zoom,
    padding: [0, 4 * zoom],
    fill: CAP_FILL,
    alignX: 'center',
    alignY: 'center',
    draw: drawings(
      edged(
        CAP_EDGES,
        [1, 1, 2, 1].map((depth) => depth * zoom),
      ),
      held !== null && ring(held, zoom),
    ),
    children: [icon ?? { text: { words: key, size: zoom, colour: '#efe8d6', wrap: false } }],
  };
}

/** The pad's button `name` drawn a texel a pixel at the first step, edged dark: two pressed together side by side with
 *  a plus between them, one held with the word after it. */
function padCapNode(name: string, zoom: number): Node {
  const held = name.endsWith(' hold');
  const button = held ? name.slice(0, -' hold'.length) : name;
  const said = (words: string): Node => ({
    text: { words, size: zoom, colour: TONES.ink, edge: 'halo', wrap: false },
  });
  const parts = button
    .split('+')
    .flatMap((one, place) => [...(place > 0 ? [said('+')] : []), padIconNode(one, zoom - 1) ?? said(one)]);
  if (parts.length === 1 && !held) return parts[0] ?? said(button);
  return { gap: 2 * zoom, alignY: 'center', children: [...parts, ...(held ? [said('hold')] : [])] };
}

/** A small diamond in brass, five pixels each way at the first step, lit on its upper half. */
const diamond: Drawing = (ui, box, scale, clip, shown) => {
  const pen = { ui, box, scale, clip, fade: shown };
  const step = box.width / 5;
  [1, 3, 5, 3, 1].forEach((across, row) => {
    const part = { x: box.x + ((5 - across) / 2) * step, y: box.y + row * step, width: across * step, height: step };
    paintBox(pen, part, row < 2 ? TONES.brassHi : TONES.brass);
  });
};

/** A rule across the middle of its box: a dark line, the groove's light under it. */
const midRule: Drawing = (ui, box, scale, clip, shown) => {
  const pen = { ui, box, scale, clip, fade: shown };
  const middle = Math.round(box.y + box.height / 2 - scale);
  paintBox(pen, { ...box, y: middle, height: scale }, 'rgba(5,6,8,0.6)');
  paintBox(pen, { ...box, y: middle + scale, height: scale }, TONES.groove);
};

/** A ring round the cap in the pixel between it and the next row's, traced clockwise from its top's middle as far as
 *  `share` over its faint whole. */
const ring =
  (share: number, zoom: number): Drawing =>
  (ui, box, scale, clip, shown) => {
    const pen = { ui, box, scale, clip, fade: shown };
    const [out, line] = [zoom * scale, zoom * scale];
    const round = { x: box.x - out, y: box.y - out, width: box.width + 2 * out, height: box.height + 2 * out };
    for (const part of traced(round, line, 1)) paintBox(pen, part, RING_FAINT);
    for (const part of traced(round, line, share)) paintBox(pen, part, TONES.brassHi);
  };
