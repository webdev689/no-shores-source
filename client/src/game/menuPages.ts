// The menu's pages that need no gear, drawn by the game: Journal and Guild, still to come and saying so; the Ship, the
// Sloop's details as Manage shows them; and Settings, which keeps the account and the volumes of the interface and the
// world. And the parts they share with the Roster: a heading over its rule, a faint hint and an answer.

import type { Child, Node } from '../ui/node.ts';
import { PAGE, type Page } from '../ui/page.ts';
import { slider } from '../ui/controls.ts';
import type { AccountPanel } from './accountTab.ts';
import { drawings, ruleUnder, strip } from './hudParts.ts';
import { INK, type Sizes, words } from './gearNodes.ts';
import type { PlainContext } from './menuPage.ts';
import type { ShipPanel } from './shipPanel.ts';
import { soundCredits } from '../soundSamples.ts';
import {
  ambienceVolume,
  interfaceVolume,
  musicVolume,
  play,
  setAmbienceVolume,
  setInterfaceVolume,
  setMusicVolume,
  setWorldVolume,
  worldVolume,
} from './uiSounds.ts';

/** A press's padding on these pages: its words' line and the room round them, as the kit's presses stand. */
export const PRESS_PADDING = [10, 14] as const;

/** A rule as the kit lays one under a part: a dark line, the groove's light under it. */
export const RULE: Node = {
  width: 'grow',
  height: 2,
  draw: drawings(strip(0, 1, 'rgba(5,6,8,0.6)'), strip(1, 1, 'rgba(163,152,128,0.13)')),
};

/** A part's heading: its name in faint capitals spaced wide over a rule, and anything beside it at the right. */
export function headingNode(said: string, beside: Child = null): Node {
  return {
    width: 'grow',
    direction: 'column',
    children: [
      {
        width: 'grow',
        padding: [0, 0, 4, 0],
        alignY: 'center',
        draw: ruleUnder(),
        children: [{ width: 'grow', ...words(said.toUpperCase(), 1, INK.faint, { tracking: 3 }) }, beside],
      },
      { width: 'grow', height: 1, fill: 'rgba(163,152,128,0.13)' },
    ],
  };
}

/** The menu's chip saying a part is still to come. */
export const laterChip = (): Node => ({
  role: 'chip',
  padding: [1, 8],
  children: [words('LATER', 1, INK.word, { tracking: 3 })],
});

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
export function pagePanel(id: string, most: number, children: readonly Child[]): Node {
  return {
    width: 'grow',
    alignX: 'center',
    padding: [24, 0],
    children: [{ id, role: 'panel', width: 'grow', maxWidth: most, direction: 'column', padding: [18, 22], children }],
  };
}

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

/** The Ship page: her name, then each part of her papers, those still to come marked Later. */
export function shipPage(panel: ShipPanel | null, sizes: Sizes): Node {
  if (!panel)
    return pagePanel('page-ship', 640, [
      {
        width: 'grow',
        alignX: 'center',
        padding: [48, 0],
        children: [{ text: { words: 'Loading your ship…', size: sizes.name, colour: INK.faint } }],
      },
    ]);
  return pagePanel('page-ship', 640, [
    { padding: [0, 0, 10, 0], children: [words(panel.title, 2, INK.word)] },
    ...panel.parts.map((part, index): Node => ({
      width: 'grow',
      direction: 'column',
      padding: [index === 0 ? 4 : 18, 0, 0, 0],
      gap: 6,
      children: [
        headingNode(part.heading, part.later && laterChip()),
        {
          width: 'grow',
          direction: 'column',
          children: part.rows.map(([label, value]): Node => ({
            width: 'grow',
            padding: [3, 0],
            children: [{ width: 'grow', ...words(label, 1, INK.faint) }, words(value, 1, INK.word)],
          })),
        },
      ],
    })),
  ]);
}

/** The Settings page: the account, or why there is none, the players blocked, and the volumes. */
export function settingsPage(context: PlainContext, account: AccountPanel | null, page: Page = PAGE): Node {
  return pagePanel('page-settings', context.sizes.name > 1 ? 880 : 640, [
    headingNode('Account'),
    { height: 10 },
    ...(account ? account.nodes(context) : [hintNode('Playing offline: there is no account.')]),
    soundPanel(context, page),
  ]);
}

