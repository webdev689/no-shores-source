// The launcher as the game draws it, in the menus' look: the world held back behind black, and a window over it with
// the logo and the links at its head; the patch notes down its left, newest first, those new since the player last
// played marked as the menu marks what is new; the servers, then the graphics as Settings has them, down its right;
// and at its foot what the servers say and Play, which has the focus.
import { logoNode, logoScale } from '../../cinema/logo.ts';
import { SCREEN_Z } from '../../cinema/screen.ts';
import type { Child, Node } from '../../ui/node.ts';
import type { Interface } from '../../ui/ui.ts';
import { NEW_PIXELS, NEW_SVG } from '../compendium/loreArt.ts';
import { INK, words } from '../gearNodes.ts';
import { pixelNode } from '../journalIcons.ts';
import { RULE, headingNode, hintNode } from '../menuPages.ts';
import { graphicsNode } from '../settingsPage.ts';
import { type Notes, type PatchNote, isNew } from './patchNotes.ts';
import { SERVERS, type Server, serverWords } from './servers.ts';

/** Over the tap to start, which stands under it until Play. */
const LAUNCHER_Z = SCREEN_Z + 20;
/** The window's most, and how far it stands in from the screen's edges. */
const MOST: readonly [number, number] = [1320, 820];
const INSET: readonly [number, number] = [32, 24];
/** The right column's width, where the view is wide enough to stand it beside the notes. */
const SIDE_WIDTH = 400;

/** The press that goes to the title, and the window's own id. */
export const PLAY = 'launcher-play';
export const LAUNCHER = 'launcher';
/** The Discord server's invite, which never runs out. */
export const DISCORD_INVITE = 'https://discord.gg/RdDURveYus';
/** The links at the launcher's head: each opens in the player's browser. */
export const LINKS = [
  { id: 'launcher-website', words: 'Website', address: 'https://noshores.online/' },
  { id: 'launcher-discord', words: 'Discord', address: DISCORD_INVITE },
  { id: 'launcher-bugs', words: 'Report a bug', address: DISCORD_INVITE },
] as const;

/** What the launcher shows, as it learns it: the notes once read, each server as last heard, and when the player last
 *  pressed Play. */
export interface Shown {
  readonly notes: Notes | null;
  readonly servers: readonly Server[];
  readonly lastPlayed: string | null;
}

/** What the launcher's presses do. */
export interface Does {
  readonly play: () => void;
  readonly open: (address: string) => void;
}

const dateOf = (merged: string) =>
  new Date(merged).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** The mark the menu puts on what is new: Destiny's small diamond and the word. */
const newMark = (): Node => ({
  gap: 6,
  alignY: 'center',
  children: [pixelNode('lore new', NEW_SVG, NEW_PIXELS, 10), words('NEW', 1, INK.brassLit, { tracking: 2 })],
});

/** One pull request's notes: its title, marked where it is new, the day it came, and its lines. */
function noteNode(note: PatchNote, fresh: boolean): Node {
  return {
    width: 'grow',
    direction: 'column',
    gap: 6,
    padding: [10, 0, 12, 0],
    label: `${note.title}${fresh ? ', new' : ''}`,
    children: [
      {
        width: 'grow',
        gap: 10,
        alignY: 'center',
        children: [
          { width: 'grow', text: { words: note.title, size: 2, colour: fresh ? INK.brassLit : INK.word } },
          fresh && newMark(),
          words(dateOf(note.merged), 1, INK.faint),
        ],
      },
      ...note.lines.map((line): Node => ({ width: 'grow', text: { words: `•  ${line}`, colour: INK.word } })),
    ],
  };
}

/** The patch notes, newest first, or why there are none. */
function notesNode(shown: Shown): Node {
  const { notes, lastPlayed } = shown;
  const fresh = notes ? notes.notes.filter((note) => isNew(note, lastPlayed)).length : 0;
  const said =
    notes === null
      ? 'Reading the patch notes.'
      : notes.from === 'none'
        ? 'No patch notes could be read. They show here once the site answers.'
        : notes.from === 'kept'
          ? 'The site did not answer: these are the notes last read.'
          : '';
  return {
    id: 'launcher-notes',
    role: 'panel',
    width: 'grow',
    height: 'grow',
    scroll: true,
    direction: 'column',
    padding: [16, 20],
    children: [
      headingNode('Patch notes', fresh > 0 ? words(`${fresh} NEW`, 1, INK.brassLit, { tracking: 2 }) : null),
      said !== '' && { padding: [10, 0], children: [hintNode(said)] },
      ...(notes?.notes ?? []).flatMap((note, index): Child[] => [
        index > 0 && RULE,
        noteNode(note, isNew(note, lastPlayed)),
      ]),
    ],
  };
}

