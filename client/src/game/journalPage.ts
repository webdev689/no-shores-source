// The menu's Journal: the quests held as cards in its middle, the bounties taken as tiles at its right, and the
// timers dropping from its top when DFO's hourglass (in the account mark's place) or T is pressed. It reads the rules'
// draws and the last word of the character any room sent, so it reads the same at sea; it judges no rule.
import { make } from '../editor/dom.ts';
import type { GearState } from '../network/gearMessages.ts';
import { HOURGLASS_URL, bannerUrl } from '../plus/journalArt.ts';
import { ROLES } from '../plus/kit.ts';
import { roomNow } from '../sky/worldClock.ts';
import type { ThisWeek } from './activityWords.ts';
import { type BountyRow, bountyWords, payOf } from './bountyBoard.ts';
import { bountyCard, bountyTile, chooseTile, focusUnderPointer, moveAmongTiles } from './bountyTiles.ts';
import { iconImage } from './journalIcons.ts';
import { pressOf } from './gearDom.ts';
import { STEP_BACK } from './gearScreen.ts';
import { timersPanel } from './journalTimers.ts';
import {
  CARDS_A_PAGE,
  QUESTS_WRITTEN,
  type QuestCard,
  type WrittenQuest,
  bountyColumnOf,
  questCardsOf,
} from './journalWords.ts';
import { pagesOf } from './rosterRows.ts';

/** What the Journal reads: the day's and the week's activities, the last word of the character any room sent, and
 *  the quests written (the content's, unless a harness gives its own). */
export interface JournalSource {
  week(): ThisWeek | null;
  kept(): GearState | null;
  readonly written?: readonly WrittenQuest[];
}

export interface Journal {
  /** DFO's hourglass, which stands in the account mark's place on the Journal: pressed, it drops the timers. */
  readonly hourglass: HTMLButtonElement;
  /** The Journal's one page, brought up to date: its quests, its bounties and, while dropped, its timers. */
  page(): HTMLElement;
}

/** A quest's card: its banner, its name, a line of its tale, and its step's number and name, marked Done once all
 *  are; a name or tale its card cuts short is kept whole in its title. */
/** `shown` read as `words`: its own text hidden from a reader, and the words in its place hidden from sight. */
function heard(shown: HTMLElement, words: string): HTMLElement {
  const seen = make('span', shown.textContent ?? '');
  seen.setAttribute('aria-hidden', 'true');
  shown.replaceChildren(seen, make('span', words, 'journal-unseen'));
  return shown;
}

function questCard(card: QuestCard): HTMLElement {
  const item = make('li', '', `journal-card ${ROLES.panel}`);
  item.dataset['key'] = `quest-${card.id}`;
  const banner = make('img', '', 'journal-banner');
  [banner.src, banner.alt] = [bannerUrl(card.banner), ''];
  const words = make('div', '', 'journal-card-words');
  const name = make('b', card.name, 'journal-card-name');
  const tale = make('p', card.tale, 'journal-card-tale');
  [name.title, tale.title] = [card.name, card.tale];
  const step = make('p', '', 'journal-card-step');
  step.append(make('span', String(card.step), 'journal-step-number'), make('span', card.stepName));
  if (card.done) step.append(iconImage('taken', 'Done', 24));
  words.append(name, tale, step);
  item.append(banner, words);
  return item;
}

