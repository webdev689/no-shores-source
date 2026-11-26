// A quest as an item a keeper offers, after Destiny 2's vendor screen: its card (a band in its rarity's colour with its
// name and kind, its words in italics, its objectives each a box ticked as it is met, a rule, the keeper's note in
// italics and Acquire at its foot), its tile framed in gold, and its story (its name over a rule, the keeper's longer
// words, and how to follow it). The keeper's screen shows them while they offer it; the Journal shows the card too.
import cast from '../../../../content/story/cast.json' with { type: 'json' };
import houses from '../../../../content/story/houses.json' with { type: 'json' };
import { emblemOf } from '../../plus/emblemArt.ts';
import { RARITIES } from '../../player/gear.ts';
import { castOf, scenesOf } from '../../speech/cast.ts';
import type { Child, Node, Size } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import { FOCUS, INK, emblemNode, over, svgNode, words } from '../gearNodes.ts';
import { keeperMarkSvg } from '../npc/npcMarks.ts';
import type { Step } from '../tasks.ts';
import type { QuestState } from '../../network/questMessages.ts';
import { nameOf } from '../npc/npcLines.ts';
import { keeperOf } from '../keepers.ts';
import { type Offer, QUESTS, type QuestLine, trackedOf } from './questBook.ts';
import factions from '../../../../content/gear/factions.json' with { type: 'json' };

/** The keepers' longer words, by scene, checked against the cast as every scene is. */
const SCENES = scenesOf(houses, castOf(cast));
/** The card's words in italics, a step lighter than the faint words so they read on its dark ground. */
const SAID = '#d9d2bf';
/** The card's ground, under its band: the reference's dark olive, as the menu's stone would wear it. */
const GROUND = '#1b1912';
/** An objective's box, its edge and its tick. */
const BOX_EDGE = '#d6cfbb';

/** A quest offered, as a card shows it: the quest and its offer, its objectives as the tracker has them, whether it is
 *  acquired, and who offers it, by the name they are shown under. */
export interface Offered {
  readonly quest: QuestLine;
  readonly offer: Offer;
  readonly steps: readonly Step[];
  readonly acquired: boolean;
  readonly keeper: string;
  /** What its foot says once it is acquired: "Acquired" unless said ("Done" in the Journal for a quest done). */
  readonly said?: string;
}

/** A keeper's name as it is written mid-line: "the Weaponsmith", "Arlo Kestrel". */
export const midLine = (name: string): string => name.replace(/^The /, 'the ');

/** The scene of the keeper's longer words as lines; none for a scene the story lacks. */
export const storyLines = (offer: Offer): readonly string[] => (SCENES[offer.story] ?? []).map((line) => line.say);

/** How the story ends: how to follow the quest's steps once it is acquired. */
export const FOLLOW = 'Follow its steps in the tracker, and in the Journal, to see it through.';

/** An objective's box, `size` pixels a side: empty, or filled in `lit` once met. The tracker's steps wear it too. */
export function objectiveBox(met: boolean, size: number, lit: string): Node {
  return {
    width: size,
    height: size,
    outline: { width: 2, colour: BOX_EDGE },
    padding: Math.max(2, Math.round(size / 5)),
    children: [met && { width: 'grow', height: 'grow', fill: lit }],
  };
}

/** A mouse with its left button lit, the reference's mark for a click, in pixels 8 by 11. */
const MOUSE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 11" shape-rendering="crispEdges">' +
  '<path fill="#efe8d6" d="M1 1h6v1H1zM0 2h1v7H0zM7 2h1v7H7zM1 9h6v1H1zM1 5h6v1H1zM4 2h1v3H4z"/>' +
  '<path fill="#f3cf86" d="M1 2h3v3H1z"/></svg>';

/** Each objective of the card: its box, its words, and what is left of its count while it is not met. */
function objectivesNode(steps: readonly Step[], text: number, lit: string): Node {
  const size = text > 1 ? 22 : 16;
  return {
    width: 'grow',
    direction: 'column',
    gap: text > 1 ? 10 : 7,
    children: steps.map((step): Node => ({
      width: 'grow',
      gap: 12,
      alignY: 'center',
      label: `${step.text}: ${step.done ? 'done' : 'not yet'}`,
      children: [
        objectiveBox(step.done === true, size, lit),
        { width: 'grow', text: { words: step.text, size: text, colour: step.done ? INK.faint : INK.word } },
        !step.done && step.count !== undefined && words(`${step.count}`, text, INK.faint),
      ],
    })),
  };
}

/** The card of a quest offered, `width` pixels wide with its words at `text`: Acquire (press `press`) at its foot
 *  while it waits, "Acquired" once it is. */
