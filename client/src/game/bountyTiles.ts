// A bounty as a tile and as a card, after Destiny's Bounty Tracker, drawn by the game; the board's screen and the
// Journal's column both show them. A tile has no words: its glyph says which bounty it is, its ground where it counts
// and its look its state. The card says the rest: its name and kind, its words, its count, what it pays, and at the
// board its press.
import { edged } from '../combat/barDraw.ts';
import type { Child, Node, Size } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import type { BountyRow, Pay } from './bountyBoard.ts';
import { bountyGlyphSvg } from './bountyGlyphs.ts';
import { INK, glyphNode, words } from './gearNodes.ts';
import { type IconName, POOL_GROUNDS, iconNode, pixelNode } from './journalIcons.ts';

/** Each pool's kind, as a card names it under the bounty's name, with its mark. */
export const BOUNTY_KINDS: readonly string[] = ['Land bounty', 'Sea bounty', 'Dungeon bounty'];
const KIND_MARKS: readonly IconName[] = ['land', 'sea', 'dungeon'];
/** A bounty's glyph's pixels a side. */
const GLYPH_PIXELS = 16;
/** A tile's bevel at rest, under the pointer or the keys, and done: the kit's stone, its brass, and a gilded edge. */
const STONE = [INK.stoneHi, INK.stoneLo, INK.stoneLo, INK.stoneHi];
const BRASS = [INK.brassLit, INK.brass, INK.brass, INK.brassLit];
const GILT = ['#f3cf86', '#7a5424', '#5c3f1a', '#c08a3e'];
/** The tile whose card shows: white, as Destiny marks what is selected and the menu marks its focus. */
const CHOSEN = '#f2efe6';

/** The tile chosen among those laid (their ids by place): the one under the pointer or the focus, else `kept` while it
 *  is still among them, else the first. */
export function chosenTile(ui: Interface, ids: ReadonlyMap<number, string>, kept: number | null): number | null {
  for (const [place, id] of ids) if (ui.hovered(id) || ui.focused(id)) return place;
  return kept !== null && ids.has(kept) ? kept : ([...ids.keys()][0] ?? null);
}

/** A gauge of a count toward its target, `height` pixels tall, filled in `colour`. */
function gauge(count: number, target: number, height: number, colour: string, width: Size = 'grow'): Node {
  const share = Math.round((100 * Math.min(count, target)) / Math.max(1, target));
  return {
    role: 'track',
    width,
    height,
    bevel: 1,
    padding: 1,
    children: [{ width: `${share}%`, height: 'grow', fill: colour }],
  };
}

/** A bounty's tile `size` pixels square (its glyph at three or four times its pixels): its own glyph on its kind's
 *  ground, and its state: open plain, taken with a gauge of its count, done with a gold edge, turned in dimmed with a
 *  tick; lit under the pointer or the keys. Pressed with the pointer, Enter or E; one `shut`, before the prologue,
 *  is never marked chosen. */
export function bountyTileNode(
  row: BountyRow,
  id: string,
  size: number,
  chosen: boolean,
  lit = false,
  shut = false,
): Node {
  const said = { open: 'Not taken', held: row.progress, done: 'Done', paid: 'Turned in' }[row.state];
  const glyph = size >= 80 ? 4 * GLYPH_PIXELS : 3 * GLYPH_PIXELS;
  const counting = row.state === 'held' || row.state === 'done';
  const tile: Node = {
    id,
    press: true,
    keys: ['e'],
    label: `${row.name}: ${row.words} ${said}`,
    width: size,
    height: size,
    alignX: 'center',
    alignY: 'center',
    fill: POOL_GROUNDS[row.pool] ?? INK.well,
    draw: edged(row.state === 'done' ? GILT : lit ? BRASS : STONE, 2),
    ...(chosen && !shut && { outline: { width: 2, colour: CHOSEN } }),
    children: [
      {
        ...pixelNode(`bounty ${row.name} ${row.pool}`, bountyGlyphSvg(row.name, row.pool), [16, 16], glyph),
        opacity: row.state === 'paid' ? 0.45 : 1,
      },
      counting && {
        ...gauge(row.count, row.target, 4, row.state === 'done' ? INK.gain : INK.brassLit, size - 8),
        float: { to: 'parent', anchor: [0.5, 1], at: [0.5, 1], y: -4 },
      },
      row.state === 'paid' && {
        ...iconNode('taken', 24),
        float: { to: 'parent', anchor: [1, 1], at: [1, 1], x: -2, y: -2 },
      },
    ],
  };
  return tile;
}

/** What a bounty pays, each by its glyph: XP by its letters, Aurem by its coin, resting once it is turned in. */
function payNode(pay: Pay, paid: boolean, size: number): Node {
  const colour = paid ? INK.faint : INK.gain;
  const earn = (mark: Node, amount: number): Node => ({
    gap: 4,
    alignY: 'center',
    children: [mark, words(`+${amount.toLocaleString()}`, size, colour)],
  });
  return {
    gap: 14,
    wrap: true,
    alignY: 'center',
    opacity: paid ? 0.6 : 1,
    children: [earn(iconNode('xp', 24), pay.xp), earn(glyphNode('aurem', 24), pay.aurem)],
  };
}

/** A bounty's card `width` pixels wide: its name, its kind under it by its mark, its words, a gauge with its count,
 *  what it pays, and `foot` (the board's press, or a word on its state). */
export function bountyCardNode(row: BountyRow, pay: Pay, foot: Child, width: Size = 'grow', size = 1): Node {
  const shown = row.state === 'paid' ? row.target : row.count;
  return {
    id: 'bounty-card',
    role: 'panel',
    width,
    direction: 'column',
    gap: 6,
    padding: [12, 14, 14, 14],
    children: [
      words(row.name.toUpperCase(), size + 1, INK.brassLit, { tracking: 1 }),
      {
        gap: 6,
        alignY: 'center',
        children: [
          iconNode(KIND_MARKS[row.pool] ?? 'land', 24),
          words((BOUNTY_KINDS[row.pool] ?? '').toUpperCase(), size, INK.faint, { tracking: 3 }),
        ],
      },
      { width: 'grow', padding: [4, 0, 0, 0], text: { words: row.words, size, colour: INK.word } },
      {
        width: 'grow',
        gap: 8,
        alignY: 'center',
        children: [gauge(shown, row.target, 6, INK.brassLit), words(`${shown}/${row.target}`, size, INK.word)],
      },
      payNode(pay, row.state === 'paid', size),
      foot,
    ],
  };
}

/** A word on a bounty's state under its card, by its mark where it has one. */
export function stateLine(said: string, icon: IconName | null, size = 1): Node {
  return {
    width: 'grow',
    gap: 6,
    alignY: 'center',
    children: [icon && iconNode(icon, 24), { width: 'grow', text: { words: said, size, colour: INK.faint } }],
  };
}
