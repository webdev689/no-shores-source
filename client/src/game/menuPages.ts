// The menu's pages that need no gear, drawn by the game: Guild, still to come and saying so, and the Sloop's papers as
// Manage shows them (`shipPages.ts` puts its power and crew beside them). And the parts they share with the Roster and
// Settings (`settingsPage.ts`): a heading over its rule, a faint hint and an answer.

import type { Child, Node } from '../ui/node.ts';
import { drawings, ruleUnder, strip } from './hudParts.ts';
import { INK, type Sizes, words } from './gearNodes.ts';
import type { ShipPanel } from './shipPanel.ts';

/** A press's padding on these pages: its words' line and the room round them, as the kit's presses stand. */
export const PRESS_PADDING = [10, 14] as const;

/** A rule as the kit lays one under a part: a dark line, the groove's light under it. */
export const RULE: Node = {
  width: 'grow',
  height: 2,
  draw: drawings(strip(0, 1, 'rgba(5,6,8,0.6)'), strip(1, 1, 'rgba(163,152,128,0.13)')),
};

/** A part's heading: its name in faint capitals spaced wide over a rule, at `size`, and anything beside it at the
 *  right. */
export function headingNode(said: string, beside: Child = null, size = 1): Node {
  return {
    width: 'grow',
    direction: 'column',
    children: [
      {
        width: 'grow',
        padding: [0, 0, 4, 0],
        alignY: 'center',
        draw: ruleUnder(),
        children: [{ width: 'grow', ...words(said.toUpperCase(), size, INK.faint, { tracking: 3 }) }, beside],
      },
      { width: 'grow', height: 1, fill: 'rgba(163,152,128,0.13)' },
    ],
  };
}

/** Faint words, wrapped to the room. */
export const hintNode = (said: string, more: Partial<Node> = {}): Node => ({
  maxWidth: 880,
  ...more,
  text: { words: said, colour: INK.faint },
});

/** Words as a paragraph stands them, an 11 px margin over and under. */
export const paragraph = (node: Node): Node => ({ width: 'grow', padding: [11, 0], children: [node] });

/** What an ask was answered, in the answer's brass; nothing while there is none. */
export const answerNode = (said: string): Node | null =>
  said ? { width: 'grow', text: { words: said, colour: INK.answer } } : null;

/** A page's panel, set back from the window's edges and kept to `most` pixels wide, in the middle of the room. */
function pagePanel(id: string, most: number, children: readonly Child[]): Node {
  return {
    width: 'grow',
    alignX: 'center',
    padding: [24, 0],
    children: [{ id, ...panelOf(children), maxWidth: most }],
  };
}

/** The panel a page's parts stand in: its 2 px frame, then 18 by 22 px of room round them. */
const panelOf = (children: readonly Child[]): Node => ({
  role: 'panel',
  width: 'grow',
  direction: 'column',
  padding: [20, 24],
  children,
});

/** A page still to come: its name, marked Later, and one line on what it will hold. */
export function laterPage(name: string, said: string): Node {
  return pagePanel('page-later', 640, [
    {
      gap: 12,
      alignY: 'center',
      padding: [0, 0, 10, 0],
      children: [words(name, 2, INK.word), { role: 'chip', padding: [1, 8], children: [words('Later', 1, INK.word)] }],
    },
    hintNode(said),
  ]);
}

/** Its papers: its name, then each part of them, then `more` (its materials and hands, on the ship's tab). On the
 *  tab (`bare`) they fill the column they stand in; alone they stand as the other plain pages do. */
export function shipPage(panel: ShipPanel | null, sizes: Sizes, more: readonly Child[] = [], bare = false): Node {
  const parts: readonly Child[] = !panel
    ? [
        {
          width: 'grow',
          alignX: 'center',
          padding: [48, 0],
          children: [{ text: { words: 'Loading your ship…', size: sizes.name, colour: INK.faint } }],
        },
        ...more,
      ]
    : [
        { padding: [0, 0, 10, 0], children: [words(panel.title, 2, INK.word)] },
        ...panel.parts.map((part, index) => shipPart(part.heading, part.rows, index === 0)),
        ...more,
      ];
  return bare ? { id: 'page-ship', ...panelOf(parts) } : pagePanel('page-ship', 640, parts);
}

/** One part of the papers: its heading over its rule, then its rows, label and value. */
export function shipPart(heading: string, rows: readonly (readonly [string, string])[], first = false): Node {
  return {
    width: 'grow',
    direction: 'column',
    padding: [first ? 4 : 18, 0, 0, 0],
    gap: 6,
    children: [
      headingNode(heading),
      {
        width: 'grow',
        direction: 'column',
        children: rows.map(([label, value]): Node => ({
          width: 'grow',
          padding: [3, 0],
          children: [{ width: 'grow', ...words(label, 1, INK.faint) }, words(value, 1, INK.word)],
        })),
      },
    ],
  };
}
