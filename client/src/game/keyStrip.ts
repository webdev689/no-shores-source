// The key strip drawn: a compact panel at the bottom right, as the action lists of large games stand in a corner. Its
// head names the moment in faint capitals beside a brass diamond; under a rule each control is a row, its keys on
// small caps (the mouse's buttons and the pad's drawn) in a column of their own, right-aligned so the words beside them
// line up, and the key to every control last under a rule of its own. The panel is dark glass edged in brass at its
// left, as the notices are edged; it stands clear over whatever stood at the view's foot beneath it last frame, and
// fits under what stands above it, giving up its head and then its rows. A control that is held has its cap ringed,
// traced round as far as it is held.
import { edged, paintBox } from '../combat/barDraw.ts';
import { TONES } from '../plus/tones.ts';
import type { Drawing, Node } from '../ui/node.ts';
import type { Box } from '../ui/quads.ts';
import { drawings, padCap, ruleUnder } from './hudParts.ts';
import type { StripRow } from './hints.ts';
import { iconNode, isMouse } from './keyIcons.ts';
import { heldRing } from './usePrompt.ts';

/** A row's height, a cap's and its least width, and the room kept round the panel, CSS pixels at the first step; the
 *  panel's padding, its head with the space under it, and the rule over the last row, as they stand laid. */
const ROW = 18;
const PAD = 12;
const HEAD = 20;
const RULE = 7;
const CAP = 16;
const CAP_LEAST = 15;
const SIDE = 28;
const FOOT = 22;
/** How far the panel keeps from what stands under and over it, and its widest guess before it is first laid (wider
 *  than it stands, so a first frame stands over too much rather than on something). */
const CLEAR = 8;
const GUESS = 260;
/** A cap's stone, lit on its top and left, its foot deeper; and the panel's glass and its brass edge. */
const CAP_EDGES = ['#6d6252', '#231e18', '#231e18', '#6d6252'];
const CAP_FILL = '#16181d';
const GLASS = 'rgba(8,9,12,0.7)';
const GLASS_EDGES = ['rgba(5,6,8,0.9)', 'rgba(5,6,8,0.9)', 'rgba(5,6,8,0.9)', TONES.brass];
const FAINT = TONES.stoneHi;

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

/** How much of the strip stands in `room` CSS pixels of height: its `count` rows under its head, else without the
 *  head, else as many rows as fit, one at least. */
export function stripFit(
  count: number,
  room: number,
  zoom: number,
): { readonly most: number; readonly titled: boolean } {
  const height = (rows: number, titled: boolean) => (PAD + (titled ? HEAD : 0) + rows * ROW + RULE) * zoom;
  if (height(count, true) <= room) return { most: count, titled: true };
  if (height(count, false) <= room) return { most: count, titled: false };
  return { most: Math.max(1, Math.floor((room / zoom - PAD - RULE) / ROW)), titled: false };
}

/** The panel at `foot` over the view's foot (`stripFoot`); none with no rows. The key to every control, last, stands
 *  under its rule. */
export function stripNode(shown: StripShown, foot: number): Node | null {
  const { rows, zoom } = shown;
  if (rows.length === 0) return null;
  const footed = rows.at(-1)?.[2] === 'controls';
  const [body, last] = footed ? [rows.slice(0, -1), rows.slice(-1)] : [rows, []];
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
      shown.title !== '' && { height: 2 * zoom },
      {
        children: [
          {
            direction: 'column',
            alignX: 'end',
            children: [...body.map(keys), ...(body.length > 0 && footed ? [rule] : []), ...last.map(keys)],
          },
          {
            direction: 'column',
            children: [
              ...body.map((row) => said(row, TONES.ink)),
              ...(body.length > 0 && footed ? [rule] : []),
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
  // The pad's a texel a pixel at the first step, edged dark; held, ringed round as a key's cap is.
  if (key.startsWith('pad:')) {
    const pad = padCap(key.slice('pad:'.length), zoom, zoom - 1);
    return held === null ? pad : { draw: heldRing(held, zoom, zoom), children: [pad] };
  }
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
      held !== null && heldRing(held, zoom, zoom),
    ),
    children: [icon ?? { text: { words: key, size: zoom, colour: '#efe8d6', wrap: false } }],
  };
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
