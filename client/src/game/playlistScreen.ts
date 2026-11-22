// The Playlist screen a Playlist's mark beside a port opens, drawn by the game in a window of the menu's kit as the
// entrance's card is: its four entries in a row of tiles, each with its level, rules, modifiers, rewards and why it is
// shut, and for the chosen one Launch, Find a Company or Stop finding, and Close.
import { motionReduced } from '../plus/kit.ts';
import type { Child, Node } from '../ui/node.ts';
import type { Layer } from '../ui/stack.ts';
import type { Interface } from '../ui/ui.ts';
import type { CardSearch } from './entranceCard.ts';
import { INK, pressNode, sizesOf, words } from './gearNodes.ts';
import { setGearScreenOpen } from './gearScreen.ts';
import { iconNode } from './journalIcons.ts';
import { modifierNode } from './journalTimers.ts';
import type { PlaylistEntry, PlaylistReward, PlaylistScreenState } from './playlistWords.ts';
import { play } from './uiSounds.ts';

export interface PlaylistPresses {
  launch(entry: PlaylistEntry): void;
  find(entry: PlaylistEntry): void;
  stop(): void;
  close(): void;
}

const NO_SEARCH: CardSearch = { canFind: false, finding: null, said: null };
/** The presses' ids, which the keys and the pointer press alike; each tile is `playlist-tile-<its place>`. */
const LAUNCH = 'playlist-launch';
const FIND = 'playlist-find';
const STOP = 'playlist-stop';
const CLOSE = 'playlist-close';
const TILE = 'playlist-tile-';
/** How narrow a tile may stand, a step of its words' size, the widest the window stands, and the room its head and
 *  foot take of the screen's height. */
const TILE_LEAST = 110;
const WINDOW_MOST = 1500;
const HEAD_AND_FOOT = 200;

/** A reward's line: its words, then how this character stands with it, as marks filling for a week's clears, and the
 *  time to its reset. */
function rewardNode(reward: PlaylistReward, size: number): Node {
  const marks: Child[] = (reward.clears ?? []).map((filled) => ({
    width: 10 * (size + 1),
    height: 10 * (size + 1),
    fill: filled ? INK.brassLit : INK.well,
    outline: { width: 1, colour: INK.brass },
  }));
  const cleared = reward.clears?.filter(Boolean).length ?? 0;
  const standing =
    reward.taken === null
      ? null
      : reward.clears !== null
        ? reward.taken
          ? 'Paid'
          : `${cleared} of ${reward.clears.length}`
        : reward.taken
          ? 'Taken'
          : 'Not taken';
  return {
    width: 'grow',
    direction: 'column',
    gap: 4,
    children: [
      { width: 'grow', text: { words: reward.words, size, colour: INK.word } },
      {
        width: 'grow',
        gap: 6,
        alignY: 'center',
        wrap: true,
        children: [
          reward.taken === true && iconNode('taken', 12 * (size + 1)),
          ...marks,
          standing !== null && words(standing, size, reward.taken ? INK.gain : INK.word),
        ],
      },
      { width: 'grow', text: { words: reward.resets, size, colour: INK.faint } },
    ],
  };
}

/** One entry's tile: its name, level, rules, modifiers with their words, rewards, and why it is shut; its details a
 *  step smaller than its name and level, so four stand on one screen. */
