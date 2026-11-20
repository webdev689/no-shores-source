// The timers panel that drops from the Journal's top, after DFO's timers window: the day's and the week's resets and
// what is on, grouped Today, This week and Later, each counting down in the player's own clock; and the lines of
// This Week it is built from.
import { make } from '../editor/dom.ts';
import { ROLES } from '../plus/kit.ts';
import type { ThisWeek, WeekDungeon, WeekRow } from './activityWords.ts';
import { pressOf } from './gearDom.ts';
import { countdownWords, whenWords } from './journalWords.ts';
import './journal.css';

/** A line of the timers: its name, what is said of it, and this character's word on it. */
function weekRow(row: WeekRow): HTMLElement {
  const line = make('div', '', `gear-week-row${row.shut ? ' gear-week-shut' : ''}`);
  const named = make('span', '', 'gear-week-what');
  named.append(make('b', row.name));
  if (row.about) named.append(make('span', row.about, 'gear-hint'));
  line.append(named);
  if (row.state !== null) line.append(make('span', row.state, 'gear-week-state'));
  return line;
}

/** One of the week's two: its line, then its rules, its modifiers and its pay. */
function weekDungeon(dungeon: WeekDungeon): HTMLElement {
  const part = make('div', '', 'gear-week-dungeon');
  part.append(weekRow(dungeon));
  for (const rule of dungeon.rules) part.append(make('p', rule, 'gear-week-rule'));
  for (const modifier of dungeon.modifiers) part.append(modifierLine(modifier.name, modifier.words));
  part.append(make('p', dungeon.pays, 'gear-hint'));
  return part;
}

/** A modifier's name and what it does. */
function modifierLine(name: string, words: string): HTMLElement {
  const line = make('p', '', 'gear-week-modifier');
  line.append(make('b', name), make('span', words, 'gear-hint'));
  return line;
}

/** The timers panel that drops from the Journal's top, after DFO's timers window. */
export interface TimersPanel {
  readonly node: HTMLElement;
  /** The press in its head that takes it up, where the focus goes as it drops. */
  readonly close: HTMLButtonElement;
  /** Brings it to `week` at `now`: its rows built again only for a new word, each countdown rewritten as it changes. */
  show(week: ThisWeek | null, now: number): void;
}

/** A row's countdown: its cells, when it ends, and whether it is a reset ("at") or a row under way ("ends"). */
interface Count {
  readonly count: HTMLElement;
  readonly when: HTMLElement;
  readonly endsAt: number;
  readonly reset: boolean;
}

/** What a row of the panel is: its id, kind, words and details, and when it ends (none for a row still to come). */
interface Timer {
  readonly id: string;
  readonly kind: 'reset' | 'day' | 'week' | 'later';
  readonly text: HTMLElement;
  readonly endsAt: number | null;
}

/** A row's words: its name, and what is said of it. */
function named(name: string, said = ''): HTMLElement {
  const text = make('div', '', 'journal-timer-text');
  text.append(make('b', name, 'journal-timer-name'));
  if (said) text.append(make('p', said, 'gear-hint'));
  return text;
}

/** The panel's rows by group, from This Week's model. */
function groupsOf(week: ThisWeek): readonly (readonly [string, readonly Timer[]])[] {
  const { today } = week;
  const day = named('Dungeon of the day', today.pays);
  if (today.modifier) {
    day.append(make('p', 'At Elite and Abyss seas', 'gear-week-label'));
    day.append(modifierLine(today.modifier.name, today.modifier.words));
  }
  const tiers = make('div', '', 'gear-week-rows');
  tiers.append(...today.tiers.map(weekRow));
  const dungeons = make('div', '', 'gear-week-rows');
  dungeons.append(...today.dungeons.map(weekRow));
  day.append(tiers, dungeons);
  const [elite, abyss] = week.week.dungeons;
  const weekly = (id: string, dungeon: WeekDungeon | undefined): Timer[] =>
    dungeon ? [{ id, kind: 'week', text: weekDungeon(dungeon), endsAt: week.week.endsAt }] : [];
  const boon = week.week.boon;
  return [
    [
      'Today',
      [
        { id: 'day-reset', kind: 'reset', text: named('Daily reset'), endsAt: today.endsAt },
        { id: 'day', kind: 'day', text: day, endsAt: today.endsAt },
        {
          id: 'bounties',
          kind: 'day',
          text: named('Bounties', 'Six a day, from the board in Overlook’s plaza.'),
          endsAt: today.endsAt,
        },
      ],
    ],
    [
      'This week',
      [
        { id: 'week-reset', kind: 'reset', text: named('Weekly reset'), endsAt: week.week.endsAt },
        ...weekly('week-elite', elite),
        ...weekly('week-abyss', abyss),
        ...(boon ? [{ id: 'boon', kind: 'week' as const, text: named(boon), endsAt: week.week.endsAt }] : []),
      ],
    ],
    ['Later', [{ id: 'breaches', kind: 'later', text: named('Breaches'), endsAt: null }]],
  ];
}

export function timersPanel(close: () => void): TimersPanel {
  const node = make('section', '', `journal-timers ${ROLES.panel}`);
  node.id = 'journal-timers';
  node.dataset['key'] = 'timers';
  node.setAttribute('role', 'region');
  node.setAttribute('aria-labelledby', 'journal-timers-title');
  node.hidden = true;
  const head = make('div', '', 'journal-timers-head');
  const title = make('h3', 'Timers', 'journal-timers-title');
  title.id = 'journal-timers-title';
  const closer = pressOf('Close', close);
  closer.dataset['key'] = 'timers-close';
  closer.setAttribute('aria-label', 'Close the timers');
  head.append(title, closer);
  const list = make('div', '', 'journal-timers-list');
  list.tabIndex = 0;
  node.append(head, make('p', 'Times are shown in your local time.', 'gear-hint journal-timers-lead'), list);
  let word: string | null = null;
  let counts: Count[] = [];
  const rowOf = ({ id, kind, text, endsAt }: Timer): HTMLElement => {
    const live = kind === 'day' || kind === 'week';
    const row = make('div', '', `journal-timer-row journal-timer-${kind}${live ? ' journal-timer-live' : ''}`);
    const clock = make('div', '', 'journal-timer-clock');
    if (endsAt === null) clock.append(make('span', 'Later', `gear-chip ${ROLES.chip}`));
    else {
      if (live) clock.append(make('span', 'Now', 'journal-timer-now'));
      const count = make('span', '', 'journal-timer-count');
      count.dataset['key'] = `timer-${id}`;
      const when = make('span', '', 'journal-timer-when');
      clock.append(count, when);
      counts.push({ count, when, endsAt, reset: kind === 'reset' });
    }
    row.append(text, clock);
    return row;
  };
  const build = (week: ThisWeek | null) => {
    counts = [];
    if (!week) {
      list.replaceChildren(make('p', 'Loading…', 'gear-hint gear-empty'));
      return;
    }
    list.replaceChildren(
      ...groupsOf(week).flatMap(([group, timers]) => [
        make('h4', group, `journal-timers-group ${ROLES.rule}`),
        ...timers.map(rowOf),
      ]),
    );
  };
  const write = (cell: HTMLElement, text: string) => {
    if (cell.textContent !== text) cell.textContent = text;
  };
  return {
    node,
    close: closer,
    show(week, now) {
      const next = JSON.stringify(week);
      if (next !== word) build(week);
      word = next;
      for (const { count, when, endsAt, reset } of counts) {
        write(count, countdownWords(endsAt - now));
        write(when, `${reset ? 'at' : 'ends'} ${whenWords(endsAt, now)}`);
      }
    },
  };
}
