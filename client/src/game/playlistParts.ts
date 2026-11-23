// The Playlist screen's parts (`playlistScreen.ts` lays them): an entry's crest on the chart, and the chosen entry's card
// with its level, what it drops, its rules, modifiers and rewards, and why it is shut.
import type { Child, Node, Text } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { INK, words } from './gearNodes.ts';
import { iconNode } from './journalIcons.ts';
import { modifierNode } from './journalTimers.ts';
import { CHOSEN_SCALE, drawCrest, drawWaiting } from './playlistMap.ts';
import type { PlaylistEntry, PlaylistReward } from './playlistWords.ts';

/** Each crest is `playlist-tile-<its place>`. */
export const TILE = 'playlist-tile-';
/** How wide a crest's words wrap, in a playlist's shield's sides. */
export const WORDS_WIDE = 2.2;
/** The room over a crest's shield. */
const CREST_TOP = 6;

/** How a crest is drawn this frame: chosen (lit, larger, its name ruled), under the pointer or the focus (lit), or at
 *  rest. */
export type CrestLook = 'chosen' | 'lit' | 'rest';

/** A small heading over a part of the card, in capitals. */
const heading = (said: string, size: number): Node => words(said.toUpperCase(), size, INK.brass, { tracking: 2 });

/** The words under a crest, a part a line, so no separator ever ends or starts one: its level past its tier
 *  ("Levels 20 to 24", "Foes at level 22"), its dungeon's place and level, or why it is shut ("Opens at level 24",
 *  "You are 15"). */
const crestLines = (entry: PlaylistEntry): string[] =>
  (entry.lock ?? entry.about).split(' · ').filter((part) => part !== 'Elite' && part !== 'Abyss');

/** A line of words, wrapping. */
const line = (said: string, size: number, colour: string = INK.faint, more: Partial<Text> = {}): Node => ({
  width: 'grow',
  text: { words: said, size, colour, ...more },
});

/** Why an entry is shut, led by a padlock, in neutral ink: red is kept for a refusal. */
const lockNode = (said: string, size: number, colour: string): Node => ({
  width: 'grow',
  gap: 6,
  alignY: 'center',
  children: [iconNode('locked', 12 * (size + 1)), { width: 'grow', text: { words: said, size, colour } }],
});

/** A reward on the card: its words; then how this character stands with it (a weekly's clears as marks filling with
 *  "2 of 3", else taken or not) with the time to its reset at the right. */
function rewardNode(reward: PlaylistReward, size: number): Node {
  const small = Math.max(1, size - 1);
  const cleared = reward.clears?.filter(Boolean).length ?? 0;
  const needed = reward.clears?.length ?? 0;
  const marks: Child[] = (reward.clears ?? []).map((filled) => ({
    width: 14 * size,
    height: 6 * size,
    fill: filled ? INK.brassLit : INK.well,
    outline: { width: 1, colour: INK.brass },
  }));
  const standing =
    reward.taken === null
      ? ''
      : reward.clears !== null
        ? reward.taken
          ? 'Paid'
          : `${cleared} of ${needed}`
        : reward.taken
          ? 'Taken'
          : 'Not taken';
  return {
    width: 'grow',
    direction: 'column',
    gap: 6,
    children: [
      line(reward.words, small, INK.word),
      {
        width: 'grow',
        gap: 6,
        alignY: 'center',
        children: [
          reward.taken === true && iconNode('taken', 12 * (small + 1)),
          ...marks,
          words(standing, small, reward.taken ? INK.gain : INK.word),
          { width: 'grow' },
          words(reward.resets, small, INK.faint),
        ],
      },
    ],
  };
}

/** The chosen entry's card, `wide` pixels across: its name over its level and what it drops on a brass band, its
 *  rules, its modifiers with their words, its rewards (kept while it is shut, so the player sees what waits), why it
 *  is shut, and what every clear pays. */
