// An item's numbers drawn as Destiny 1's weapon page draws its stats: each name set right against a thin bar on a sunk
// track, its value beside it. Set beside another item or another choice of nodes, the part both share stands in bone
// and what changes past it in the gain's green or the loss's red, by which is better (a cost is better less), the
// change's words after the value. The main number, Attack or Defense, stands large with its change beside it.

import type { Child, Node } from '../ui/node.ts';
import { INK, label, words } from './gearNodes.ts';
import type { StatRow, StatSheet } from './itemStats.ts';

/** The bone a bar is filled with, the track it is sunk in, and what is lost of a bar or saved of a cost. */
const BONE = '#d9d0ae';
const TRACK = 'rgba(217,208,174,0.1)';
const LOST = '#b8443c';
const SAVED = 'rgba(116,217,160,0.9)';

/** How wide the names and values stand and how tall a bar is, by the face's step and whether the bars are a page's
 *  (wide) or a card's. */
function widthsOf(
  size: number,
  wide: boolean,
): { readonly name: number; readonly value: number; readonly bar: number } {
  if (wide) return size > 1 ? { name: 168, value: 150, bar: 14 } : { name: 104, value: 104, bar: 10 };
  return size > 1 ? { name: 150, value: 120, bar: 8 } : { name: 86, value: 88, bar: 6 };
}

/** Whether a change is for the better. */
const better = (row: StatRow): boolean =>
  row.from === null ? true : row.less ? row.value < row.from : row.value > row.from;

/** A stat's bar: the part both share in bone, then what was gained or lost. */
function barNode(row: StatRow, height: number): Node {
  const share = (value: number): `${number}%` => `${Number((Math.min(1, Math.max(0, value)) * 100).toFixed(2))}%`;
  const from = row.fromShare ?? row.share;
  const [low, high] = [Math.min(row.share, from), Math.max(row.share, from)];
  const gained = row.share > from;
  const changed = high - low > 0.001;
  return {
    width: 'grow',
    height,
    fill: TRACK,
    children: [
      { width: share(low), height: 'grow', fill: BONE },
      changed && {
        width: share(high - low),
        height: 'grow',
        fill: gained ? (better(row) ? INK.gain : INK.loss) : better(row) ? SAVED : LOST,
      },
    ],
  };
}

/** One stat's row: its name, its bar (none for a count, as Destiny's magazine) and its value, with what changed. */
export function statRowNode(row: StatRow, size: number, wide: boolean): Node {
  const { name, value, bar } = widthsOf(size, wide);
  const tone = better(row) ? INK.gain : INK.loss;
  const said: Node = {
    text: {
      words: [{ words: row.said }, ...(row.change ? [{ words: ` ${row.change}`, colour: tone }] : [])],
      size,
      colour: INK.word,
      wrap: false,
    },
  };
  return {
    width: 'grow',
    gap: 10,
    alignY: 'center',
    label: `${row.label} ${row.said}${row.change ? `, ${row.change}` : ''}`,
    children: [
      { width: name, alignX: 'end', children: [label(row.label, size)] },
      row.bar ? barNode(row, bar) : { width: 'grow', children: [said] },
      row.bar && { width: value, children: [said] },
    ],
  };
}

/** An item's bars, and under them how it is held, each a chip; a card's chips are left to its page. */
export function statSheetNode(sheet: StatSheet, size: number, wide: boolean): Node {
  return {
    width: 'grow',
    direction: 'column',
    gap: wide ? 9 : 6,
    children: [
      ...sheet.rows.map((row) => statRowNode(row, size, wide)),
      wide &&
        sheet.notes.length > 0 && {
          width: 'grow',
          gap: 6,
          wrap: true,
          alignX: 'end',
          padding: [4, 0, 0, 0],
          children: sheet.notes.map((note): Node => ({
            padding: [1, 7],
            fill: 'rgba(163,152,128,0.12)',
            outline: { width: 1, colour: 'rgba(163,152,128,0.25)' },
            children: [{ text: { words: note, size, colour: INK.faint } }],
          })),
        },
    ],
  };
}

/** The main number large, its name under it, and its change beside it where another item is set beside this one. */
export function powerNode(
  power: { readonly label: string; readonly value: number | string },
  change: number | null,
  big: number,
  size: number,
): Node {
  const said: Child =
    change !== null && change !== 0
      ? words(`${change > 0 ? '+' : '−'}${Math.abs(change)}`, size > 1 ? 2 : 1, change > 0 ? INK.gain : INK.loss)
      : null;
  return {
    direction: 'column',
    gap: 2,
    children: [
      { gap: 8, alignY: 'end', children: [words(String(power.value), big, INK.word), said] },
      label(power.label, size),
    ],
  };
}
