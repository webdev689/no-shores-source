// The Playlist screen a Playlist's mark beside a port opens, after the owner's reference, Destiny's Vanguard screen:
// the four entries as crests on a dark chart (`playlistMap.ts`), the chosen one's card beside them with its level,
// modifiers, rules and rewards (the daily as taken or not, the weekly as a bar and marks filling), and a footer bar with
// Launch, Find a Company or Stop finding, and Close.
import { motionReduced } from '../plus/kit.ts';
import type { Child, Node } from '../ui/node.ts';
import type { Layer } from '../ui/stack.ts';
import type { Interface } from '../ui/ui.ts';
import type { CardSearch } from './entranceCard.ts';
import { INK, pressNode, sizesOf, words } from './gearNodes.ts';
import { setGearScreenOpen } from './gearScreen.ts';
import { iconNode } from './journalIcons.ts';
import { modifierNode } from './journalTimers.ts';
import { drawChart, drawCrest, drawWaiting, spotShare } from './playlistMap.ts';
import type { PlaylistEntry, PlaylistReward, PlaylistScreenState } from './playlistWords.ts';
import { play } from './uiSounds.ts';

export interface PlaylistPresses {
  launch(entry: PlaylistEntry): void;
  find(entry: PlaylistEntry): void;
  stop(): void;
  close(): void;
}

const NO_SEARCH: CardSearch = { canFind: false, finding: null, said: null };
/** The presses' ids, which the keys and the pointer press alike; each crest is `playlist-tile-<its place>`. */
const LAUNCH = 'playlist-launch';
const FIND = 'playlist-find';
const STOP = 'playlist-stop';
const CLOSE = 'playlist-close';
const TILE = 'playlist-tile-';
/** The narrowest screen the chart and the card stand side by side on, the card's widest, and a crest's side at a
 *  screen 900 pixels tall (a week's dungeon's a fifth smaller). */
const SIDE_BY_SIDE = 1000;
const CARD_MOST = 560;
const CREST = 104;

/** A small heading over a part of the card, in capitals. */
const heading = (said: string, size: number): Node => words(said.toUpperCase(), size, INK.brass, { tracking: 2 });

/** A reward on the card: its words; then how this character stands with it (a weekly's clears as a bar and marks
 *  filling, else taken or not) with the time to its reset at the right. */
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
  const bar: Node | false = reward.clears !== null && {
    width: 'grow',
    height: 6,
    fill: INK.well,
    outline: { width: 1, colour: 'rgba(192,138,62,0.5)' },
    children: [
      { width: `${needed === 0 ? 0 : Math.round((cleared / needed) * 100)}%`, height: 'grow', fill: INK.brassLit },
    ],
  };
  return {
    width: 'grow',
    direction: 'column',
    gap: 6,
    children: [
      { width: 'grow', text: { words: reward.words, size: small, colour: INK.word } },
      bar,
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

/** The chosen entry's card: its name over a brass rule, what it is, its rules, its modifiers with their words, its
 *  rewards, why it is shut, and what every clear pays. */
function cardOf(entry: PlaylistEntry, note: string, size: number, wide: number): Node {
  const small = Math.max(1, size - 1);
  const line = (said: string, colour: string = INK.faint): Node => ({
    width: 'grow',
    text: { words: said, size: small, colour },
  });
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
          {
            width: 'grow',
            text: { words: entry.name.toUpperCase(), size: size + 1, colour: INK.brassLit, tracking: 2 },
          },
          line(entry.about, INK.word),
        ],
      },
      {
        width: 'grow',
        direction: 'column',
        gap: 14,
        padding: [0, 16],
        children: [
          part(
            'Rules',
            entry.rules.map((rule) => line(rule)),
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
                  children: [words(modifier.name, small, INK.word), line(modifier.words)],
                },
              ],
            })),
          ),
          part(
            'Rewards',
            entry.rewards.map((reward) => rewardNode(reward, size)),
          ),
          entry.shut !== null && line(entry.shut, INK.loss),
          line(note),
        ],
      },
    ],
  };
}

/** An entry's crest on the chart, where `spotShare` stands it: its shield, a dot while a reward of it waits, its name
 *  and what it is beneath; the chosen one's name lit over a brass rule. */
