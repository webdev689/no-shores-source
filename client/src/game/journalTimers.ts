// The timers panel that drops from the Journal's top, after DFO's timers window, led by icons: the day's and the
// week's resets and what is on, grouped Today, This week and Later. Each row is its icon, its name, its marks (the seas
// of each tier and how this character stands with them, the modifiers, what a run pays, the Abyss's rules) and its
// countdown in the player's own clock. The words a mark stands for are its alt text, and the panel's foot says them
// for whatever is pointed at or focused.
import { make } from '../editor/dom.ts';
import { ROLES } from '../plus/kit.ts';
import type { KeyedModifier, Reward, Standing, ThisWeek, WeekDungeon, WeekRow } from './activityWords.ts';
import { glyphImage, pressOf } from './gearDom.ts';
import { type IconName, iconImage, modifierIcon } from './journalIcons.ts';
import { countdownWords, whenWords } from './journalWords.ts';
import './journal.css';

/** The timers panel that drops from the Journal's top, after DFO's timers window. */
export interface TimersPanel {
  readonly node: HTMLElement;
  /** The press in its head that takes it up, where the focus goes as it drops. */
  readonly close: HTMLButtonElement;
  /** The list that scrolls under its head. */
  readonly list: HTMLElement;
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

/** A row of the panel: its id, kind, icon and name, its marks and the words it stands for, and when it ends (none
 *  for a row still to come). */
interface Timer {
  readonly id: string;
  readonly kind: 'reset' | 'day' | 'week' | 'later';
  readonly icon: IconName;
  readonly name: string;
  readonly marks: readonly HTMLElement[];
  readonly words: string;
  readonly endsAt: number | null;
}

/** A row's icon's size, and a mark's: three times and twice the icons' twelve. */
const ROW_ICON = 36;
const MARK_ICON = 24;
/** What the panel's foot says while nothing is pointed at or focused. */
const RESTING = 'Times are shown in your local time.';
const SEAS: readonly IconName[] = ['seas-normal', 'seas-elite', 'seas-abyss'];
const STANDINGS: Readonly<Record<Exclude<Standing, null>, IconName>> = { taken: 'taken', open: 'open', shut: 'locked' };
const REWARD_WORDS: Readonly<Record<Reward, string>> = {
  vestige: 'a Vestige',
  'legendary-vestige': 'a Legendary Vestige',
  'atheric-vestige': 'a Legendary or Atheric Vestige',
  cache: 'a richer cache',
  essence: 'Essence',
  boon: 'the Abyss boon',
};
/** A Vestige's rarity as the gear glyphs number them: Normal, Legendary, Atheric. */
const VESTIGE_RARITY: Readonly<Partial<Record<Reward, number>>> = {
  vestige: 0,
  'legendary-vestige': 3,
  'atheric-vestige': 4,
};

/** An element and every element within it. */
const within = (element: HTMLElement): HTMLElement[] => [
  element,
  ...[...(element.children as unknown as Iterable<HTMLElement>)].flatMap(within),
];

/** Something with words of its own to say at the panel's foot. */
const saying = <Sayer extends HTMLElement>(element: Sayer, words: string): Sayer => {
  element.dataset['say'] = words;
  return element;
};

/** A mark: its icon (or a gear glyph), a few words or a number beside it where it has them, and what it stands for in
 *  full, said at the foot and to a reader. */
function mark(icon: HTMLImageElement, words: string, short = ''): HTMLElement {
  const chip = saying(make('span', '', 'journal-mark'), words);
  chip.setAttribute('role', 'img');
  chip.setAttribute('aria-label', words);
  icon.alt = '';
  chip.append(icon);
  if (short) chip.append(make('span', short, 'journal-mark-words'));
  return chip;
}

/** A gear glyph at a mark's size. */
function glyph(image: HTMLImageElement): HTMLImageElement {
  [image.width, image.height] = [MARK_ICON, MARK_ICON];
  image.classList.add('journal-icon');
  return image;
}

/** What a run pays, a mark each, held together apart from its rules. */
const rewardMarks = (rewards: readonly Reward[]): HTMLElement[] => {
  if (rewards.length === 0) return [];
  const group = make('span', '', 'journal-rewards');
  group.append(...rewards.map(rewardMark));
  return [group];
};

/** One thing a run pays: its Vestige in its rarity, its Essence, its cache or the boon. */
const rewardMark = (reward: Reward): HTMLElement => {
  const rarity = VESTIGE_RARITY[reward];
  const image =
    rarity !== undefined
      ? glyph(glyphImage('vestige', rarity))
      : reward === 'essence'
        ? glyph(glyphImage('weapon-essence'))
        : iconImage(reward === 'cache' ? 'cache' : 'boon', '', MARK_ICON);
  return mark(image, `Pays once: ${REWARD_WORDS[reward]}.`);
};

/** A modifier: its icon and its name, what it does said in full. */
function modifierMark(modifier: KeyedModifier, where = ''): HTMLElement {
  const drawn = modifierIcon(modifier.key);
  const icon = iconImage(drawn?.name ?? 'breach', '', MARK_ICON, drawn?.tones);
  const chip = mark(icon, `${where}${modifier.name}: ${modifier.words}`, modifier.name);
  chip.classList.add('journal-modifier');
  return chip;
}

/** How this character stands with a line, as its mark beside the seas it is of; none where it has neither. */
function standingMark(row: WeekRow, seas?: IconName): HTMLElement[] {
  if (row.standing === null && !seas) return [];
  const words = row.state ? `${row.name}: ${row.state}` : row.name;
  const chip = mark(iconImage(seas ?? STANDINGS[row.standing ?? 'open'], '', MARK_ICON), words);
  chip.classList.add('journal-standing', `journal-${row.standing ?? 'unknown'}`);
  if (seas && row.standing) chip.append(iconImage(STANDINGS[row.standing], '', MARK_ICON));
  return [chip];
}

/** A line of marks under a row's name; none without marks. */
function marksLine(...marks: HTMLElement[]): HTMLElement[] {
  if (marks.length === 0) return [];
  const line = make('div', '', 'journal-marks');
  line.append(...marks);
  return [line];
}

/** The dungeon of the day's marks: each tier's seas and this character's word on it; the modifier at Elite and Abyss
 *  seas, and what it pays; and each island's dungeon with its levels. */
function dayMarks(today: ThisWeek['today']): HTMLElement[] {
  const tiers = today.tiers.flatMap((row, tier) => standingMark(row, SEAS[tier]));
  const modifier = today.modifier ? [modifierMark(today.modifier, 'At Elite and Abyss seas, ')] : [];
  for (const seas of today.modifier ? SEAS.slice(1).reverse() : []) {
    const shown = iconImage(seas, '', MARK_ICON);
    shown.classList.add('journal-modifier-seas');
    modifier[0]?.prepend(shown);
  }
  const isles = make('ul', '', 'journal-isles');
  for (const row of today.dungeons) {
    const isle = saying(make('li', '', 'journal-isle'), `${row.name}: ${row.about}`);
    isle.append(make('span', row.name, 'journal-isle-name'));
    if (row.band) isle.append(make('span', `${row.band[0]}–${row.band[1]}`, 'journal-isle-band'));
    isles.append(isle);
  }
  return [
    ...marksLine(...tiers),
    ...marksLine(...modifier, ...rewardMarks(today.rewards)),
    ...(today.dungeons.length > 0 ? [isles] : []),
  ];
}

/** One of the week's two's marks: its level and this character's word on it, the Abyss's revives and wipe, its
 *  modifiers, and what it pays. */
function weekMarks(dungeon: WeekDungeon): HTMLElement[] {
  const level = saying(make('span', `Lv ${dungeon.level}`, 'journal-mark journal-level'), dungeon.about);
  const abyss =
    dungeon.revives === null
      ? []
      : [
          mark(iconImage('revive', '', MARK_ICON), `${dungeon.revives} revives for the company.`, `${dungeon.revives}`),
          mark(iconImage('wipe', '', MARK_ICON), 'A wipe starts the run over.'),
        ];
  return [
    ...marksLine(level, ...standingMark(dungeon)),
    ...marksLine(...abyss, ...dungeon.modifiers.map((one) => modifierMark(one)), ...rewardMarks(dungeon.rewards)),
  ];
}

/** The words a week's dungeon stands for, in full. */
const weekWords = (dungeon: WeekDungeon): string =>
  [dungeon.about, dungeon.state, ...dungeon.rules, ...dungeon.modifiers.map((one) => `${one.name}: ${one.words}`)]
    .concat(dungeon.pays)
    .filter(Boolean)
    .join(' ');

/** The panel's rows by group, from the rules' word on the day and the week. */
function groupsOf(week: ThisWeek): readonly (readonly [string, readonly Timer[]])[] {
  const { today } = week;
  const weekly = week.week.dungeons.map((dungeon): Timer => ({
    id: `week-${dungeon.kind}`,
    kind: 'week',
    icon: dungeon.kind === 'elite' ? 'elite-dungeon' : 'abyss-dungeon',
    name: dungeon.name,
    marks: weekMarks(dungeon),
    words: weekWords(dungeon),
    endsAt: week.week.endsAt,
  }));
  const modifier = today.modifier ? ` At Elite and Abyss seas, ${today.modifier.name}: ${today.modifier.words}` : '';
  const boon: Timer[] = week.week.boon
    ? [
        {
          id: 'boon',
          kind: 'week',
          icon: 'boon',
          name: 'Abyss boon',
          marks: [],
          words: week.week.boon,
          endsAt: week.week.endsAt,
        },
      ]
    : [];
  const bounties = 'Six a day, from the board in Overlook’s plaza.';
  return [
    [
      'Today',
      [
        {
          id: 'day-reset',
          kind: 'reset',
          icon: 'dawn',
          name: 'Daily reset',
          marks: [],
          words: '',
          endsAt: today.endsAt,
        },
        {
          id: 'day',
          kind: 'day',
          icon: 'dungeon',
          name: 'Dungeon of the day',
          marks: dayMarks(today),
          words: `${today.pays}${modifier}`,
          endsAt: today.endsAt,
        },
        {
          id: 'bounties',
          kind: 'day',
          icon: 'bounty',
          name: 'Bounties',
          marks: [],
          words: bounties,
          endsAt: today.endsAt,
        },
      ],
    ],
    [
      'This week',
      [
        {
          id: 'week-reset',
          kind: 'reset',
          icon: 'week',
          name: 'Weekly reset',
          marks: [],
          words: '',
          endsAt: week.week.endsAt,
        },
        ...weekly,
        ...boon,
      ],
    ],
    [
      'Later',
      [{ id: 'breaches', kind: 'later', icon: 'breach', name: 'Breaches', marks: [], words: '', endsAt: null }],
    ],
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
  const said = make('p', RESTING, 'journal-timers-said');
  said.dataset['key'] = 'timers-said';
  said.setAttribute('aria-live', 'polite');
  node.append(head, list, said);
  list.addEventListener('pointerleave', () => (said.textContent = RESTING));
  let [word, counts, rows] = [null as string | null, [] as Count[], [] as HTMLElement[]];
  /** Says `sayer`'s words at the foot whenever it is pointed at or focused. */
  const heard = (sayer: HTMLElement) => {
    for (const event of ['pointerenter', 'focus'])
      sayer.addEventListener(event, () => (said.textContent = sayer.dataset['say'] || RESTING));
  };
  const rowOf = ({ id, kind, icon, name, marks, words, endsAt }: Timer): HTMLElement => {
    const live = kind === 'day' || kind === 'week';
    const row = make('div', '', `journal-timer-row journal-timer-${kind}${live ? ' journal-timer-live' : ''}`);
    saying(row, words ? `${name}. ${words}` : name);
    row.dataset['key'] = `timer-row-${id}`;
    row.tabIndex = rows.length === 0 ? 0 : -1;
    rows.push(row);
    const well = make('span', '', `journal-timer-well ${ROLES.well}`);
    well.append(iconImage(icon, '', ROW_ICON));
    const text = make('div', '', 'journal-timer-text');
    text.append(make('b', name, 'journal-timer-name'), ...marks);
    for (const sayer of marks.flatMap(within)) if (sayer.dataset['say']) heard(sayer);
    heard(row);
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
    row.append(well, text, clock);
    return row;
  };
  const build = (week: ThisWeek | null) => {
    [counts, rows] = [[], []];
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
  // The arrows step between the rows, each a stop, so the keys hear every row's words; Tab rests on one of them.
  list.addEventListener('keydown', (event) => {
    const step = { arrowdown: 1, arrowup: -1 }[(event as KeyboardEvent).key.toLowerCase()];
    const focused = rows.findIndex((row) => row === document.activeElement);
    const next = step === undefined ? undefined : rows[Math.max(0, Math.min(rows.length - 1, focused + step))];
    if (!next) return;
    event.preventDefault();
    for (const row of rows) row.tabIndex = row === next ? 0 : -1;
    next.focus();
  });
  const write = (cell: HTMLElement, text: string) => {
    if (cell.textContent !== text) cell.textContent = text;
  };
  return {
    node,
    close: closer,
    list,
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
