// The menu's Journal, drawn by the game: the houses' roads as cards in its middle, the bounties taken as tiles at its
// right, and the timers dropping from its top when DFO's hourglass (in the account mark's place) or T is pressed. It
// reads the rules' draws and the last word of the character any room sent, so it reads the same at sea; it judges no
// rule.
import type { GearState } from '../network/gearMessages.ts';
import { HOURGLASS_SVG, bannerSvg } from '../plus/journalArt.ts';
import { roomNow } from '../sky/worldClock.ts';
import type { Child, Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import type { ThisWeek } from './activityWords.ts';
import { type BountyRow, bountyWords, payOf } from './bountyBoard.ts';
import { TileChoice, bountyCardNode, bountyTileNode, stateLine } from './bountyTiles.ts';
import { INK, type Sizes, words } from './gearNodes.ts';
import { iconNode, pixelNode } from './journalIcons.ts';
import { timersNode } from './journalTimers.ts';
import { CARDS_A_PAGE, type QuestCard, bountyColumnOf, questCardsOf } from './journalWords.ts';
import type { PlainContext } from './menuPage.ts';

/** What the Journal reads: the day's and the week's activities, and the last word of the character any room sent. */
export interface JournalSource {
  week(): ThisWeek | null;
  kept(): GearState | null;
}

/** The hourglass's id, where the focus goes back as the timers go up. */
export const HOURGLASS = 'hourglass';
/** The hourglass's pixels, and the press it stands in, as the account mark's. */
const GLASS: readonly [number, number] = [9, 12];
const MARK_PX = 48;
/** A banner's pixels. */
const BANNER: readonly [number, number] = [16, 24];
/** How high the timers stand: over the menu's window (`gearShell.ts`), as an item's page does. */
const TIMERS_Z = 25;
/** What the page says with no card: before any room's word, or with none of the roads walked or done. */
const NO_QUESTS = 'No quests held. Quests you take up are kept here.';

/** A quest's card: its banner, its name, a line of its tale, and its task's number in a brass badge and its words,
 *  marked by a tick once the quest is done; a name or tale it cuts short is read whole to a screen reader. */
function questCard(card: QuestCard, wide: boolean): Node {
  const [bannerWidth, bannerHeight] = wide ? [80, 120] : [64, 96];
  return {
    id: `quest-${card.id}`,
    focusable: true,
    label: `${card.name}. ${card.tale} Step ${card.step}: ${card.stepName}${card.done ? '. Done' : ''}`,
    role: 'panel',
    width: 'grow',
    gap: 12,
    padding: [6, 14, 6, 8],
    alignY: 'center',
    children: [
      pixelNode(`banner ${card.banner}`, bannerSvg(card.banner), BANNER, bannerWidth, bannerHeight),
      {
        width: 'grow',
        direction: 'column',
        gap: 4,
        children: [
          { width: 'grow', text: { words: card.name, size: wide ? 2 : 1, colour: INK.word, ellipsis: true } },
          { width: 'grow', maxHeight: 40, clip: true, text: { words: card.tale, colour: INK.faint } },
          {
            width: 'grow',
            gap: 6,
            alignY: 'center',
            children: [
              {
                minWidth: 22,
                padding: [0, 4],
                alignX: 'center',
                fill: 'rgba(122,84,36,0.25)',
                children: [words(String(card.step), 1, INK.brassLit)],
              },
              { width: 'grow', text: { words: card.stepName, colour: INK.word, ellipsis: true } },
              card.done && iconNode('taken', 24),
            ],
          },
        ],
      },
    ],
  };
}

/** The Journal: its state between frames (whether the timers are down, the page of quests turned to, the bounty
 *  chosen), and each frame's nodes. */
export class Journal {
  /** Whether the timers are down over the page. */
  down = false;
  private pageAt = 0;
  private readonly choice = new TileChoice();
  /** Where the focus goes once laid: to the timers' Close as they drop, back to the hourglass as they go up. */
  private focusing: string | null = null;

  private readonly source: JournalSource | null;
  private readonly now: () => number;

  constructor(source: JournalSource | null, now: () => number = roomNow) {
    [this.source, this.now] = [source, now];
  }

  /** Drops the timers, or takes them up. */
  toggle(): void {
    this.down = !this.down;
    this.focusing = this.down ? 'timers-close' : HOURGLASS;
  }

  /** Takes the timers up, as the Journal is left or Escape steps back from them: whether they were down. */
  up(): boolean {
    const was = this.down;
    this.down = false;
    return was;
  }

  /** DFO's hourglass, in the account mark's place on the Journal: pressed, it drops the timers; turned and lit while
   *  they are down. */
  hourglass(ui: Interface): Node {
    if (ui.clicked(HOURGLASS)) this.toggle();
    const lit = this.down || ui.hovered(HOURGLASS) || (ui.focused(HOURGLASS) && ui.keyFocused);
    return {
      id: HOURGLASS,
      press: true,
      label: this.down ? 'Timers: close' : 'Timers',
      role: 'well',
      width: MARK_PX,
      height: MARK_PX,
      alignX: 'center',
      alignY: 'center',
      ...(lit && { outline: { width: 1, colour: INK.brass } }),
      children: [
        {
          width: 27,
          height: 36,
          opacity: lit ? 1 : 0.85,
          picture: {
            key: 'hourglass',
            source: { svg: HOURGLASS_SVG },
            pixel: { width: GLASS[0], height: GLASS[1] },
            turn: this.down ? 180 : 0,
          },
        },
      ],
    };
  }

  /** The page: the quests, the bounties at their right, and while dropped the timers over them, the page dimmed. */
  page(plain: PlainContext): Node {
    const { ui, sizes, room } = plain;
    const [week, gear] = [this.source?.week() ?? null, this.source?.kept() ?? null];
    if (this.down && ui.clicked('timers-close')) this.toggle();
    if (this.focusing && ui.boxOf(this.focusing)) [this.focusing] = [null, ui.focusOn(this.focusing)];
    const wide = sizes.name > 1;
    const cards = questCardsOf(gear?.quest);
    const page: Node = {
      id: 'journal',
      width: 'grow',
      gap: 16,
      wrap: room.width < 600,
      children: [this.quests(ui, cards, room.width >= 900, wide), this.bounties(ui, gear, week, sizes)],
    };
    if (!this.down) return page;
    // The page dimmed over the whole of its room, and no further than the body shows it.
    return {
      width: 'grow',
      minHeight: room.height,
      direction: 'column',
      children: [
        { ...page, opacity: 0.35 },
        {
          width: 'grow',
          height: 'grow',
          fill: 'rgba(8,10,15,0.72)',
          solid: true,
          float: { to: 'parent', clipped: true },
        },
        {
          width: 'grow',
          alignX: 'end',
          // Over the menu's window, as an item's page stands over its page; never past the body's foot.
          float: { to: 'parent', anchor: [1, 0], at: [1, 0], z: TIMERS_Z },
          children: [
            timersNode(ui, week, this.now(), sizes, Math.min(360 * (sizes.label + 1), room.width), room.height),
          ],
        },
      ],
    };
  }

  /** The quests: their head with how many are held and the page between its arrows, and the cards six a page, two
   *  columns of three where `twoColumns`; with none, the banners a quest wears resting over the line saying why. */
  private quests(ui: Interface, cards: readonly QuestCard[], twoColumns: boolean, wide: boolean): Node {
    const count = Math.max(1, Math.ceil(cards.length / CARDS_A_PAGE));
    if (ui.clicked('quests-back')) this.pageAt -= 1;
    if (ui.clicked('quests-next')) this.pageAt += 1;
    this.pageAt = Math.max(0, Math.min(count - 1, this.pageAt));
    const arrow = (id: string, icon: 'back' | 'next', none: boolean, said: string): Node => ({
      id,
      press: true,
      disabled: none,
      label: `Quests: ${said}`,
      role: 'button',
      width: 33,
      height: 33,
      alignX: 'center',
      alignY: 'center',
      children: [{ ...iconNode(icon, 24), opacity: none ? 0.4 : 1 }],
    });
    const head: Node = {
      width: 'grow',
      gap: 10,
      alignY: 'center',
      padding: [0, 0, 8, 0],
      children: [
        words('Quests', 2, INK.word),
        cards.length > 0 && {
          role: 'chip',
          padding: [1, 8],
          label: `${cards.length} held`,
          children: [words(String(cards.length))],
        },
        { width: 'grow' },
        cards.length > 0 && {
          gap: 8,
          alignY: 'center',
          children: [
            arrow('quests-back', 'back', this.pageAt === 0, 'the page before'),
            words(`${this.pageAt + 1}/${count}`, 1, INK.faint),
            arrow('quests-next', 'next', this.pageAt >= count - 1, 'the next page'),
          ],
        },
      ],
    };
    if (cards.length === 0)
      return {
        width: 'grow',
        direction: 'column',
        children: [
          head,
          {
            width: 'grow',
            direction: 'column',
            alignX: 'center',
            gap: 18,
            padding: [56, 16, 24, 16],
            children: [
              {
                gap: 20,
                opacity: 0.32,
                children: [
                  pixelNode('banner story', bannerSvg('story'), BANNER, 64, 96),
                  pixelNode('banner side', bannerSvg('side'), BANNER, 64, 96),
                ],
              },
              { maxWidth: 440, text: { words: NO_QUESTS, colour: INK.faint, align: 'center' } },
            ],
          },
        ],
      };
    const shown = cards.slice(this.pageAt * CARDS_A_PAGE, (this.pageAt + 1) * CARDS_A_PAGE);
    const perRow = twoColumns ? 2 : 1;
    const rows: Child[] = [];
    for (let first = 0; first < shown.length; first += perRow)
      rows.push({
        width: 'grow',
        gap: 16,
        children: shown.slice(first, first + perRow).map((card) => questCard(card, wide)),
      });
    return { width: 'grow', direction: 'column', gap: 10, children: [head, ...rows] };
  }

  /** The bounties taken: six slots three to a row under "Bounties" with how many are taken, each taken a tile with no
   *  press, the chosen one's card under them; with none to show, why. */
  private bounties(ui: Interface, gear: GearState | null, week: ThisWeek | null, sizes: Sizes): Node {
    const column = bountyColumnOf(gear, week?.today.day ?? null);
    const tile = sizes.name > 1 ? 88 : 64;
    const ids = new Map(column.taken.map((row) => [row.place, `bounty-${row.place}`]));
    const chosenPlace = this.choice.choose(ui, ids);
    const slots: Node[] = column.taken.map((row) => {
      const id = `bounty-${row.place}`;
      const lit = ui.hovered(id) || (ui.focused(id) && ui.keyFocused);
      return bountyTileNode(row, id, tile, row.place === chosenPlace, lit);
    });
    for (let slot = column.taken.length; slot < column.slots; slot += 1)
      slots.push({ role: 'well', width: tile, height: tile });
    const lines: Child[] = [];
    for (let first = 0; first < slots.length; first += 3)
      lines.push({ gap: 8, children: slots.slice(first, first + 3) });
    const chosen = column.taken.find((row) => row.place === chosenPlace);
    const foot = (row: BountyRow): Child =>
      row.state === 'held' ? null : stateLine(bountyWords(row), 'taken', sizes.label);
    const said: Child = chosen
      ? bountyCardNode(chosen, gear ? payOf(gear) : { xp: 0, aurem: 0 }, foot(chosen), 'grow', sizes.label)
      : column.said !== null && { width: 'grow', text: { words: column.said, colour: INK.faint } };
    return {
      id: 'journal-bounties',
      role: 'panel',
      width: 3 * tile + 2 * 8 + 24,
      direction: 'column',
      gap: 10,
      padding: 12,
      children: [
        {
          width: 'grow',
          gap: 10,
          alignY: 'center',
          children: [
            { width: 'grow', ...words('Bounties', 2, INK.word) },
            column.slots > 0 && {
              role: 'chip',
              padding: [1, 8],
              children: [words(`${column.taken.length}/${column.slots}`)],
            },
          ],
        },
        ...lines,
        { width: 'grow', direction: 'column', children: [said] },
      ],
    };
  }
}