function crestOf(entry: PlaylistEntry, place: number, chosen: boolean, size: number, side: number): Node {
  const waiting = entry.shut === null && entry.rewards.some((reward) => reward.taken === false);
  const [across, down] = spotShare(entry.kind);
  const dot = Math.round(side / 9);
  return {
    id: `${TILE}${place}`,
    press: true,
    label: `${entry.name}. ${entry.about}${entry.shut ? `. ${entry.shut}` : ''}`,
    direction: 'column',
    alignX: 'center',
    gap: 6,
    padding: 6,
    float: { to: 'parent', anchor: [0.5, 0.35], at: [across, down] },
    children: [
      {
        width: side,
        height: side,
        picture: {
          key: `playlist crest ${entry.kind} ${entry.shut !== null} ${side}`,
          source: { draw: drawCrest(entry.kind, entry.shut !== null) },
        },
        children: [
          waiting && {
            width: dot,
            height: dot,
            // As Destiny marks a node with a reward still to earn.
            picture: { key: `playlist waiting ${dot}`, source: { draw: drawWaiting } },
            float: { to: 'parent', anchor: [0.5, 0.5], at: [0.9, 0.16] },
          },
        ],
      },
      words(entry.name.toUpperCase(), size, chosen ? INK.brassLit : INK.word, { tracking: 2 }),
      { width: chosen ? 'grow' : 0, height: 2, fill: INK.brass },
      words(
        entry.shut === null ? entry.about : entry.shut,
        Math.max(1, size - 1),
        entry.shut === null ? INK.faint : INK.loss,
      ),
    ],
  };
}

/** The Playlist screen over the world: "Playlist" and the port it was opened beside at its head, the four entries as
 *  crests on the chart and the chosen one's card, the wait while Find a Company finds, and Launch (E), Find a Company
 *  or Stop finding (F) and Close (Esc) on its footer. The arrows, a click or the pointer over a crest choose another;
 *  up and down go between a playlist and its week's dungeon. While it stands the pointer is free and the game's keys
 *  rest, as under the entrance's card. */
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
        const keys = ['e', 'f', 'escape', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'];
        if (event.repeat || !keys.includes(key)) return;
        event.preventDefault();
        const entry = this.entry;
        if (key === 'escape') presses.close();
        else if (key === 'arrowleft' || key === 'arrowright') this.choose(this.chosen + (key === 'arrowleft' ? -1 : 1));
        else if (key === 'arrowup' || key === 'arrowdown') this.choose(this.chosen ^ 2);
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

  /** The screen this frame over the world, its presses heard; nothing while it is shut. */
  readonly layer: Layer = (ui: Interface) => {
    const heard = this.screen;
    if (!heard) return null;
    heard.entries.forEach((_entry, place) => {
      const id = `${TILE}${place}`;
      if (ui.clicked(id) || (ui.hovered(id) && place !== this.chosen && this.search.finding === null)) {
        this.choose(place);
      }
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
    const besides = view.width >= SIDE_BY_SIDE;
    const scale = Math.min(1.4, Math.max(0.7, view.height / 900));
    const cardWide = besides ? Math.min(CARD_MOST, Math.round(view.width * 0.34)) : view.width - 40;
    // The chart takes what the card, the head and the footer leave.
    const chartWide = besides ? view.width - cardWide - 80 : view.width - 40;
    const chartTall = besides ? view.height - 170 : Math.round(view.height * 0.45);
    const status = finding ? search.finding : search.said;
    return {
      width: 'grow',
      height: 'grow',
      children: [
        {
          id: 'playlist-scrim',
          width: view.width,
          height: view.height,
          solid: true,
          fill: 'rgba(5,7,10,0.92)',
          float: { to: 'screen', z: 19 },
        },
        {
          id: 'playlist-screen',
          label: `${screen.title}, ${screen.port}`,
          solid: true,
          modal: true,
          direction: 'column',
          width: view.width,
          height: view.height,
          opacity: motionReduced() ? 1 : Math.min(1, 0.25 + ui.age('playlist-screen') * 4),
          float: { to: 'screen', z: 20 },
          children: [
            {
              width: 'grow',
              direction: 'column',
              gap: 2,
              padding: [20, 32, 8, 32],
              children: [
                words(screen.title.toUpperCase(), size + 1, INK.brassLit, { tracking: 4 }),
                words(screen.port, size, INK.faint),
                { width: 220, height: 1, fill: INK.brass },
              ],
            },
            {
              width: 'grow',
              height: 'grow',
              direction: besides ? 'row' : 'column',
              gap: 20,
              padding: [0, 20],
              scroll: !besides,
              children: [
                {
                  id: 'playlist-chart',
                  width: chartWide,
                  height: chartTall,
                  picture: { key: `playlist chart ${chartWide} ${chartTall}`, source: { draw: drawChart } },
                  children: screen.entries.map((one, place) => {
                    const weekly = one.kind === 'week-elite' || one.kind === 'week-abyss';
                    const side = Math.round(CREST * scale * (weekly ? 0.8 : 1));
                    return crestOf(one, place, place === this.chosen, size, side);
                  }),
                },
                {
                  width: 'fit',
                  direction: 'column',
                  padding: [8, 0],
                  children: [cardOf(entry, screen.note, size, cardWide)],
                },
              ],
            },
            {
              width: 'grow',
              padding: [10, 24],
              gap: 10,
              alignY: 'center',
              fill: 'rgba(10,12,16,0.9)',
              children: [
                status !== null && words(status, size, finding ? INK.gain : INK.loss),
                finding &&
                  words('A run starts with four, or with fewer after a minute.', Math.max(1, size - 1), INK.faint),
                { width: 'grow' },
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
