// The Playlist screen its tile over a living port's island opens, after the owner's reference, Destiny's Vanguard screen:
// its entries as crests on a dark chart (`playlistMap.ts`), the chosen one's card beside them or under them
// (`playlistParts.ts`), and a footer bar with Find a Company or Stop finding, Launch and Close.
import { motionReduced } from '../plus/kit.ts';
import type { Child, Node } from '../ui/node.ts';
import type { Layer } from '../ui/stack.ts';
import type { Interface } from '../ui/ui.ts';
import type { CardSearch } from './entranceCard.ts';
import { INK, pressNode, sizesOf, words } from './gearNodes.ts';
import { setGearScreenOpen } from './gearScreen.ts';
import { iconNode } from './journalIcons.ts';
import { drawChart, drawGround, SPOTS_APART, spotShare } from './playlistMap.ts';
import {
  type CrestLook,
  type CrestMotion,
  DIAL_WIDE,
  TILE,
  WORDS_WIDE,
  cardOf,
  crestOf,
  dialOf,
  scrolledNode,
  sweepOf,
} from './playlistParts.ts';
import type { PlaylistEntry, PlaylistKind, PlaylistScreenState } from './playlistWords.ts';
import { play } from './uiSounds.ts';

export interface PlaylistPresses {
  launch(entry: PlaylistEntry): void;
  find(entry: PlaylistEntry): void;
  stop(): void;
  close(): void;
}

/** What the screen says of a search: Find a Company's (as the entrance card's), whether the one under way is Launch's
 *  ask of the server rather than a search, and whether the player is in a company Launch goes with. */
export interface PlaylistSearch extends CardSearch {
  readonly launching: boolean;
  readonly company: boolean;
}

const NO_SEARCH: PlaylistSearch = { canFind: false, finding: null, said: null, launching: false, company: false };
/** What the footer says while Launch waits for the server's run. */
export const LAUNCHING = 'Launching…';
/** The presses' ids, which the keys and the pointer press alike. */
const LAUNCH = 'playlist-launch';
const FIND = 'playlist-find';
const STOP = 'playlist-stop';
const CLOSE = 'playlist-close';
/** The narrowest screen the chart and the card stand side by side on, and the narrowest the footer stands on one line
 *  on; the card's widest; and a crest's side at a screen 900 pixels tall (a week's dungeon's a fifth smaller). */
const SIDE_BY_SIDE = 1000;
const FOOTER_ONE_LINE = 1100;
const CARD_MOST = 560;
const CREST = 104;
/** The steps a crest's side goes in as the screen is resized. */
const SIDE_STEP = 4;
/** The steps a chart's picture is drawn again at as the screen is resized, so a drag draws it a few times, not each
 *  pixel. */
const CHART_STEP = 64;
/** The list that scrolls: the card's column side by side, the crests and the card together stacked. */
const SCROLLS = { besides: 'playlist-card-column', stacked: 'playlist-body' } as const;
const stepped = (pixels: number) => Math.max(1, Math.round(pixels / CHART_STEP)) * CHART_STEP;
/** The entry up or down takes the choice to: a playlist's and its week's dungeon, a Breach's two tiers. */
const PAIRS: Readonly<Record<PlaylistKind, PlaylistKind>> = {
  elite: 'week-elite',
  'week-elite': 'elite',
  abyss: 'week-abyss',
  'week-abyss': 'abyss',
  'breach-normal': 'breach-hard',
  'breach-hard': 'breach-normal',
};

/** The Playlist screen over the world: "Playlist" and the port it was opened beside at its head, its entries as
 *  crests on the chart and the chosen one's card, the wait while Find a Company finds, and Find a Company or Stop
 *  finding (F), Launch (E) and Close (Esc, the pad's B) on its footer. The pointer over a crest only lights it; a click,
 *  Enter, Space or the pad's A on it chooses it, the arrows choose the next (up and down between a playlist and its
 *  week's dungeon), and the card follows the pad's focus over the crests. While it stands the pointer is free and the
 *  game's keys rest, as under the entrance's card. */