/** A server's row: its name, and how it last answered in the colour of its state. */
function serverRow(name: string, server: Server): Node {
  const colour = server.state === 'up' ? INK.gain : server.state === 'down' ? INK.loss : INK.faint;
  return {
    width: 'grow',
    gap: 14,
    alignY: 'center',
    label: `${name}, ${serverWords(server)}`,
    children: [{ width: 'grow', ...words(name, 1, INK.word) }, words(serverWords(server), 1, colour)],
  };
}

/** The right column: the servers, then the graphics as Settings has them, the app's version and update with them. */
function sideNode(ui: Interface, shown: Shown, width: number | 'grow'): Node {
  return {
    id: 'launcher-side',
    role: 'panel',
    width,
    height: width === 'grow' ? undefined : 'grow',
    scroll: true,
    direction: 'column',
    gap: 6,
    padding: [16, 20],
    children: [
      headingNode('Servers'),
      { height: 4 },
      ...SERVERS.map((server, index) => serverRow(server.name, shown.servers[index] ?? { state: 'checking' })),
      { height: 14 },
      graphicsNode(ui),
    ],
  };
}

/** What the servers say, for the foot. */
export function serversWords(servers: readonly Server[]): string {
  if (servers.some((server) => server.state === 'down')) return 'A server is not answering, so Play may not get in.';
  if (servers.length < SERVERS.length || servers.some((server) => server.state === 'checking'))
    return 'Checking the servers.';
  return 'The servers are up.';
}

/** The launcher this frame: black over the world, and its window, Play with the focus as it opens. */
export function launcherNode(ui: Interface, shown: Shown, does: Does): Child {
  const view = ui.size;
  if (ui.clicked(PLAY)) does.play();
  for (const link of LINKS) if (ui.clicked(link.id)) does.open(link.address);
  if (ui.age(LAUNCHER) === 0) ui.focusOn(PLAY);
  const width = Math.min(MOST[0], view.width - 2 * INSET[0]);
  const height = Math.min(MOST[1], view.height - 2 * INSET[1]);
  const beside = width >= 2 * SIDE_WIDTH + 80;
  const link = (id: string, said: string): Node => ({
    id,
    press: true,
    role: 'chip',
    label: `${said}, opens in your browser`,
    padding: [6, 12],
    children: [words(said, 1, INK.word)],
  });
  return {
    width: view.width,
    height: view.height,
    fill: '#020305',
    solid: true,
    float: { to: 'screen', z: LAUNCHER_Z },
    children: [
      {
        id: LAUNCHER,
        role: 'window',
        label: 'No Shores',
        solid: true,
        modal: true,
        direction: 'column',
        width,
        height,
        padding: 2,
        float: { to: 'screen', x: Math.round((view.width - width) / 2), y: Math.round((view.height - height) / 2) },
        children: [
          {
            width: 'grow',
            padding: [12, 18],
            gap: 10,
            alignY: 'center',
            children: [
              logoNode(logoScale(Math.min(300, width * 0.3), 1)),
              { width: 'grow' },
              ...LINKS.map((each) => link(each.id, each.words)),
            ],
          },
          RULE,
          {
            width: 'grow',
            height: 'grow',
            direction: beside ? 'row' : 'column',
            gap: 12,
            padding: [12, 16],
            children: [notesNode(shown), sideNode(ui, shown, beside ? SIDE_WIDTH : 'grow')],
          },
          RULE,
          {
            width: 'grow',
            padding: [10, 18],
            gap: 16,
            alignY: 'center',
            children: [
              { width: 'grow', children: [hintNode(`${serversWords(shown.servers)} Bugs go in #bug-reports.`)] },
              {
                id: PLAY,
                press: true,
                role: 'primary',
                label: 'Play',
                padding: [12, 44],
                alignX: 'center',
                alignY: 'center',
                children: [words('PLAY', 2, INK.brassLit, { tracking: 4 })],
              },
            ],
          },
        ],
      },
    ],
  };
}
