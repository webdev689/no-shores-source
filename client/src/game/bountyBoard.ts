// The bounty board's screen in the menu, opened at its counter in Overlook's plaza, and This Week's Bounties: the
// day's six as the room's word gives them for the player, each taken and turned in at the board by the day of the
// board shown. Nothing here judges a rule: the room refuses what the board no longer offers.
import { make } from '../editor/dom.ts';
import { ASKS, type GearAsk, type GearState } from '../network/gearMessages.ts';
import { ROLES } from '../plus/kit.ts';
import type { WeekBounties } from './activityWords.ts';
import type { PageContext } from './characterPage.ts';
import { pressOf } from './gearDom.ts';

const SHUT = 'The bounty board opens after the prologue.';
/** The board's screen's name, as the menu's header shows it: no keeper keeps it. */
export const BOARD_TITLE = 'The Bounty Board';

export interface BountyRow {
  readonly place: number;
  readonly words: string;
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
    const state = bounty.paid ? 'paid' : !bounty.held ? 'open' : bounty.count >= bounty.target ? 'done' : 'held';
    const progress = state === 'paid' ? 'Turned in' : state === 'open' ? '' : `${bounty.count} / ${bounty.target}`;
    const press =
      !open || state === 'held' || state === 'paid'
        ? null
        : state === 'open'
          ? { label: 'Take' as const, ask: { kind: ASKS.takeBounty, node: place, item: day } }
          : { label: 'Turn in' as const, ask: { kind: ASKS.turnInBounty, node: place, item: day } };
    return { place, words: bounty.words, progress, state, press };
  });
}

/** What each bounty pays the player now, in words. */
export function payWords(gear: GearState): string {
  const [earned, aurem] = [gear.bountyXp ?? 0, gear.bountyAurem ?? 0];
  return `Each pays ${earned.toLocaleString()} XP and ${aurem.toLocaleString()} Aurem when turned in.`;
}

/** This Week's Bounties on the page's `day`: the same rows without their presses, or the board's shut line alone
 *  before the prologue; null before a room sent a board, or while the gear is of another day's board (at sea, the
 *  last land's gear is kept through the reset). */
export function weekBountiesOf(gear: GearState | null, day: number): WeekBounties | null {
  if (!gear?.bounties) return null;
  if (gear.prologueDone === false) return { rows: [], shut: SHUT };
  if (gear.day !== day) return null;
  const said = { open: 'Not taken', done: 'Done. Turn it in at the bounty board.', paid: 'Turned in' } as const;
  const rows = bountyRows(gear).map((row) => {
    const state = row.state === 'held' ? row.progress : said[row.state];
    return { name: row.words, about: '', state, shut: false };
  });
  return { rows, shut: null };
}

/** The bounty board's screen in the menu, laid as This Week is: today's bounties and what each pays, one line a
 *  bounty with its progress under its words and its press at its end, and when they end. */
export function boardPage(context: PageContext): HTMLElement {
  const page = make('div', '', `gear-week gear-board ${ROLES.panel}`);
  const { gear } = context;
  if (gear.prologueDone === false) {
    page.append(make('p', SHUT, 'gear-hint gear-empty'));
    return page;
  }
  const part = make('section', '', 'gear-week-part');
  part.append(make('h3', 'Today’s bounties', `gear-heading ${ROLES.rule}`), make('p', payWords(gear), 'gear-hint'));
  const rows = make('div', '', 'gear-week-rows');
  for (const row of bountyRows(gear)) {
    const line = make('div', '', `gear-week-row gear-bounty gear-bounty-${row.state}`);
    line.dataset['key'] = `bounty-${row.place}`;
    const named = make('span', '', 'gear-week-what');
    named.append(make('b', row.words));
    if (row.progress) named.append(make('span', row.progress, 'gear-hint'));
    line.append(named);
    const said = row.state === 'open' ? 'Not taken' : row.progress;
    line.setAttribute('aria-label', `${row.words} ${said}`);
    if (row.press) {
      const { ask, label } = row.press;
      const press = pressOf(label, () => context.ask(ask), label === 'Turn in' ? 'primary' : 'button');
      press.setAttribute('aria-label', `${label}: ${row.words}`);
      line.append(press);
    }
    rows.append(line);
  }
  part.append(rows, make('p', 'The board’s bounties end at the daily reset.', 'gear-hint'));
  page.append(part);
  return page;
}