export class PlaylistView {
  private screen: PlaylistScreenState | null = null;
  private search: PlaylistSearch = NO_SEARCH;
  private chosen = 0;
  /** The press or crest to give the focus to once it is laid: the first crest as it opens, the chosen one as the
   *  arrows choose, and the search's press as one takes the other's place. */
  private focusNext: string | null = null;
  /** The pages Page Up (-1) and Page Down (1) asked the list to scroll since the last frame. */
  private paged = 0;
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
        const keys = ['e', 'f', 'escape', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'pageup', 'pagedown'];
        if (event.repeat || !keys.includes(key)) return;
        event.preventDefault();
        const entry = this.entry;
        const { finding, launching } = this.search;
        if (key === 'escape') presses.close();
        else if (key === 'pageup' || key === 'pagedown') this.paged += key === 'pageup' ? -1 : 1;
        else if (key === 'arrowleft' || key === 'arrowright') this.choose(this.chosen + (key === 'arrowleft' ? -1 : 1));
        else if (key === 'arrowup' || key === 'arrowdown') this.choose(this.pairOf(this.chosen));
        else if (key === 'f' && finding !== null) {
          if (!launching) presses.stop();
        } else if (key === 'f' && entry && this.findable(entry)) presses.find(entry);
        else if (key === 'e' && entry && entry.shut === null && finding === null) presses.launch(entry);
      },
      { capture: true },
    );
  }

  /** Shows the screen, or builds it again where it stands, with Find a Company as `search` says. */
  show(screen: PlaylistScreenState, search: PlaylistSearch = NO_SEARCH): void {
    const opening = this.screen === null;
    const entry = screen.entries[opening ? 0 : this.chosen];
    // The press a search stands on: Stop finding while one finds, Find a Company where the entry offers it.
    const pressOf = (shown: PlaylistSearch) =>
      shown.finding !== null
        ? shown.launching
          ? null
          : STOP
        : shown.canFind && (entry?.launch.finds ?? null) !== null && entry?.launch.seas !== 'breach'
          ? FIND
          : null;
    if (!opening && pressOf(search) !== pressOf(this.search)) this.focusNext = pressOf(search) ?? CLOSE;
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

  /** The entry chosen. */
  get entry(): PlaylistEntry | null {
    return this.screen?.entries[this.chosen] ?? null;
  }

  /** The entry over or under `place` on the chart: a playlist's week's dungeon, a Breach's other tier. */
  private pairOf(place: number): number {
    const entries = this.screen?.entries ?? [];
    const kind = entries[place]?.kind;
    const pair = kind && PAIRS[kind];
    const found = entries.findIndex((entry) => entry.kind === pair);
    return found >= 0 ? found : place;
  }

  private choose(place: number): void {
    const count = this.screen?.entries.length ?? 0;
    if (count === 0 || this.search.finding !== null) return;
    this.chosen = (place + count) % count;
    this.focusNext = `${TILE}${this.chosen}`;
  }

  /** Whether Find a Company is offered for an entry: it matches one (a Breach is never matched), and the page may
   *  search. */
  private findable(entry: PlaylistEntry): boolean {
    return entry.launch.finds !== null && entry.launch.seas !== 'breach' && this.search.canFind;
  }

  /** The screen this frame over the world, its presses heard; nothing while it is shut. */
  readonly layer: Layer = (ui: Interface) => {
    const heard = this.screen;
    if (!heard) return null;
    if (ui.escaped) return (this.presses.close(), null);
    heard.entries.forEach((_entry, place) => {
      if (ui.clicked(`${TILE}${place}`)) this.choose(place);
    });
    // The pad's cross moves the focus over the crests: the card follows it.
    const focused = ui.focusedId;
    const onCrest = focused?.startsWith(TILE) ? Number(focused.slice(TILE.length)) : null;
    if (ui.keyFocused && this.focusNext === null && onCrest !== null && onCrest !== this.chosen) this.choose(onCrest);
    const entry = this.entry;
    const idle = this.search.finding === null;
    if (ui.clicked(CLOSE)) this.presses.close();
    else if (entry && ui.clicked(LAUNCH) && entry.shut === null && idle) this.presses.launch(entry);
    else if (entry && ui.clicked(FIND)) this.presses.find(entry);
    else if (ui.clicked(STOP)) this.presses.stop();
    const { screen } = this;
    if (!screen || !entry) return null;
    if (this.focusNext && ui.boxOf(this.focusNext)) [this.focusNext] = [null, ui.focusOn(this.focusNext)];
    const view = ui.size;
    const size = sizesOf(view.width, view.height, 1).label;
    const besides = view.width >= SIDE_BY_SIDE;
    this.scroll(ui, besides ? SCROLLS.besides : SCROLLS.stacked);
    const scale = Math.min(1.4, Math.max(0.7, view.height / 900));
    const cardWide = Math.min(CARD_MOST, Math.round(view.width * 0.34));
    // Side by side, each crest's words fit between its spot and the next on the chart; stacked, two crests share a
    // row, each its words' width, and the two rows leave the card room below. The side goes in steps, so a resize
    // draws the crests, glows and dials again only every few pixels.
    const chartWide = view.width - cardWide - 80;
    const most = besides
      ? (chartWide * SPOTS_APART) / WORDS_WIDE
      : Math.min((view.width - 40) / 2 / WORDS_WIDE, view.height / 9);
    const playlistSide = Math.floor(Math.min(CREST * scale, most) / SIDE_STEP) * SIDE_STEP;
    const [opened, still] = [ui.age('playlist-screen'), motionReduced()];
    const looks = screen.entries.map((_one, place): CrestLook => {
      const id = `${TILE}${place}`;
      return place === this.chosen ? 'chosen' : ui.hovered(id) || (ui.focused(id) && ui.keyFocused) ? 'lit' : 'rest';
    });
    const crests = screen.entries.map((one, place) => {
      const weekly = one.kind === 'week-elite' || one.kind === 'week-abyss';
      const side = Math.floor(playlistSide * (weekly ? 0.8 : 1));
      const motion: CrestMotion = { opened, swept: ui.age(sweepOf(place, looks[place] ?? 'rest')), still };
      // Side by side a crest's words wrap a little over twice its side; stacked, each has its half of a row.
      const wide = besides ? Math.floor(playlistSide * WORDS_WIDE) : Math.floor((view.width - 40) / 2) - 8;
      return crestOf(
        one,
        place,
        looks[place] ?? 'rest',
        size,
        side,
        wide,
        besides ? spotShare(one.kind) : null,
        motion,
      );
    });
    // On the chart each crest stands on its dial, every dial the same size, as the chart's rings were.
    const dials = besides
      ? screen.entries.flatMap((one, place) =>
          dialOf(one, place, looks[place] ?? 'rest', Math.round(playlistSide * DIAL_WIDE), spotShare(one.kind), {
            opened,
            still,
          }),
        )
      : [];
    const middle: Node = besides
      ? {
          width: 'grow',
          height: 'grow',
          gap: 20,
          padding: [0, 20],
          children: [
            {
              id: 'playlist-chart',
              width: 'grow',
              height: 'grow',
              picture: {
                key: `playlist chart ${stepped(chartWide)} ${stepped(view.height - 170)}`,
                source: { draw: drawChart },
              },
              children: [...dials, ...crests],
            },
            scrolledNode(
              ui,
              SCROLLS.besides,
              { width: cardWide, height: 'grow' },
              { direction: 'column', padding: [8, 0] },
              [cardOf(entry, screen.note, size, 'grow')],
            ),
          ],
        }
      : {
          width: 'grow',
          height: 'grow',
          padding: [0, 20],
          children: [
            scrolledNode(
              ui,
              SCROLLS.stacked,
              { width: 'grow', height: 'grow' },
              { direction: 'column', gap: 16, padding: [0, 0, 12, 0] },
              [
                {
                  id: 'playlist-chart',
                  width: 'grow',
                  direction: 'column',
                  gap: 8,
                  padding: [8, 0],
                  picture: {
                    key: `playlist ground ${stepped(view.width - 40)} ${stepped(view.height / 2)}`,
                    source: { draw: drawGround },
                  },
                  children: crests
                    .flatMap((_crest, first) => (first % 2 === 0 ? [first] : []))
                    .map((first) => ({
                      width: 'grow',
                      children: crests.slice(first, first + 2).map((crest) => ({
                        width: '50%',
                        alignX: 'center',
                        children: [crest],
                      })),
                    })),
                },
                cardOf(entry, screen.note, size, 'grow'),
              ],
            ),
          ],
        };
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
          opacity: still ? 1 : Math.min(1, 0.25 + opened * 4),
          float: { to: 'screen', z: 20 },
          children: [
            {
              width: 'grow',
              direction: 'column',
              gap: 2,
              padding: besides ? [20, 32, 8, 32] : [16, 20, 8, 20],
              children: [
                words(screen.title.toUpperCase(), size + 1, INK.brassLit, { tracking: 4 }),
                words(screen.port, size, INK.faint),
                { width: 220, height: 1, fill: INK.brass },
              ],
            },
            middle,
            // A hairline over the footer, so the card scrolling under it is cut at an edge.
            { width: 'grow', height: 1, fill: 'rgba(192,138,62,0.35)' },
            this.footer(entry, size, view.width < FOOTER_ONE_LINE),
          ],
        },
      ],
    };
  };

  /** Scrolls list `id` a page at a time for Page Up and Page Down, and by the pad's right stick where the interface
   *  does not: it scrolls what lies under the pad's cursor while it is out, else under the focus's middle. */
  private scroll(ui: Interface, id: string): void {
    const [room, focus] = [ui.boxOf(id), ui.focusedId ? ui.boxOf(ui.focusedId) : null];
    if (!room) return;
    if (this.paged !== 0) ui.scrollBy(id, this.paged * Math.round(room.height * 0.8));
    this.paged = 0;
    const home =
      ui.cursor !== 'none' && focus ? { x: focus.x + focus.width / 2, y: focus.y + focus.height / 2 } : ui.pointerAt;
    const under =
      home !== null &&
      home.x >= room.x &&
      home.x < room.x + room.width &&
      home.y >= room.y &&
      home.y < room.y + room.height;
    if (ui.stickScroll !== 0 && !under) ui.scrollBy(id, ui.stickScroll);
  }

  /** The footer: the search's word, or why the last one ended, at the left; why the entry is shut beside the resting
   *  Launch; and the presses, Find a Company first where the entry offers it, Launch none while a search or a launch
   *  runs. Narrow, the word stands over the presses, which wrap. */
  private footer(entry: PlaylistEntry, size: number, narrow: boolean): Node {
    const search = this.search;
    const finding = search.finding !== null;
    const small = Math.max(1, size - 1);
    const findable = this.findable(entry);
    const status: Child =
      search.finding !== null
        ? words(search.finding, size, search.launching ? INK.word : INK.gain)
        : search.said !== null && {
            width: narrow ? 'grow' : 'fit',
            text: { words: search.said, size, colour: INK.loss },
          };
    const presses: Child[] = [
      entry.lock !== null && {
        gap: 6,
        alignY: 'center',
        children: [iconNode('locked', 12 * (small + 1)), words(entry.lock, small, INK.faint)],
      },
      finding
        ? !search.launching && pressNode(STOP, 'Stop finding', 'button', 'F', size)
        : findable && pressNode(FIND, 'Find a Company', 'primary', 'F', size),
      // While a search or a launch runs, Launch is not offered: Stop finding or the wait stands in its place. A
      // Breach is a company's, so it is never offered alone.
      !finding &&
        pressNode(
          LAUNCH,
          search.company ? 'Go with your company' : entry.launch.seas === 'breach' ? 'Launch' : 'Go alone',
          findable ? 'button' : 'primary',
          'E',
          size,
          // Resting while the entry is shut, it is drawn dim, its key cap with it, so it reads as not to be pressed.
          { disabled: entry.shut !== null, ...(entry.shut !== null && { opacity: 0.4 }) },
        ),
      pressNode(CLOSE, 'Close', 'button', 'Esc', size),
    ];
    const frame = { width: 'grow', fill: 'rgba(10,12,16,0.9)' } as const;
    if (narrow)
      return {
        ...frame,
        direction: 'column',
        gap: 8,
        padding: [10, 16],
        children: [
          status !== false && status,
          { width: 'grow', gap: 10, alignX: 'end', alignY: 'center', wrap: true, children: presses },
        ],
      };
    return {
      ...frame,
      padding: [10, 24],
      gap: 10,
      alignY: 'center',
      children: [
        status,
        finding &&
          !search.launching &&
          words('A run starts with four, or with fewer after a minute.', small, INK.faint),
        { width: 'grow' },
        ...presses,
      ],
    };
  }
}