export function startJournal(source: JournalSource | null, now: () => number = roomNow): Journal {
  const node = make('div', '', 'journal');
  node.dataset['key'] = 'journal';
  const quests = make('section', '', 'journal-quests');
  const bounties = make('section', '', `journal-bounties ${ROLES.panel}`);
  const hourglass = make('button', '', 'gear-hourglass');
  hourglass.type = 'button';
  hourglass.dataset['key'] = 'hourglass';
  hourglass.setAttribute('aria-label', 'Timers');
  hourglass.title = 'Timers';
  hourglass.setAttribute('aria-controls', 'journal-timers');
  hourglass.setAttribute('aria-expanded', 'false');
  hourglass.hidden = true;
  const glass = make('img');
  [glass.src, glass.alt, glass.width, glass.height] = [HOURGLASS_URL, '', 27, 36];
  hourglass.append(glass);
  const drop = (down: boolean) => {
    const inPanel = panel.node.contains(document.activeElement);
    panel.node.hidden = !down;
    hourglass.setAttribute('aria-expanded', String(down));
    quests.inert = bounties.inert = down;
    if (down) {
      panel.list.scrollTop = 0;
      panel.close.focus();
    } else if (inPanel) hourglass.focus();
  };
  const panel = timersPanel(() => drop(false));
  hourglass.addEventListener('click', () => drop(panel.node.hidden !== false));
  node.append(quests, bounties, panel.node);
  node.addEventListener(STEP_BACK, (event) => {
    if (panel.node.hidden) return;
    event.preventDefault();
    drop(false);
  });
  addEventListener(
    'keydown',
    (event) => {
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      const held = event.ctrlKey || event.metaKey || event.altKey;
      if (event.key.toLowerCase() !== 't' || event.repeat || held || typing || !node.isConnected) return;
      event.preventDefault();
      hourglass.click();
    },
    { capture: true },
  );
  let [pageAt, built, chosen] = [0, '', -1];
  const keyed = new Map<string, HTMLElement>();
  /** Keeps a control by its key, so a rebuild finds the focus again. */
  const keep = <Kept extends HTMLElement>(element: Kept, key: string): Kept => {
    element.dataset['key'] = key;
    keyed.set(key, element);
    return element;
  };
  const buildQuests = (cards: readonly QuestCard[], written: number) => {
    const count = pagesOf(cards, CARDS_A_PAGE);
    pageAt = Math.min(pageAt, count - 1);
    const head = make('div', '', 'journal-quests-head');
    head.append(make('h3', 'Quests', 'journal-title'));
    quests.replaceChildren(head);
    if (cards.length === 0) {
      const said =
        written === 0
          ? 'No quests yet. The story’s missions and side quests come later.'
          : 'No quests held. Quests you take up are kept here.';
      // The two banners a quest wears stand over the line, resting, so the page reads as waiting rather than empty.
      const empty = make('div', '', 'journal-empty');
      const banners = make('div', '', 'journal-empty-banners');
      for (const key of ['story', 'side']) {
        const banner = make('img', '', 'journal-banner');
        [banner.src, banner.alt] = [bannerUrl(key), ''];
        banners.append(banner);
      }
      empty.append(banners, make('p', said, 'gear-hint'));
      quests.append(empty);
      return;
    }
    // How many are held, beside the title as the bounties' count is; the pages to turn, together at the right.
    head.append(heard(make('span', String(cards.length), `gear-chip ${ROLES.chip}`), `${cards.length} held`));
    const pager = make('div', '', 'journal-pager');
    const [back, next] = (
      [
        ['◂', -1, 'back', 'the page before', pageAt === 0],
        ['▸', 1, 'next', 'the next page', pageAt >= count - 1],
      ] as const
    ).map(([, step, key, words, none]) => {
      const turn = () => ((pageAt = Math.max(0, Math.min(count - 1, pageAt + step))), journal.page());
      const arrow = keep(pressOf('', turn), `quests-${key}`);
      arrow.append(iconImage(key, '', 24));
      arrow.setAttribute('aria-label', `Quests: ${words}`);
      arrow.setAttribute('aria-disabled', String(none));
      // One page has no other to turn to, so its arrows are not stops for Tab.
      if (count === 1) arrow.tabIndex = -1;
      return arrow;
    });
    const pageWords = heard(
      make('span', `${pageAt + 1} / ${count}`, 'journal-page-at'),
      `Page ${pageAt + 1} of ${count}`,
    );
    pager.append(...(back ? [back] : []), pageWords, ...(next ? [next] : []));
    head.append(pager);
    const list = make('ol', '', 'journal-cards');
    list.append(...cards.slice(pageAt * CARDS_A_PAGE, (pageAt + 1) * CARDS_A_PAGE).map(questCard));
    quests.append(list);
  };
  const buildBounties = (gear: GearState | null, day: number | null) => {
    const column = bountyColumnOf(gear, day);
    const head = make('div', '', 'journal-bounties-head');
    head.append(make('h3', 'Bounties', 'journal-title'));
    // How many are taken of the board's, once there is a board to count.
    if (column.slots > 0)
      head.append(make('span', `${column.taken.length} / ${column.slots}`, `gear-chip ${ROLES.chip}`));
    const grid = make('div', '', 'journal-tiles');
    const said = make('div', '', 'journal-bounty-said');
    said.dataset['key'] = 'bounty-said';
    said.setAttribute('aria-live', 'polite');
    const pay = gear ? payOf(gear) : { xp: 0, aurem: 0 };
    const tiles: HTMLElement[] = [];
    const show = (row: BountyRow) => {
      chosen = row.place;
      chooseTile(tiles, row.place);
      const word = row.state === 'held' ? null : make('p', '', 'bounty-card-state');
      word?.append(iconImage('taken', '', 24), make('span', bountyWords(row)));
      said.replaceChildren(bountyCard(row, pay, word));
    };
    for (const row of column.taken) {
      const tile = keep(bountyTile(row), `bounty-${row.place}`);
      for (const choosing of ['pointerenter', 'focus', 'click']) tile.addEventListener(choosing, () => show(row));
      focusUnderPointer(tile);
      tiles.push(tile);
      grid.append(tile);
    }
    for (let slot = column.taken.length; slot < column.slots; slot += 1)
      grid.append(make('span', '', `journal-slot ${ROLES.well}`));
    grid.addEventListener('keydown', (event) => moveAmongTiles(tiles, event as KeyboardEvent, 3));
    bounties.replaceChildren(head, grid, said);
    const first = column.taken.find((row) => row.place === chosen) ?? column.taken[0];
    if (first) show(first);
    else said.append(make('p', column.said ?? '', 'gear-hint'));
  };
  const journal: Journal = {
    hourglass,
    page() {
      if (!node.isConnected && !panel.node.hidden) {
        panel.node.hidden = true;
        hourglass.setAttribute('aria-expanded', 'false');
        quests.inert = bounties.inert = false;
      }
      const [week, gear] = [source?.week() ?? null, source?.kept() ?? null];
      const written = source?.written ?? QUESTS_WRITTEN;
      const cards = questCardsOf(gear?.quests ?? [], written);
      const day = week?.today.day ?? null;
      const column = [gear?.bounties, gear?.day, gear?.prologueDone, gear?.bountyXp, gear?.bountyAurem, day];
      const word = JSON.stringify([cards, pageAt, written.length, column]);
      if (word !== built) {
        built = word;
        const active = document.activeElement;
        const within = quests.contains(active) || bounties.contains(active);
        const focused = within && active instanceof HTMLElement ? active.dataset['key'] : undefined;
        keyed.clear();
        buildQuests(cards, written.length);
        buildBounties(gear, day);
        // A control gone (a tile as the day turns, an arrow as the last quest goes) leaves the focus on the hourglass.
        if (focused) (keyed.get(focused) ?? hourglass).focus();
      }
      panel.show(week, now());
      return node;
    },
  };
  return journal;
}
