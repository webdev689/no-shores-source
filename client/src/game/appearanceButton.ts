// The Appearance screen's shared parts: an emblem's card, and the key the Appearance button on the Character page
// (characterPage.ts) is found by, which takes the focus back once the screen closes.
import type { Node } from '../ui/node.ts';
import { rarityNumber } from './appearance/appearanceModel.ts';
import type { Emblem } from './emblemArt.ts';
import { cardNode } from './gearCard.ts';
import { INK, type Sizes, emblemNode, hintsNode } from './gearNodes.ts';

/** The key of the Appearance button, which takes the focus back once the screen closes. */
export const APPEARANCE_KEY = 'appearance';

/** An emblem's card: its name and rarity, its nameplate, its words, and whether it is worn or a click wears it. */
export function emblemCard(emblem: Emblem, kept: boolean, worn: boolean, sizes: Sizes): Node {
  const foot: Node | null = worn
    ? { width: 'grow', padding: [7, 12, 8, 12], text: { words: 'Worn.', size: sizes.label, colour: INK.faint } }
    : kept
      ? { width: 'grow', padding: [7, 12, 8, 12], children: [hintsNode([['Click', 'Wear']], 1, 12)] }
      : null;
  const card = cardNode(
    {
      name: emblem.name,
      rarity: rarityNumber(emblem.rarity),
      kind: 'Emblem',
      big: null,
      rows: [],
      element: 0,
      traits: [],
      words: '',
      compare: null,
    },
    null,
    [],
    sizes,
    {
      after: [
        emblemNode(emblem, 'plate', 120, 240, 48),
        { width: 'grow', padding: [4, 0], text: { words: emblem.words, size: sizes.label, colour: INK.faint } },
      ],
    },
  );
  return foot ? { ...card, children: [...(card.children ?? []), foot] } : card;
}