export function cardOf(entry: PlaylistEntry, note: string, size: number, wide: Node['width']): Node {
  const small = Math.max(1, size - 1);
  const part = (name: string, children: readonly Child[]): Child =>
    children.some(Boolean) && {
      width: 'grow',
      direction: 'column',
      gap: 6,
      children: [heading(name, small), ...children],
    };
  return {
    id: 'playlist-card',
    direction: 'column',
    width: wide,
    gap: 14,
    padding: [0, 0, 16, 0],
    fill: 'rgba(12,14,18,0.94)',
    outline: { width: 1, colour: 'rgba(192,138,62,0.55)' },
    children: [
      {
        width: 'grow',
        direction: 'column',
        gap: 4,
        padding: [12, 16],
        fill: 'rgba(192,138,62,0.16)',
        children: [
          line(entry.name.toUpperCase(), size + 1, INK.brassLit, { tracking: 2, balance: true }),
          line(entry.about, small, INK.word),
          entry.drops !== '' && line(entry.drops, small),
        ],
      },
      {
        width: 'grow',
        direction: 'column',
        gap: 14,
        padding: [0, 16],
        children: [
          entry.shut !== null && lockNode(entry.shut, small, INK.word),
          part(
            'Rules',
            entry.rules.map((rule) => line(rule, small)),
          ),
          part(
            'Modifiers',
            entry.modifiers.map((modifier): Node => ({
              width: 'grow',
              gap: 8,
              alignY: 'center',
              children: [
                modifierNode(modifier, 12 * (small + 1)),
                {
                  width: 'grow',
                  direction: 'column',
                  children: [words(modifier.name, small, INK.word), line(modifier.words, small)],
                },
              ],
            })),
          ),
          part(
            'Rewards',
            entry.rewards.map((reward) => rewardNode(reward, size)),
          ),
          line(note, small),
        ],
      },
    ],
  };
}

/** An entry's crest, its shield `side` pixels: the shield (lit and a little larger while chosen), a dot while a
 *  reward of it waits or a padlock while it is shut, its name and a brass rule as wide as the name while chosen, and
 *  what it is beneath, or why it is shut; its words wrapped to `wide`. Its shield's middle floated onto `spot` (shares of the chart)
 *  where given, else laid where its parent lays it. */
export function crestOf(
  entry: PlaylistEntry,
  place: number,
  look: CrestLook,
  size: number,
  side: number,
  wide: number,
  spot: readonly [number, number] | null,
): Node {
  const waiting = entry.shut === null && entry.rewards.some((reward) => reward.taken === false);
  const box = Math.round(side * CHOSEN_SCALE);
  const dot = Math.round(side / 9);
  const small = Math.max(1, size - 1);
  const chosen = look === 'chosen';
  return {
    id: `${TILE}${place}`,
    press: true,
    label: `${entry.name}. ${entry.about}${entry.lock ? `. ${entry.lock}` : ''}`,
    direction: 'column',
    alignX: 'center',
    width: wide,
    gap: 6,
    padding: [CREST_TOP, 0, 6, 0],
    ...(spot && { float: { to: 'parent', anchor: [0.5, 0], at: spot, y: -(CREST_TOP + box / 2) } }),
    children: [
      {
        width: box,
        height: box,
        picture: {
          key: `playlist crest ${entry.kind} ${entry.shut !== null} ${look} ${box}`,
          source: { draw: drawCrest(entry.kind, entry.shut !== null, look === 'rest' ? 0 : chosen ? 2 : 1) },
        },
        children: [
          // A shut entry's padlock stands on its shield's shoulder, where an open one's waiting reward would.
          entry.lock !== null && {
            ...iconNode('locked', 12 * Math.max(1, Math.round(side / 40))),
            float: { to: 'parent', anchor: [0.5, 0.5], at: [0.84, 0.2] },
          },
          waiting && {
            width: dot,
            height: dot,
            // As Destiny marks a node with a reward still to earn.
            picture: { key: `playlist waiting ${dot}`, source: { draw: drawWaiting } },
            float: { to: 'parent', anchor: [0.5, 0.5], at: [0.86, 0.18] },
          },
        ],
      },
      {
        width: 'fit',
        direction: 'column',
        gap: 4,
        children: [
          // A long name stands on two lines broken before its "of", each whole, so the rule is as wide as the wider.
          ...entry.name
            .toUpperCase()
            .split(/ (?=OF )/)
            .map((said) => ({
              width: 'grow' as const,
              alignX: 'center' as const,
              children: [words(said, size, chosen ? INK.brassLit : INK.word, { tracking: 2 })],
            })),
          { id: `${TILE}${place}-rule`, width: 'grow', height: 2, fill: chosen ? INK.brass : 'rgba(0,0,0,0)' },
        ],
      },
      {
        width: 'grow',
        direction: 'column',
        gap: 2,
        children: crestLines(entry).map((part) => line(part, small, INK.faint, { align: 'center', balance: true })),
      },
    ],
  };
}

