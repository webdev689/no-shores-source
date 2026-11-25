// An Atheric bounty in the Journal's bounties, after the board's, as Destiny 1's exotic bounties stood apart from its
// dailies: a card of its own for each one held or finished, its Atheric's name and its find's words, and its steps
// (content/gear/atheric_bounties.json), each done, under way with its count, or still to come.
import bounties from '../../../../content/gear/atheric_bounties.json' with { type: 'json' };
import items from '../../../../content/gear/items.json' with { type: 'json' };
import type { AthericBountyState } from '../../network/passageMessages.ts';
import type { Node } from '../../ui/node.ts';
import { RARITIES } from '../../player/gear.ts';
import { gauge } from '../bountyTiles.ts';
import { INK, words } from '../gearNodes.ts';
import { iconNode } from '../journalIcons.ts';

/** The Atheric rarity, whose colour the card's name wears. */
const ATHERIC = RARITIES[4];

/** A step of the bounty as its card says it: its words, how far it is, and whether it is done or still to come. */
export interface AthericStep {
  readonly words: string;
  readonly count: number;
  readonly target: number;
  readonly state: 'done' | 'under way' | 'to come';
}

/** The card's view: the Atheric's name, the find's name and words, and each step. */
export interface AthericCard {
  readonly id: string;
  readonly name: string;
  readonly find: string;
  readonly words: string;
  readonly finished: boolean;
  readonly steps: readonly AthericStep[];
}

/** Each bounty the player holds or has finished, as its card says it, in the content's order; none they hold not. */
export function athericCards(held: readonly AthericBountyState[] | undefined): AthericCard[] {
  return bounties.flatMap((bounty): AthericCard[] => {
    const state = held?.find((each) => each.id === bounty.id);
    if (!state) return [];
    const name = items.items.find((item) => item.id === bounty.item)?.name ?? bounty.item;
    const steps = bounty.steps.map((step, place): AthericStep => {
      const done = state.finished || place < state.step;
      const now = !done && place === state.step;
      const count = done ? step.count : now ? Math.min(state.count, step.count) : 0;
      return { words: step.words, count, target: step.count, state: done ? 'done' : now ? 'under way' : 'to come' };
    });
    return [{ id: bounty.id, name, find: bounty.find, words: bounty.words, finished: state.finished, steps }];
  });
}

/** The card as the Journal draws it: the Atheric's name in its rarity's colour, the find and its words, each step a
 *  line, the one under way with its gauge and count. */
export function athericCardNode(card: AthericCard, size = 1): Node {
  const stepNode = (step: AthericStep, place: number): Node => ({
    width: 'grow',
    direction: 'column',
    gap: 4,
    opacity: step.state === 'to come' ? 0.55 : 1,
    children: [
      {
        width: 'grow',
        gap: 6,
        children: [
          step.state === 'done' && iconNode('taken', 16),
          {
            width: 'grow',
            text: { words: `${place + 1}. ${step.words}`, size, colour: step.state === 'done' ? INK.faint : INK.word },
          },
        ],
      },
      step.state === 'under way' &&
        step.target > 1 && {
          width: 'grow',
          gap: 8,
          alignY: 'center',
          children: [
            gauge(step.count, step.target, 6, INK.brassLit),
            words(`${step.count}/${step.target}`, size, INK.word),
          ],
        },
    ],
  });
  return {
    id: `atheric-${card.id}`,
    role: 'panel',
    width: 'grow',
    direction: 'column',
    gap: 6,
    padding: [12, 14, 14, 14],
    children: [
      words(card.name.toUpperCase(), size, ATHERIC.colour, { tracking: 1, ellipsis: true }),
      words('ATHERIC BOUNTY', size, INK.faint, { tracking: 3 }),
      { width: 'grow', text: { words: `${card.find}. ${card.words}`, size, colour: INK.word } },
      ...card.steps.map(stepNode),
      card.finished && {
        width: 'grow',
        text: { words: `Finished: ${card.name} is yours.`, size, colour: INK.brassLit },
      },
    ],
  };
}
