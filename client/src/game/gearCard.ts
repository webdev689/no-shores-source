// An item's card as the game draws it, after Enhanced Plus's and Destiny's: its name on a band of its rarity, its kind,
// pips and element, its picture beside its main number and lines, its fight numbers as bars, its traits and words, what
// it changes over the piece it would replace, and along its foot what may be done with it. Every card of the menu (a
// cell's, a node's) wears the same frame (`cardFrame`).

import { edged } from '../combat/barDraw.ts';
import { ELEMENTS, RARITIES } from '../player/gear.ts';
import type { Picture } from '../player/picture.ts';
import type { Child, Node } from '../ui/node.ts';
import type { Card, Trait } from './gearCards.ts';
import { powerNode, statSheetNode } from './statBars.ts';
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

/** A trait as a card or a page lists it: its column's glyph, its name and its words. What a perk that gives and takes
 *  costs stands apart, in the colour of a loss; a word says where an Atheric's perk stands, and its own node not yet
 *  chosen is drawn dim. */
export function traitNode(trait: Trait, size: number): Node {
  const lit = trait.off ? INK.brass : INK.brassLit;
  return {
    width: 'grow',
    gap: 8,
    padding: [4, 0],
    children: [
      nodeGlyphNode(trait.kind, lit),
      {
        width: 'grow',
        direction: 'column',
        children: [
          words(trait.name, size, trait.off ? INK.faint : lit),
          {
            width: 'grow',
            text: { words: trait.takes ? (trait.gives ?? trait.words) : trait.words, size, colour: INK.faint },
          },
          trait.takes ? { width: 'grow', text: { words: trait.takes, size, colour: INK.loss } } : null,
          trait.note ? label(trait.note, size) : null,
        ],
      },
    ],
  };
}

/** A card's lines of a name and a value, the value's change beside it where the card compares. */
function rowsNode(card: Card, size: number): Node {
  return {
    width: 'grow',
    direction: 'column',
    gap: 2,
    children: card.rows.map(([name, value]): Node => {
      const compared = card.compare?.rows.find((row) => row.label === name);
      const change = compared ? compared.to - compared.from : 0;
      return {
        width: 'grow',
        children: [
          { width: 'grow', children: [label(name, size)] },
          {
            text: {
              words: [
                { words: value },
                ...(change !== 0
                  ? [
                      {
                        words: ` ${change > 0 ? '+' : '−'}${Math.abs(change)}`,
                        colour: change > 0 ? INK.gain : INK.loss,
                      },
                    ]
                  : []),
              ],
              size,
              colour: INK.word,
              wrap: false,
            },
          },
        ],
      };
    }),
  };
}

/** Words in italic, faint, as an item's flavour stands apart from what it does. */
export const flavourNode = (said: string, size: number): Node => ({
  width: 'grow',
  text: { words: [{ words: said, style: 'italic' }], size, colour: INK.faint },
});

/** A thin rule parting a card's numbers from its bars and its perks. */
const parted = (colour: string): Node => ({ width: 'grow', height: 1, fill: colour });

/** An item's hover card: its picture beside its main number and its lines, its fight numbers as bars, its perks and
 *  its words; set beside the piece it would replace, what changes, in green and red. */
function itemCardBody(card: Card, picture: Picture | null, sizes: Sizes, more: CardMore): Child[] {
  const size = sizes.label;
  const box = size > 1 ? 112 : 80;
  const icon = more.icon ?? (picture && pictureNode(picture, box - 8, sizes.ratio));
  const compared = card.big ? card.compare?.rows.find((row) => row.label === card.big?.label) : undefined;
  return [
    {
      width: 'grow',
      gap: 12,
      alignY: 'center',
      children: [
        icon && {
          width: box,
          height: box,
          alignX: 'center',
          alignY: 'center',
          fill: INK.well,
          outline: { width: 1, colour: 'rgba(163,152,128,0.2)' },
          children: [icon],
        },
        {
          width: 'grow',
          direction: 'column',
          gap: 6,
          children: [
            card.big && powerNode(card.big, compared ? compared.to - compared.from : null, size > 1 ? 4 : 3, size),
            card.rows.length > 0 && rowsNode(card, size),
          ],
        },
      ],
    },
    card.sheet && parted('rgba(255,255,255,0.07)'),
    card.sheet && { width: 'grow', padding: [2, 0], children: [statSheetNode(card.sheet, size, false)] },
    card.traits.length > 0 && parted('rgba(255,255,255,0.07)'),
    ...card.traits.map((trait) => traitNode(trait, size)),
    card.words !== '' && { width: 'grow', padding: [4, 0, 0, 0], children: [flavourNode(card.words, size)] },
    card.compare && {
      width: 'grow',
      padding: [4, 0, 0, 0],
      children: [
        {
          width: 'grow',
          text: {
            words: `Against your ${card.compare.replaces}${card.compare.nodesAside ? ', nodes aside' : ''}`,
            size,
            colour: INK.faint,
          },
        },
      ],
    },
    ...(more.after ?? []),
  ];
}

/** What a card may be given beside its item: its tone, an icon in its picture's place, and lines after its own. */
interface CardMore {
  readonly tone?: Tone;
  readonly icon?: Node;
  readonly after?: readonly Child[];
}

/** An item's hover card, or any other card of the menu's (an Art's, a fragment's, an emblem's), its icon over its
 *  number. A card with a sheet set, every item's, is laid as an item's (`itemCardBody`). */
export function cardNode(
  card: Card,
  picture: Picture | null,
  hints: readonly Hint[],
  sizes: Sizes,
  more: CardMore = {},
): Node {
  const size = sizes.label;
  const icon = more.icon ?? (picture && pictureNode(picture, 96, sizes.ratio));
  const body: Child[] =
    card.sheet !== undefined
      ? itemCardBody(card, picture, sizes, more)
      : [
          icon && { width: 'grow', alignX: 'center', padding: [0, 0, 8, 0], children: [icon] },
          card.big && {
            gap: 8,
            alignY: 'end',
            children: [
              words(String(card.big.value), 3, INK.word),
              { padding: [0, 0, 6, 0], children: [label(card.big.label, size)] },
            ],
          },
          card.rows.length > 0 && { width: 'grow', padding: [8, 0], children: [rowsNode(card, size)] },
          ...card.traits.map((trait) => traitNode(trait, size)),
          card.words !== '' && {
            width: 'grow',
            padding: [4, 0],
            text: { words: card.words, size, colour: INK.faint },
          },
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