/** How tall the fade over a scrolled list's foot stands: about a line and a half, so a line cut there fades out. */
const FADE = 28;
/** The room a scrolled list keeps at its right for its bar. */
const BAR_ROOM = 8;

/** Draws the fade over a scrolled list's foot: from nothing to the card's ground. */
function drawFade(context: OffscreenCanvasRenderingContext2D, width: number, height: number): void {
  const fade = context.createLinearGradient(0, 0, 0, height);
  fade.addColorStop(0, 'rgba(12,14,18,0)');
  fade.addColorStop(1, 'rgba(12,14,18,1)');
  context.fillStyle = fade;
  context.fillRect(0, 0, width, height);
}

/** `children`, laid as `laying` says, in a list `id` that scrolls when taller than its room (`frame` sizes it), read
 *  from `ui`'s last frame:
 *  a fade over its foot while more lies below, and a thin bar at its right whose thumb stands where the list does. */
export function scrolledNode(
  ui: Interface,
  id: string,
  frame: Pick<Node, 'width' | 'height'>,
  laying: Partial<Node>,
  children: readonly Child[],
): Node {
  const [room, held] = [ui.boxOf(id), ui.boxOf(`${id}-held`)];
  const most = room && held ? held.height - room.height : 0;
  const share = most > 1 && room && held ? Math.min(1, Math.max(0, (room.y - held.y) / most)) : 0;
  const shown = room && held ? Math.max(8, Math.round((room.height / held.height) * 100)) : 100;
  return {
    ...frame,
    children: [
      {
        id,
        width: 'grow',
        height: 'grow',
        scroll: true,
        // Room at the right for the bar, so it stands beside what scrolls, never on its edge.
        padding: [0, BAR_ROOM, 0, 0],
        children: [{ width: 'grow', ...laying, id: `${id}-held`, children }],
      },
      most > 1 &&
        share < 0.999 && {
          id: `${id}-fade`,
          width: '100%',
          height: FADE,
          through: true,
          picture: {
            key: `scroll fade ${Math.round(room?.width ?? 0)}`,
            source: {
              // Over what scrolls only, the bar's room left clear.
              draw: (context, width, height) => drawFade(context, width * (1 - BAR_ROOM / (room?.width || 1)), height),
            },
          },
          float: { to: 'parent', anchor: [0, 1], at: [0, 1] },
        },
      most > 1 && {
        id: `${id}-track`,
        width: 3,
        height: '100%',
        through: true,
        fill: 'rgba(192,138,62,0.18)',
        float: { to: 'parent', anchor: [1, 0], at: [1, 0] },
        children: [
          {
            id: `${id}-thumb`,
            width: 3,
            height: `${shown}%`,
            fill: INK.brass,
            float: { to: 'parent', anchor: [0, share], at: [0, share] },
          },
        ],
      },
    ],
  };
}