export function questCardNode(
  offered: Offered,
  width: Size,
  text: number,
  press = 'npc-acquire',
  ui: Interface | null = null,
): Node {
  const { quest, offer, steps, acquired, keeper, said = 'Acquired' } = offered;
  // Acquire lit under the pointer or the keys' focus, and ringed by the keys', as the screen's other presses are.
  const ringed = ui !== null && ui.focused(press) && ui.keyFocused;
  const lit = ringed || (ui?.hovered(press) ?? false);
  const rarity = RARITIES[offer.rarity] ?? RARITIES[0];
  // The band in the rarity's colour, dulled toward the ground so the name in white reads on it.
  const band = over(rarity.rgb, 0.62, '#241f12');
  const pad = text > 1 ? 18 : 14;
  return {
    width,
    direction: 'column',
    outline: { width: 1, colour: rarity.shade },
    label: `${quest.name}, ${offer.kind}, ${rarity.name}`,
    children: [
      {
        width: 'grow',
        fill: band,
        direction: 'column',
        gap: 2,
        padding: [pad - 4, pad, pad - 6, pad],
        children: [
          {
            width: 'grow',
            text: {
              words: [{ words: quest.name.toUpperCase(), style: 'bold' }],
              size: text + 1,
              colour: INK.word,
              edge: 'shadow',
              edgeColour: rarity.shade,
            },
          },
          {
            width: 'grow',
            gap: 12,
            children: [
              { width: 'grow', text: { words: offer.kind, size: text, colour: rarity.lit, wrap: false } },
              words(rarity.name, text, 'rgba(239,232,214,0.42)'),
            ],
          },
        ],
      },
      {
        width: 'grow',
        fill: over(rarity.rgb, 0.1, GROUND),
        direction: 'column',
        gap: text > 1 ? 14 : 10,
        padding: [pad - 2, pad, pad - 4, pad],
        children: [
          { width: 'grow', text: { words: [{ words: offer.words, style: 'italic' }], size: text, colour: SAID } },
          objectivesNode(steps, text, rarity.colour),
          { width: 'grow', height: 1, fill: 'rgba(239,232,214,0.22)' },
          {
            width: 'grow',
            text: {
              words: [{ words: `"${offer.quote}" A note from ${midLine(keeper)}`, style: 'italic' }],
              size: text,
              colour: INK.faint,
            },
          },
          {
            width: 'grow',
            alignX: 'end',
            children: [
              acquired
                ? words(said, text, INK.faint)
                : {
                    id: press,
                    press: true,
                    label: `Acquire ${quest.name}`,
                    ...(lit && { fill: 'rgba(239,232,214,0.1)' }),
                    ...(ringed && { outline: { width: 2, colour: FOCUS } }),
                    padding: [4, 8],
                    gap: 8,
                    alignY: 'center',
                    children: [
                      svgNode('mouse click', MOUSE_SVG, text > 1 ? 16 : 8, text > 1 ? 22 : 11),
                      words('Acquire', text),
                    ],
                  },
            ],
          },
        ],
      },
    ],
  };
}

/** The quest's tile, `size` pixels a side, framed in gold: a house's road shows its house's emblem, any other quest
 *  the mark of the keeper who offers it. */
export function questTileNode(quest: QuestLine, offer: Offer, size: number): Node {
  const house = factions.factions.find((faction) => faction.id === quest.faction);
  const inner = size - 14;
  const picture: Child = house
    ? emblemNode(emblemOf(house.emblem), 'sign', 24, inner, inner)
    : svgNode(`keeper mark ${offer.keeper}`, keeperMarkSvg(offer.keeper), inner);
  const rarity = RARITIES[offer.rarity] ?? RARITIES[0];
  return {
    width: size,
    height: size,
    fill: over(rarity.rgb, 0.28, '#1a160e'),
    outline: { width: 3, colour: INK.brassLit },
    alignX: 'center',
    alignY: 'center',
    children: [picture],
  };
}

/** The quest's story beside its tile, `width` pixels wide: its name in capitals over a rule, the keeper's longer words
 *  in italics, and how to follow its steps. */
export function questStoryNode(quest: QuestLine, offer: Offer, width: number, text: number): Node {
  return {
    width,
    direction: 'column',
    gap: text > 1 ? 14 : 10,
    children: [
      {
        direction: 'column',
        gap: 6,
        children: [
          { width: 'grow', text: { words: quest.name.toUpperCase(), size: text + 1, colour: INK.word, tracking: 2 } },
          { width: Math.min(width, 520), height: 1, fill: 'rgba(239,232,214,0.45)' },
        ],
      },
      ...storyLines(offer).map((line): Node => ({
        width: 'grow',
        text: { words: [{ words: line, style: 'italic' }], size: text, colour: SAID },
      })),
      { width: 'grow', text: { words: [{ words: FOLLOW, style: 'italic' }], size: text, colour: INK.faint } },
    ],
  };
}

/** A quest as the Journal's card shows it in its hover card, as its keeper offered it: the quest walked with its
 *  task's objectives ticked as met, one done with its last task's all ticked; none for a quest no keeper offers or
 *  one neither walked nor done. */
export function bookCard(id: string, state: QuestState): Offered | null {
  const place = QUESTS.findIndex((quest) => quest.id === id);
  const quest = QUESTS[place];
  const offer = quest?.offer;
  if (!quest || !offer) return null;
  const keeper = nameOf(keeperOf(offer.keeper)?.speaker ?? '');
  if (state.done[place] === 1) {
    const steps = (quest.tasks.at(-1)?.goals ?? []).map((goal) => ({ text: goal.text, done: true }));
    return { quest, offer, steps, acquired: true, keeper, said: 'Done' };
  }
  if (state.quest !== place + 1) return null;
  const steps = trackedOf({ ...state, offered: 0 })?.steps ?? [];
  // The Journal acquires nothing: one waiting says where it is acquired.
  const said = state.offered ? `Acquire it from ${midLine(keeper)}` : 'Acquired';
  return { quest, offer, steps, acquired: true, keeper, said };
}