function tileOf(entry: PlaylistEntry, place: number, chosen: boolean, size: number, wide: number): Node {
  const small = Math.max(1, size - 1);
  const line = (said: string, colour: string = INK.word, sized = small): Node => ({
    width: 'grow',
    text: { words: said, size: sized, colour },
  });
  return {
    id: `${TILE}${place}`,
    press: true,
    label: `${entry.name}. ${entry.about}${entry.shut ? `. ${entry.shut}` : ''}`,
    direction: 'column',
    width: wide,
    gap: 8,
    padding: 12,
    fill: chosen ? INK.wellLit : INK.well,
    outline: { width: chosen ? 2 : 1, colour: chosen ? INK.brassLit : INK.brass },
    opacity: entry.shut === null ? 1 : 0.75,
    children: [
      { width: 'grow', text: { words: entry.name.toUpperCase(), size, colour: INK.brassLit, tracking: 2 } },
      line(entry.about, INK.brassLit, size),
      ...entry.rules.map((rule) => line(rule, INK.faint)),
      ...entry.modifiers.map((modifier): Node => ({
        width: 'grow',
        gap: 8,
        alignY: 'center',
        children: [
          modifierNode(modifier, 12 * (small + 1)),
          {
            width: 'grow',
            direction: 'column',
            children: [words(modifier.name, small, INK.word), line(modifier.words, INK.faint)],
          },
        ],
      })),
      ...entry.rewards.map((reward) => rewardNode(reward, small)),
      entry.shut !== null && line(entry.shut, INK.loss),
    ],
  };
}

/** The Playlist screen over the dimmed world: "Playlist" and the port it was opened beside at its head, the four
 *  entries in a row of tiles, the wait while Find a Company finds, and Launch (E), Find a Company or Stop finding (F)
 *  and Close (Esc) for the chosen entry on its footer. Arrows choose another. While it stands the pointer is free and
 *  the game's keys rest, as under the entrance's card. */
export class PlaylistView {
  private screen: PlaylistScreenState | null = null;
  private search: CardSearch = NO_SEARCH;
  private chosen = 0;
  private focusNext: string | null = null;
  private readonly presses: PlaylistPresses;

  constructor(presses: PlaylistPresses) {
    this.presses = presses;
    // Heard before the game and the menu, so while it stands no key of theirs acts behind it.
    addEventListener(
      'keydown',
      (event) => {
        if (!this.screen) return;
        event.stopImmediatePropagation();
        const key = event.key.toLowerCase();
        const keys = ['e', 'f', 'escape', 'arrowleft', 'arrowright'];
        if (event.repeat || !keys.includes(key)) return;
        event.preventDefault();
        const entry = this.entry;
        if (key === 'escape') presses.close();
        else if (key === 'arrowleft' || key === 'arrowright') this.choose(this.chosen + (key === 'arrowleft' ? -1 : 1));
        else if (key === 'f' && this.search.finding !== null) presses.stop();
        else if (key === 'f' && entry && this.findable(entry)) presses.find(entry);
        else if (key === 'e' && entry && entry.shut === null) presses.launch(entry);
      },
      { capture: true },
    );
  }

  /** Shows the screen, or builds it again where it stands, with Find a Company as `search` says. */
  show(screen: PlaylistScreenState, search: CardSearch = NO_SEARCH): void {
    const opening = this.screen === null;
    [this.screen, this.search] = [screen, search];
    setGearScreenOpen(true);
    if (!opening) return;
    document.exitPointerLock();
    play('open');
    this.chosen = 0;
    this.focusNext = `${TILE}0`;
  }

  hide(): void {
    if (!this.screen) return;
    this.screen = null;
    setGearScreenOpen(false);
    play('close');
  }

  get open(): boolean {
    return this.screen !== null;
  }

  /** The entry chosen. */
  get entry(): PlaylistEntry | null {
    return this.screen?.entries[this.chosen] ?? null;
  }

  private choose(place: number): void {
    const count = this.screen?.entries.length ?? 0;
    if (count === 0 || this.search.finding !== null) return;
    this.chosen = (place + count) % count;
    this.focusNext = `${TILE}${this.chosen}`;
  }

  /** Whether Find a Company is offered for an entry: it matches one, and the page may search. */
  private findable(entry: PlaylistEntry): boolean {
    return entry.launch.finds !== null && this.search.canFind;
  }

