// The Harbourmaster's register: a ship kept is named from two lists of words, its first word none or one of the
// first list's and its second one of the second's, as the shipyard keeps them (content/gear/shipyard.json). The words
// chosen wait on the page until the name is asked for: free the first time a ship is named, at the yard's price after.
import type { Node } from '../../ui/node.ts';
import { INK, pressNode, words } from '../gearNodes.ts';
import { fillNode } from '../gearHold.ts';
import type { MenuContext } from '../menuPage.ts';
import { headingNode } from '../menuPages.ts';
import { shipChips } from './dressPart.ts';
import { NO_WORD, SHIPYARD, calledOf, nameAsk, namingPrice } from './harbourModel.ts';

/** The words chosen for a ship's name, waiting until it is asked for: its hull, and each word's place. */
export interface NameDraft {
  hull: number;
  first: number;
  second: number;
}

/** A new draft for the ship of `hull`, from its name as kept, or the lists' first words for one unnamed. */
export function draftFor(context: MenuContext, hull: number): NameDraft {
  const kept = context.gear.ship?.fleet.find((ship) => ship.hull === hull);
  const [first = NO_WORD, second = NO_WORD] = kept?.name ?? [];
  return { hull, first, second: second === NO_WORD ? 0 : second };
}

/** A row of word chips, the one chosen lit; a click chooses another. `none` heads it with a chip for no word. */
function wordRow(
  context: MenuContext,
  prefix: string,
  list: readonly string[],
  chosen: number,
  choose: (place: number) => void,
  none: boolean,
): Node {
  const size = context.sizes.label;
  const chips = [...(none ? [[NO_WORD, 'None'] as const] : []), ...list.map((word, place) => [place, word] as const)];
  return {
    width: 'grow',
    wrap: true,
    gap: 6,
    children: chips.map(([place, word]): Node => {
      const id = `${prefix}-${place}`;
      if (context.ui.clicked(id)) choose(place);
      const lit = place === chosen;
      return {
        id,
        press: true,
        role: 'chip',
        label: lit ? `${word}, chosen` : word,
        padding: [6, 10],
        ...(lit && { outline: { width: 2, colour: INK.brassLit } }),
        children: [words(word, size, lit ? INK.brassLit : INK.word)],
      };
    }),
  };
}

/** The name the draft spells, "the Grey Gull". */
function spelled(draft: NameDraft): string {
  return calledOf({ name: [draft.first, draft.second] }) ?? 'unnamed';
}

/** The register for the draft's ship, chosen among the ships kept by `choose`. */
export function namePart(context: MenuContext, draft: NameDraft, choose: (hull: number) => void): Node {
  const { ui, holds } = context;
  const size = context.sizes.label;
  const kept = context.gear.ship?.fleet.find((ship) => ship.hull === draft.hull);
  const price = namingPrice(kept);
  const named = calledOf(kept);
  const asked = nameAsk(draft.hull, draft.first, draft.second);
  const same = named === spelled(draft);
  const short = context.gear.aurem < price;
  const id = 'name-ship';
  let press: Node;
  if (price === 0) {
    if (!same && ui.clicked(id)) context.ask(asked);
    press = pressNode(id, `Name it ${spelled(draft)}`, 'primary', '', size, {
      ...(same && { state: 'disabled' as const }),
    });
  } else {
    const charged = same || short ? 0 : holds.press(ui, id, () => context.ask(asked));
    press = {
      id,
      press: true,
      role: 'primary',
      ...((same || short) && { state: 'disabled' as const }),
      label: `Hold to name it ${spelled(draft)} for ${price.toLocaleString('en')} Aurem`,
      padding: [9, 16],
      children: [
        words(`Hold to rename, ${price.toLocaleString('en')} Aurem`, size, short ? INK.loss : INK.word),
        fillNode(charged),
      ],
    };
  }
  return {
    width: 'grow',
    direction: 'column',
    gap: 12,
    padding: [0, 18, 14, 18],
    children: [
      shipChips(context, draft.hull, choose, 'name'),
      ...(!kept
        ? [words('Keep a ship first: the register holds only ships of yours.', size, INK.faint)]
        : [
            {
              role: 'panel',
              width: 'grow',
              direction: 'column',
              gap: 10,
              padding: [14, 18],
              children: [
                headingNode('The register', words(named ? `Named ${named}` : 'Unnamed', size, INK.faint), size),
                words('First word', size, INK.faint),
                wordRow(context, 'first', SHIPYARD.first, draft.first, (place) => (draft.first = place), true),
                words('Second word', size, INK.faint),
                wordRow(context, 'second', SHIPYARD.second, draft.second, (place) => (draft.second = place), false),
                {
                  width: 'grow',
                  gap: 12,
                  alignY: 'center',
                  children: [
                    {
                      width: 'grow',
                      children: [
                        words(price === 0 ? 'Its first name is free.' : 'A new name is paid for.', size, INK.faint),
                      ],
                    },
                    press,
                  ],
                },
              ],
            } satisfies Node,
          ]),
    ],
  };
}
