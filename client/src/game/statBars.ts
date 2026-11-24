// An item's numbers drawn as Destiny 1's weapon page draws its stats: each name set right against a thin bar on a sunk
// track, its value beside it. Set beside another item or another choice of nodes, the part both share stands in bone
// and what changes past it in the gain's green or the loss's red, by which is better (a cost is better less), the
// change's words after the value. The main number, Attack or Defense, stands large with its change beside it.

import type { Child, Node } from '../ui/node.ts';
import { INK, label, words } from './gearNodes.ts';
import type { StatRow, StatSheet } from './itemStats.ts';

/** The bone a bar is filled with, the track it is sunk in, and what is lost of a bar, faded. */
const BONE = '#d9d0ae';
const TRACK = '#07080a';
const LOST = 'rgba(232,150,138,0.5)';
const SAVED = 'rgba(116,217,160,0.45)';

/** How wide the names and values stand, by the face's step and whether the bars are a page's (wide) or a card's; a
 *  card names its numbers at the face's first step, as small as its hints, so the bars keep their room. */
function widthsOf(size: number, wide: boolean): { readonly name: number; readonly value: number } {
  if (wide) return size > 1 ? { name: 168, value: 150 } : { name: 104, value: 104 };
  return size > 1 ? { name: 86, value: 150 } : { name: 86, value: 88 };
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
    outline: { width: 1, colour: 'rgba(163,152,128,0.22)' },
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

/** One stat's row: its name, its bar and its value, with what changed. */
export function statRowNode(row: StatRow, size: number, wide: boolean): Node {
  const { name, value } = widthsOf(size, wide);
  const tone = better(row) ? INK.gain : INK.loss;
  return {
    width: 'grow',
    gap: 10,
    alignY: 'center',
    label: `${row.label} ${row.said}${row.change ? `, ${row.change}` : ''}`,
    children: [
      { width: name, alignX: 'end', children: [label(row.label, wide ? size : 1)] },
      barNode(row, size > 1 ? 10 : wide ? 8 : 6),
      {
        width: value,
        children: [
          {
            text: {
              words: [{ words: row.said }, ...(row.change ? [{ words: ` ${row.change}`, colour: tone }] : [])],
              size,
              colour: INK.word,
              wrap: false,
            },
          },
        ],
      },
    ],
  };
}

/** An item's bars, and under them how it is held and what it carries, each a chip. */
export function statSheetNode(sheet: StatSheet, size: number, wide: boolean): Node {
  return {
    width: 'grow',
    direction: 'column',
    gap: wide ? 9 : 6,
    children: [
      ...sheet.rows.map((row) => statRowNode(row, size, wide)),
      sheet.notes.length > 0 && {
        gap: 6,
        wrap: true,
        padding: [wide ? 4 : 2, 0, 0, widthsOf(size, wide).name + 10],
        children: sheet.notes.map((note): Node => ({
          padding: [1, 7],
          fill: 'rgba(163,152,128,0.12)',
          outline: { width: 1, colour: 'rgba(163,152,128,0.25)' },
          children: [words(note, 1, INK.faint)],
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