  /** The screen this frame over the dimmed world, its presses heard; nothing while it is shut. */
  readonly layer: Layer = (ui: Interface) => {
    const heard = this.screen;
    if (!heard) return null;
    heard.entries.forEach((_entry, place) => {
      if (ui.clicked(`${TILE}${place}`)) this.choose(place);
    });
    const entry = this.entry;
    if (ui.clicked(CLOSE)) this.presses.close();
    else if (entry && ui.clicked(LAUNCH) && entry.shut === null) this.presses.launch(entry);
    else if (entry && ui.clicked(FIND)) this.presses.find(entry);
    else if (ui.clicked(STOP)) this.presses.stop();
    const { screen, search } = this;
    if (!screen || !entry) return null;
    if (this.focusNext && ui.boxOf(this.focusNext)) [this.focusNext] = [null, ui.focusOn(this.focusNext)];
    const view = ui.size;
    const size = sizesOf(view.width, view.height, 1).label;
    const finding = search.finding !== null;
    // As many tiles across as fit, four at most, the rest on lines below, scrolled where they stand taller than the screen.
    const wide = Math.min(view.width - 32, WINDOW_MOST);
    const inside = wide - 48;
    const across = Math.max(
      1,
      Math.min(screen.entries.length, Math.floor((inside + 12) / (TILE_LEAST * (size + 1) + 12))),
    );
    // Three across would leave one alone below: two rows of two read as one board.
    const rows = across === 3 && screen.entries.length === 4 ? 2 : across;
    const tileWide = Math.floor((inside - 12 * (rows - 1)) / rows);
    const said = (words: string, colour: string): Node => ({ width: 'grow', text: { words, size, colour } });
    return {
      width: 'grow',
      height: 'grow',
      children: [
        {
          id: 'playlist-scrim',
          width: view.width,
          height: view.height,
          solid: true,
          fill: 'rgba(5,7,10,0.6)',
          float: { to: 'screen', z: 19 },
        },
        {
          id: 'playlist-screen',
          role: 'window',
          label: `${screen.title}, ${screen.port}`,
          solid: true,
          modal: true,
          direction: 'column',
          width: wide,
          padding: 2,
          opacity: motionReduced() ? 1 : Math.min(1, 0.25 + ui.age('playlist-screen') * 4),
          float: { to: 'screen', anchor: [0.5, 0.5], at: [0.5, 0.5], z: 20 },
          children: [
            {
              width: 'grow',
              direction: 'column',
              padding: [12, 20, 4, 20],
              alignX: 'center',
              children: [
                words(screen.title.toUpperCase(), size + 1, INK.brassLit, { tracking: 3 }),
                words(screen.port, size, INK.faint),
              ],
            },
            {
              id: 'playlist-entries',
              width: 'grow',
              maxHeight: Math.max(120, view.height - HEAD_AND_FOOT),
              scroll: true,
              gap: 12,
              padding: [10, 20, 14, 20],
              wrap: true,
              alignX: 'center',
              children: screen.entries.map((one, place) => tileOf(one, place, place === this.chosen, size, tileWide)),
            },
            {
              width: 'grow',
              padding: [0, 20, 8, 20],
              children: [
                { width: 'grow', text: { words: screen.note, size: Math.max(1, size - 1), colour: INK.faint } },
              ],
            },
            finding && { width: 'grow', padding: [0, 20], children: [said(search.finding ?? '', INK.gain)] },
            finding && {
              width: 'grow',
              padding: [0, 20, 8, 20],
              children: [said('A run starts with four, or with fewer after a minute.', INK.faint)],
            },
            !finding &&
              search.said !== null && { width: 'grow', padding: [0, 20], children: [said(search.said, INK.loss)] },
            { width: 'grow', height: 1, fill: 'rgba(163,152,128,0.26)' },
            {
              width: 'grow',
              padding: [8, 16],
              gap: 8,
              alignX: 'end',
              wrap: true,
              children: [
                pressNode(LAUNCH, 'Launch', 'primary', 'E', size, { disabled: entry.shut !== null || finding }),
                finding
                  ? pressNode(STOP, 'Stop finding', 'button', 'F', size)
                  : this.findable(entry) && pressNode(FIND, 'Find a Company', 'button', 'F', size),
                pressNode(CLOSE, 'Close', 'button', 'Esc', size),
              ],
            },
          ],
        },
      ],
    };
  };
}
