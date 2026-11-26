// The Test Room, a developer's screen in the character screen's own frame: the test character summarised (its level,
// Prestige, max gear, and the test runs' rules), and the six banners of what the Playlist offers, each with Launch, and
// Back to the characters.
import type { Child, Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import { PRESTIGE_INK } from '../characterPage.ts';
import { INK, type Hint, focusRing, hintsNode, words } from '../gearNodes.ts';
import { CHARACTERS_Z, VIGNETTE, fitOf } from './characterNodes.ts';
import { TEST_CHARACTER, TEST_RULES, type TestEntry } from './testRuns.ts';

export const TEST_ROOM_SCREEN = 'test-room';
export const TEST_BACK = 'test-room-back';
export const launchId = (index: number): string => `test-room-launch-${index}`;

/** What the Test Room shows this frame: its entries once the rules are read (null until then), what is under way,
 *  why a Launch was refused, the keys, and the screen's fade in. */
export interface TestRoomShown {
  readonly entries: readonly TestEntry[] | null;
  readonly busy: string | null;
  readonly said: string | null;
  readonly hints: readonly Hint[];
  readonly shown: number;
}

const SHADOW = { edge: 'shadow' as const, edgeColour: '#000' };

/** The test character, as every test room makes it. */
function characterNode(large: boolean): Node {
  const size = large ? 2 : 1;
  return {
    width: 'grow',
    role: 'well',
    direction: 'column',
    gap: 8,
    padding: [14, 20],
    label: `The test character: level ${TEST_CHARACTER.level}, Prestige ${TEST_CHARACTER.prestige}, in max gear. ${TEST_RULES}.`,
    children: [
      words('THE TEST CHARACTER', 1, INK.faint, { tracking: 3 }),
      {
        gap: 18,
        alignY: 'end',
        wrap: true,
        children: [
          words(`Level ${TEST_CHARACTER.level}`, size + 2, INK.brassLit, SHADOW),
          words(`Prestige ${TEST_CHARACTER.prestige}`, size + 1, PRESTIGE_INK, SHADOW),
          words('Max gear', size + 1, INK.word, SHADOW),
        ],
      },
      { width: 'grow', text: { words: TEST_RULES, size, colour: INK.word, ...SHADOW } },
    ],
  };
}

/** One entry's banner: its name and its line, and Launch at its right. */
function entryNode(ui: Interface, entry: TestEntry, index: number, large: boolean): Node {
  const id = launchId(index);
  const keyed = ui.focused(id) && ui.keyFocused;
  const box = ui.boxOf(id);
  return {
    width: 'grow',
    role: 'panel',
    gap: 14,
    alignY: 'center',
    padding: large ? [12, 18] : [8, 14],
    outline: ui.hovered(id) ? { width: 2, colour: INK.brass } : undefined,
    children: [
      {
        width: 'grow',
        direction: 'column',
        gap: 3,
        children: [
          words(entry.name, large ? 2 : 1, INK.word, SHADOW),
          { width: 'grow', text: { words: entry.about, colour: INK.faint, ...SHADOW } },
        ],
      },
      {
        id,
        press: true,
        role: 'primary',
        label: `Launch ${entry.name}`,
        padding: large ? [12, 24] : [8, 18],
        children: [
          words('LAUNCH', large ? 2 : 1, INK.brassLit, { tracking: 3 }),
          keyed && box && focusRing(box.width, box.height),
        ],
      },
    ],
  };
}

/** The Test Room this frame. */
export function testRoomNode(ui: Interface, shown: TestRoomShown): Child {
  const view = ui.size;
  const fit = fitOf(view);
  const width = Math.min(fit.large ? 980 : 760, view.width - (fit.narrow ? 20 : 80));
  return {
    id: TEST_ROOM_SCREEN,
    label: 'Test Room',
    width: view.width,
    height: view.height,
    solid: true,
    modal: true,
    picture: VIGNETTE,
    alignX: 'center',
    float: { to: 'screen', z: CHARACTERS_Z },
    opacity: shown.shown,
    direction: 'column',
    children: [
      {
        width,
        height: 'grow',
        direction: 'column',
        gap: fit.short ? 8 : 12,
        padding: [fit.narrow ? 10 : 18, 0],
        scroll: true,
        children: [
          {
            width: 'grow',
            alignY: 'center',
            gap: 12,
            children: [
              words('TEST ROOM', 2, INK.brassLit, { ...SHADOW, tracking: 4 }),
              { width: 'grow' },
              {
                id: TEST_BACK,
                press: true,
                role: 'button',
                label: 'Back to the characters',
                padding: [8, 16],
                children: [words('BACK', 1, INK.word, { tracking: 3 })],
              },
            ],
          },
          characterNode(fit.large),
          shown.busy !== null && words(shown.busy, 1, INK.faint, SHADOW),
          shown.said !== null && {
            width: 'grow',
            text: { words: shown.said, colour: INK.loss, ...SHADOW },
            label: shown.said,
          },
          ...(shown.entries === null
            ? [words('Reading the rules...', 1, INK.faint, SHADOW)]
            : shown.entries.map((entry, index) => entryNode(ui, entry, index, fit.large))),
        ],
      },
      { width, padding: [10, 0], children: [hintsNode(shown.hints, fit.large ? 2 : 1)] },
    ],
  };
}
