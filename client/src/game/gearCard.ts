// An item's card as the game draws it, after Enhanced Plus's: its name on a band of its rarity, its kind, pips and
// element, its picture large, its main number, its rows, its traits and words, what it changes over the piece it would
// replace, and along its foot what may be done with it. Every card of the menu (a cell's, a node's) wears the same
// frame (`cardFrame`).

import { edged } from '../combat/barDraw.ts';
import { ELEMENTS, RARITIES } from '../player/gear.ts';
import type { Picture } from '../player/picture.ts';
import type { Child, Node } from '../ui/node.ts';
import type { Card, Trait } from './gearCards.ts';
import {
  type Hint,
  INK,
  type Sizes,
  elementNode,
  hintsNode,
  label,
  nodeGlyphNode,
  over,
  pictureNode,
  rarityEdges,
  rarityRgb,
  rgba,
  words,
} from './gearNodes.ts';

/** What colours a card: its frame's lit and shaded edges, and the channels its band is washed in. */
export interface Tone {
  readonly lit: string;
  readonly shade: string;
  readonly rgb: string;
}

/** A rarity's tone; the stone's without one. */
export function rarityTone(rarity: number | null): Tone {
  const [lit, shade] = rarityEdges(rarity);
  return { lit, shade, rgb: rarity === null ? '154,144,121' : rarityRgb(rarity) };
}

/** An element's tone, as the Arts colour a card with one. */
export function elementTone(element: number): Tone {
  const found = ELEMENTS[element];
  if (!found) return rarityTone(null);
  const [dark = INK.stoneLo, , lit = INK.stoneHi] = found.palette;
  const rgb = [1, 3, 5].map((start) => parseInt(found.colour.slice(start, start + 2), 16)).join(',');
  return { lit, shade: dark, rgb };
}

/** A rule across what holds it, in `colour`. */
const rule = (colour: string): Node => ({ width: 'grow', height: 1, fill: colour });

/** A card's frame: its head on a band of `rarity` (stone without one), `body` under it, and `hints` along its foot. */
export function cardFrame(
  sizes: Sizes,
  tone: Tone,
  head: readonly Child[],
  body: readonly Child[],
  hints: readonly Hint[] = [],
  foot: Child = null,
): Node {
  const { rgb } = tone;
  return {
    width: sizes.card,
    direction: 'column',
    fill: INK.ground,
    padding: 2,
    draw: edged([tone.lit, tone.shade, tone.shade, tone.lit], 2),
    children: [
      {
        width: 'grow',
        direction: 'column',
        padding: [9, 12, 8, 12],
        gap: 3,
        fill: over(rgb, 0.29, '#15171c'),
        children: head,
      },
      rule(rgba(rgb, 0.45)),
      body.length > 0 && { width: 'grow', direction: 'column', padding: [10, 12], gap: 4, children: body },
      foot,
      hints.length > 0 && rule('rgba(255,255,255,0.06)'),
      hints.length > 0 && { width: 'grow', padding: [7, 12, 8, 12], children: [hintsNode(hints, 1, 12)] },
    ],
  };
}

/** A card that only names what it stands beside (a currency, the account), as wide as the name. */
export function nameCard(sizes: Sizes, name: string): Node {
  return { ...cardFrame(sizes, rarityTone(null), [cardName(name, null)], []), width: 'fit' };
}

/** A card's name, in its rarity's lit tone (a Normal piece's in its own white). */
export function cardName(name: string, rarity: number | null, size = 2): Node {
  const found = rarity === null ? undefined : RARITIES[rarity];
  const colour = rarity === 0 ? found?.colour : found?.lit;
  return { width: 'grow', text: { words: name, size, colour: colour ?? INK.word } };
}

/** An item's kind, its pips and its element's glyph and name, as a line. */
export function kindLine(
  kind: string,
  rarity: number,
  element: number,
  size: number,
  more: readonly Child[] = [],
): Node {
  const pips = RARITIES[rarity]?.pips ?? '';
  const glyph = elementNode(element, 22);
  return {
    gap: 8,
    alignY: 'center',
    wrap: true,
    children: [
      words(kind, size, INK.word),
      ...more,
      pips !== '' && words(pips, size, RARITIES[rarity]?.colour ?? INK.faint),
      glyph && {
        gap: 4,
        alignY: 'center',
        children: [glyph, words(ELEMENTS[element]?.name ?? '', size, ELEMENTS[element]?.colour ?? INK.word)],
      },
    ],
  };
}