/** The volumes of the interface, the world, the music and the ambience, each from silent to full, kept in this
 *  browser. */
function soundPanel(context: PlainContext, page: Page): Node {
  return {
    width: 'grow',
    direction: 'column',
    padding: [18, 0, 0, 0],
    gap: 6,
    children: [
      headingNode('Sound'),
      { height: 4 },
      volumeRow(context, 'Interface sounds', interfaceVolume, setInterfaceVolume),
      volumeRow(context, 'World sounds', worldVolume, setWorldVolume),
      volumeRow(context, 'Music', musicVolume, setMusicVolume),
      volumeRow(context, 'Ambience', ambienceVolume, setAmbienceVolume),
      creditsList(context, page),
    ],
  };
}

/** One volume's slider, its level said beside it; let go, the interface's press is heard at its new level. */
function volumeRow(
  { ui }: PlainContext,
  name: string,
  volume: () => number,
  setVolume: (volume: number) => void,
): Node {
  const id = `volume-${name.split(' ')[0]?.toLowerCase() ?? name}`;
  const before = Math.round(volume() * 100);
  const { node, value } = slider(ui, id, before, { low: 0, high: 100, step: 5, width: 260 });
  if (value !== before) setVolume(value / 100);
  // Let go of, or stepped by a key, the slider says its level in the interface's own press.
  const dropped = ui.drag(id) !== null && !ui.pressing(id);
  if (dropped || ui.keysOn(id).length > 0) play('press');
  return {
    width: 'grow',
    gap: 14,
    alignY: 'center',
    children: [
      { minWidth: 99, ...words(name, 1, INK.word) },
      { ...node, label: `${name}, ${value}%` },
      { minWidth: 36, alignX: 'end', children: [words(`${value}%`, 1, INK.word)] },
    ],
  };
}

/** A link in the credits: brass words that open their page in a new tab. */
function linkNode({ ui }: PlainContext, id: string, said: string, url: string, page: Page): Node {
  if (ui.clicked(id)) page.open(url);
  return {
    id,
    press: true,
    label: `${said}, opens in a new tab`,
    direction: 'column',
    children: [
      words(said, 1, ui.hovered(id) || ui.focused(id) ? INK.word : INK.brassLit),
      { width: 'grow', height: 1, fill: ui.hovered(id) || ui.focused(id) ? INK.word : INK.brassLit },
    ],
  };
}

/** Faint words a word at a time, each with its space, so a line of them and links wraps where it must. */
const plain = (said: string): Node[] => said.split(/(?<= )/).map((word) => words(word, 1, INK.faint));

/** The recorded sounds' credits: each sound's name and author, its licence and its source, and what was changed. */
function creditsList(context: PlainContext, page: Page): Node {
  return {
    width: 'grow',
    direction: 'column',
    padding: [12, 0, 0, 0],
    gap: 4,
    label: 'Sound credits',
    children: [
      hintNode('Sound credits'),
      hintNode("Each plays at the game's own level."),
      ...soundCredits().map((credit, index): Node => {
        // Its licence by its full name and version, as the licence's own page gives it: CC BY 4.0, CC0 1.0.
        const version = /(\d\.\d)\/$/.exec(credit.licenceUrl)?.[1] ?? '';
        const licence = `${credit.licence.replace('-', ' ')} ${version}`.trim();
        // The bullet stands apart, so the lines its words wrap onto start under them, as a list's do.
        return {
          width: 'grow',
          padding: [0, 0, 0, 8],
          children: [
            { width: 10, children: [words('•', 1, INK.faint)] },
            {
              width: 'grow',
              wrap: true,
              alignY: 'end',
              children: [
                ...plain(`"${credit.name}" by ${credit.author}, `),
                linkNode(context, `credit-${index}-licence`, licence, credit.licenceUrl, page),
                ...plain(', from '),
                linkNode(context, `credit-${index}-source`, 'Freesound', credit.page, page),
                ...plain(`. ${credit.changes}`),
              ],
            },
          ],
        };
      }),
    ],
  };
}
