// The held map's card, laid over the parchment by the game while the map is up: where the course is set for, the seas
// to sail it in (a tier the player's level shuts resting, the first reason under the card), and the press to sail.
import { TONES } from '../plus/tones.ts';
import { button } from '../ui/controls.ts';
import type { Drawing, Node } from '../ui/node.ts';
import { colourOf } from '../ui/quads.ts';
import type { Interface } from '../ui/ui.ts';
import type { Difficulty } from './heldMap.ts';
import { seasChoices } from './heldMapLaw.ts';

const DIFFICULTY_WORDS: readonly (readonly [Difficulty, string, string])[] = [
  ['normal', 'Normal', 'The island’s foes as they are.'],
  ['elite', 'Elite', 'Foes two levels higher; half again the XP, Aurem and Vestiges.'],
  ['abyss', 'Abyss', 'Foes three levels higher; twice the XP, Aurem and Vestiges.'],
];

/** The card's ground and its gold edge. */
const cardGround: Drawing = (renderer, box, scale, clip, fade) => {
  const tone = (css: string) => {
    const [red, green, blue, alpha] = colourOf(css);
    return [red, green, blue, alpha * fade] as const;
  };
  const { x, y, width, height } = box;
  renderer.quads.add(box, tone('rgba(10, 13, 17, 0.72)'), clip);
  const gold = tone('#f3cf6a');
  for (const edge of [
    { x, y, width, height: scale },
    { x, y: y + height - scale, width, height: scale },
    { x, y, width: scale, height },
    { x: x + width - scale, y, width: scale, height },
  ])
    renderer.quads.add(edge, gold, clip);
};

/** What the card shows: its words, whether the course can be sailed, the seas picked and why each is shut (by tier,
 *  null where open), how far up the map stands, where the card's foot stands on the screen, and the sail's words. */
export interface HeldCard {
  readonly words: string;
  readonly ok: boolean;
  readonly picked: Difficulty;
  readonly shut: readonly (string | null)[];
  readonly lift: number;
  readonly at: readonly [number, number];
  readonly sail: string;
}

/** The card: its words, the seas (`pick` choosing one; a shut one resting, its reason its label), the press to
 *  `sail`, and under them the first reason a tier is shut. */
export function heldCardNode(ui: Interface, card: HeldCard, pick: (seas: Difficulty) => void, sail: () => void): Node {
  const said = (text: string): Node => ({ text: { words: text, colour: TONES.ink, wrap: false }, through: true });
  const why = card.ok ? seasChoices(card.picked, card.shut).why : null;
  return {
    id: 'held-card',
    direction: 'column',
    gap: 6,
    padding: [8, 14],
    opacity: card.lift,
    // Drawn, not filled, so only its presses take the pointer and a click beside them reaches the map.
    draw: cardGround,
    float: { to: 'screen', anchor: [0.5, 1], x: Math.round(card.at[0]), y: Math.round(card.at[1]) },
    children: [
      {
        alignY: 'center',
        gap: 14,
        children: [
          said(card.words),
          card.ok && {
            gap: 0,
            alignY: 'center',
            children: [
              { ...said('Seas'), padding: [0, 8, 0, 0] },
              ...DIFFICULTY_WORDS.map(([difficulty, label, told], tier) => {
                const reason = card.shut[tier] ?? null;
                return button(ui, `held-seas:${difficulty}`, label, () => pick(difficulty), {
                  role: difficulty === card.picked ? 'primary' : 'button',
                  padding: [7, 14],
                  label: reason ?? `${label}: ${told}`,
                  disabled: reason !== null,
                });
              }),
            ],
          },
          card.ok && button(ui, 'held-sail', card.sail, sail, { role: 'primary', padding: [7, 14] }),
        ],
      },
      why !== null && { maxWidth: 520, text: { words: why, colour: TONES.ink }, through: true },
    ],
  };
}

/** On foot, the card for a landing zone picked on the land's map: its words and the press to fast travel there. */
export function travelCardNode(
  ui: Interface,
  card: Pick<HeldCard, 'words' | 'lift' | 'at' | 'sail'>,
  travel: () => void,
): Node {
  return {
    id: 'held-travel-card',
    gap: 14,
    alignY: 'center',
    padding: [8, 14],
    opacity: card.lift,
    draw: cardGround,
    float: { to: 'screen', anchor: [0.5, 1], x: Math.round(card.at[0]), y: Math.round(card.at[1]) },
    children: [
      { text: { words: card.words, colour: TONES.ink, wrap: false }, through: true },
      button(ui, 'held-travel', card.sail, travel, { role: 'primary', padding: [7, 14] }),
    ],
  };
}
