// The bounty board's screen in the menu, opened at its counter in Overlook's plaza, after Destiny's Bounty Tracker:
// the day's six as tiles in a row a kind, a bar counting to the next board, and the card of the tile chosen, each
// bounty taken and turned in there by the day of the board shown. Nothing here judges a rule: the room refuses what
// the board no longer offers.
import { make } from '../editor/dom.ts';
import { ASKS, type GearAsk, type GearState } from '../network/gearMessages.ts';
import { ROLES } from '../plus/kit.ts';
import { roomNow } from '../sky/worldClock.ts';
import { bountyCard, bountyTile, chooseTile, focusUnderPointer, moveAmongTiles } from './bountyTiles.ts';
import type { PageContext } from './characterPage.ts';
import { pressOf } from './gearDom.ts';
import { iconImage } from './journalIcons.ts';
import { countdownWords } from './journalWords.ts';

const SHUT = 'The bounty board opens after the prologue.';
/** The board's screen's name, as the menu's header shows it: no keeper keeps it. */
export const BOARD_TITLE = 'The Bounty Board';
const DAY_MS = 86_400_000;

export interface BountyRow {
  readonly place: number;
  readonly words: string;
  readonly name: string;
  /** Where it counts: 0 on land, 1 at sea, 2 in dungeons. */
  readonly pool: number;
  readonly count: number;
  readonly target: number;
  /** "12 / 30" while held, "Turned in" once paid, else empty. */
  readonly progress: string;
  readonly state: 'open' | 'held' | 'done' | 'paid';
  /** What its press asks, with the gear's day: Take on one not held, Turn in on one done; none otherwise or before
   *  the prologue. */
  readonly press: { readonly label: 'Take' | 'Turn in'; readonly ask: GearAsk } | null;
}

/** The day's bounties as they stand for the player, in the board's order; none from a room that sends no board. */
export function bountyRows(gear: GearState): readonly BountyRow[] {
  const open = gear.prologueDone !== false;
  const day = gear.day ?? 0;
  return (gear.bounties ?? []).map((bounty, place) => {
    const { count, target } = bounty;
    const state = bounty.paid ? 'paid' : !bounty.held ? 'open' : count >= target ? 'done' : 'held';
    const progress = state === 'paid' ? 'Turned in' : state === 'open' ? '' : `${count} / ${target}`;
    const press =
      !open || state === 'held' || state === 'paid'
        ? null
        : state === 'open'
          ? { label: 'Take' as const, ask: { kind: ASKS.takeBounty, node: place, item: day } }
          : { label: 'Turn in' as const, ask: { kind: ASKS.turnInBounty, node: place, item: day } };
    const { words, name, pool } = bounty;
    return { place, words, name, pool, count, target, progress, state, press };
  });
}

/** What each bounty pays the player now, at their level: its XP and its Aurem. */
export interface Pay {
  readonly xp: number;
  readonly aurem: number;
}

/** What each bounty pays the player now, as the room's word on their gear says it. */
export const payOf = (gear: GearState): Pay => ({ xp: gear.bountyXp ?? 0, aurem: gear.bountyAurem ?? 0 });

/** A bounty's state in words: its count while held, done, turned in, or not taken. */
export function bountyWords(row: BountyRow): string {
  const said = { open: 'Not taken', done: 'Done. Turn it in at the bounty board.', paid: 'Turned in' } as const;
  return row.state === 'held' ? row.progress : said[row.state];
}

/** The board's card before the prologue: its padlock, and why. */
function shutCard(): HTMLElement {
  const card = make('div', '', `bounty-card bounty-card-shut ${ROLES.panel}`);
  const said = make('p', '', 'bounty-card-state');
  said.append(iconImage('locked', '', 24), make('span', SHUT));
  card.append(said);
  return card;
}

/** The tile last chosen on the board, kept as the screen is built again for the room's word. */
let chosenPlace = 0;

/** The bounty board's screen: one line, the day's six in a row a kind, the bar counting to the next board, and the
 *  chosen tile's card with its press (E or a click), the arrows moving between tiles. */
export function boardPage(context: PageContext, resetAt: () => number | null, now = roomNow): HTMLElement {
  const page = make('div', '', `gear-board ${ROLES.panel}`);
  const { gear } = context;
  const rows = bountyRows(gear);
  const shut = gear.prologueDone === false;
  page.append(make('p', 'Bounties for XP and Aurem, posted each day.', 'gear-hint gear-board-line'));
  const grid = make('div', '', 'gear-board-grid');
  const card = make('div', '', 'gear-board-card');
  const pay = payOf(gear);
  const footOf = (row: BountyRow): HTMLElement => {
    if (!row.press) {
      const state = make('p', '', 'bounty-card-state');
      if (row.state === 'paid') state.append(iconImage('taken', '', 24), make('span', 'Turned in'));
      return state;
    }
    const { ask, label } = row.press;
    const press = pressOf(label, () => context.ask(ask), label === 'Turn in' ? 'primary' : 'button', 'E');
    press.setAttribute('aria-label', `${label}: ${row.name}`);
    return press;
  };
  const show = (row: BountyRow) => {
    chosenPlace = row.place;
    chooseTile(tiles, row.place);
    card.replaceChildren(shut ? shutCard() : bountyCard(row, pay, footOf(row)));
  };
  const tiles: HTMLElement[] = [];
  for (const pool of [0, 1, 2]) {
    const line = make('div', '', `gear-board-row bounty-pool-${pool}`);
    for (const row of rows.filter((one) => one.pool === pool)) {
      const tile = bountyTile(row);
      if (shut) tile.setAttribute('aria-disabled', 'true');
      tile.addEventListener('click', (event) => {
        show(row);
        // A double click's second click asks nothing more: the room has the first.
        if (!shut && row.press && !((event as MouseEvent).detail > 1)) context.ask(row.press.ask);
      });
      for (const chosen of ['pointerenter', 'focus']) tile.addEventListener(chosen, () => show(row));
      focusUnderPointer(tile);
      line.append(tile);
      tiles.push(tile);
    }
    grid.append(line);
  }
  grid.addEventListener('keydown', (event) => moveAmongTiles(tiles, event as KeyboardEvent));
  // The next board: the rising sun and the time left, the bar under them filling as the day goes.
  const bar = make('div', '', `gear-board-bar ${ROLES.track}`);
  const fill = make('div', '', ROLES.meter);
  bar.append(fill);
  const left = make('span', '', 'gear-board-time');
  const next = make('div', '', 'gear-board-next');
  next.setAttribute('role', 'timer');
  next.append(iconImage('dawn', '', 24), left);
  const write = () => {
    const reset = resetAt();
    const until = reset === null ? null : reset - now();
    left.textContent = until === null ? '' : countdownWords(until);
    next.setAttribute(
      'aria-label',
      until === null ? 'New bounties at the daily reset' : `New bounties in ${left.textContent}`,
    );
    fill.style.width = until === null ? '0%' : `${Math.round(100 * Math.min(1, Math.max(0, 1 - until / DAY_MS)))}%`;
  };
  write();
  const timer = setInterval(() => (page.isConnected ? write() : clearInterval(timer)), 1_000);
  const side = make('div', '', `gear-board-side${shut ? ' gear-board-shut' : ''}`);
  side.append(grid, next, bar);
  page.append(side, card);
  const first = rows.find((row) => row.place === chosenPlace) ?? rows[0];
  if (first) show(first);
  else card.append(make('p', 'Six a day, from the board in Overlook’s plaza.', 'gear-hint'));
  return page;
}