/** How far each number's meter reaches, for what a piece changes over the one it would replace. */
const MOST: Readonly<Record<string, number>> = { Attack: 300, Defense: 450, Prestige: 30 };

/** What a piece changes over the one it would replace, as Destiny's card shows it: each number's meter at the lesser
 *  of the two, the rest of the greater a segment gained or lost, and the new number with the change beside it. */
export function compareNode(compare: NonNullable<Card['compare']>, size: number, wide: boolean): Node {
  const [labelWidth, valueWidth] = wide ? [110, 96] : [64, 72];
  return {
    width: 'grow',
    direction: 'column',
    gap: 8,
    padding: [8, 0, 0, 0],
    children: [
      rule('rgba(255,255,255,0.08)'),
      words(`Replaces ${compare.replaces}`, size, INK.faint),
      ...compare.rows.map((row): Node => {
        const change = row.to - row.from;
        const most = Math.max(MOST[row.label] ?? 0, row.from, row.to, 1);
        const sign = change > 0 ? '+' : change < 0 ? '−' : '';
        const tone = change > 0 ? INK.gain : INK.loss;
        return {
          width: 'grow',
          gap: 8,
          alignY: 'center',
          children: [
            { width: labelWidth, children: [label(row.label, size)] },
            {
              width: 'grow',
              height: 8,
              padding: 2,
              role: 'well',
              children: [
                { width: `${(Math.min(row.from, row.to) / most) * 100}%`, height: 'grow', fill: '#d9d0ae' },
                change !== 0 && {
                  width: `${(Math.abs(change) / most) * 100}%`,
                  height: 'grow',
                  fill: change > 0 ? INK.gain : 'rgba(232,150,138,0.45)',
                },
              ],
            },
            {
              width: valueWidth,
              alignX: 'end',
              children: [
                {
                  text: {
                    words: [
                      { words: String(row.to) },
                      ...(change !== 0 ? [{ words: ` ${sign}${Math.abs(change)}`, colour: tone }] : []),
                    ],
                    size,
                    colour: INK.word,
                    wrap: false,
                  },
                },
              ],
            },
          ],
        };
      }),
    ],
  };
}

/** A trait as a card or a page lists it: its column's glyph, its name and its words. */
export function traitNode(trait: Trait, size: number): Node {
  return {
    width: 'grow',
    gap: 8,
    padding: [4, 0],
    children: [
      nodeGlyphNode(trait.kind, INK.brassLit),
      {
        width: 'grow',
        direction: 'column',
        children: [
          words(trait.name, size, INK.brassLit),
          { width: 'grow', text: { words: trait.words, size, colour: INK.faint } },
        ],
      },
    ],
  };
}

/** An item's hover card. */
export function cardNode(
  card: Card,
  picture: Picture | null,
  hints: readonly Hint[],
  sizes: Sizes,
  more: { readonly tone?: Tone; readonly icon?: Node; readonly after?: readonly Child[] } = {},
): Node {
  const size = sizes.label;
  const icon = more.icon ?? (picture && pictureNode(picture, 96, sizes.ratio));
  const body: Child[] = [
    icon && { width: 'grow', alignX: 'center', padding: [0, 0, 8, 0], children: [icon] },
    card.big && {
      gap: 8,
      alignY: 'end',
      children: [
        words(String(card.big.value), 3, INK.word),
        { padding: [0, 0, 6, 0], children: [label(card.big.label, size)] },
      ],
    },
    card.rows.length > 0 && {
      width: 'grow',
      direction: 'column',
      gap: 2,
      padding: [8, 0],
      children: card.rows.map(([name, value]): Node => ({
        width: 'grow',
        children: [{ width: 'grow', children: [label(name, size)] }, words(value, size, INK.word)],
      })),
    },
    ...card.traits.map((trait) => traitNode(trait, size)),
    card.words !== '' && { width: 'grow', padding: [4, 0], text: { words: card.words, size, colour: INK.faint } },
    card.compare && compareNode(card.compare, size, sizes.label > 1),
    ...(more.after ?? []),
  ];
  return cardFrame(
    sizes,
    more.tone ?? rarityTone(card.rarity),
    [cardName(card.name, card.rarity), kindLine(card.kind, card.rarity, card.element, size)],
    body,
    hints,
  );
}
