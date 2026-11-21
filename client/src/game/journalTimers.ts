// The timers panel that drops from the Journal's top, after DFO's timers window, led by icons: Today and This week,
// each head its icon and the one countdown to its reset in the player's own clock, then Later. Each row is its icon,
// its name and its marks (the seas of each tier and how this character stands with them, the modifiers, what a run
// pays, the Abyss's rules). The words a mark stands for are read to a screen reader, and the panel's foot says them
// for whatever is pointed at or focused; nothing is written twice.
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

/** A reset's countdown: its cells, and when it comes. */
interface Count {
  readonly count: HTMLElement;
  readonly when: HTMLElement;
  readonly endsAt: number;
}

/** A row of the panel: its id, icon and name, its marks, and the words it stands for. */
interface Timer {
  readonly id: string;
  readonly icon: IconName;
  readonly name: string;
  readonly marks: readonly HTMLElement[];
  readonly words: string;
}

/** A group of rows: its id, name, the icon and reset its head shows (none for Later), and its rows. */
interface Group {
  readonly id: string;
  readonly name: string;
  readonly reset: { readonly icon: IconName; readonly endsAt: number; readonly words: string } | null;
  readonly rows: readonly Timer[];
}

/** A row's icon's size, and a mark's: three times and twice the icons' twelve. */
const ROW_ICON = 36;
const MARK_ICON = 24;
const SEAS: readonly IconName[] = ['seas-normal', 'seas-elite', 'seas-abyss'];
/** The mark of how a line stands; a line open to this character and not yet taken needs none. */
const STANDINGS: Readonly<Partial<Record<Exclude<Standing, null>, IconName>>> = { taken: 'taken', shut: 'locked' };
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

/** Something with words of its own to say at the panel's foot, and to a reader. */
const saying = <Sayer extends HTMLElement>(element: Sayer, words: string): Sayer => {
  element.dataset['say'] = words;
  return element;
};

/** A mark: its icon (or a gear glyph), a few words or a number beside it where it has them, and what it stands for in
 *  full. */
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

/** What a run pays, a mark each, held together after its rules. */
const rewardMarks = (rewards: readonly Reward[]): HTMLElement[] => {
  if (rewards.length === 0) return [];
  const group = make('span', '', 'journal-rewards');
  group.append(...rewards.map(rewardMark));
  return [group];
};

/** A modifier's icon, Burn's flame in its Art's colours. */
function modifierImage(modifier: KeyedModifier): HTMLImageElement {
  const drawn = modifierIcon(modifier.key);
  return iconImage(drawn?.name ?? 'breach', '', MARK_ICON, drawn?.tones);
}

/** A modifier: its icon alone, as on the day's seas; its name and what it does are its words. */
function modifierMark(modifier: KeyedModifier): HTMLElement {
  const chip = mark(modifierImage(modifier), `${modifier.name}: ${modifier.words}`);
  chip.classList.add('journal-modifier');
  return chip;
}

/** How this character stands with a line, as its mark, beside the seas it is of and any modifier on them; none where
 *  it has nothing to show. */
function standingMark(row: WeekRow, seas?: IconName, modifier?: KeyedModifier | null): HTMLElement[] {
  const shown = row.standing ? STANDINGS[row.standing] : undefined;
  if (!seas && !shown) return [];
  const words = row.state ? `${row.name}: ${row.state}` : row.name;
  const chip = mark(iconImage(seas ?? shown ?? 'locked', '', MARK_ICON), words);
  chip.classList.add('journal-standing', `journal-${row.standing ?? 'unknown'}`);
  if (seas && shown) chip.append(iconImage(shown, '', MARK_ICON));
  if (modifier) {
    const flame = saying(
      make('span', '', 'journal-on-seas'),
      `At Elite and Abyss seas, ${modifier.name}: ${modifier.words}`,
    );
    flame.append(modifierImage(modifier));
    chip.append(flame);
    // Inside the chip's picture a reader hears the chip's name alone, so the modifier's words are part of it.
    chip.setAttribute('aria-label', `${words}. ${flame.dataset['say'] ?? ''}`);
  }
  return [chip];
}

/** A line of marks under a row's name; none without marks. */
function marksLine(...marks: HTMLElement[]): HTMLElement[] {
  if (marks.length === 0) return [];
  const line = make('div', '', 'journal-marks');
  line.append(...marks);
  return [line];
}

/** The dungeon of the day's marks: each tier's seas and this character's word on it, the day's modifier on the Elite
 *  and Abyss seas, what it pays, and each island's dungeon with its levels. */
function dayMarks(today: ThisWeek['today']): HTMLElement[] {
  const tiers = today.tiers.flatMap((row, tier) => standingMark(row, SEAS[tier], tier > 0 ? today.modifier : null));
  const isles = make('ul', '', 'journal-isles');
  for (const row of today.dungeons) {
    const isle = saying(
      make('li', '', `journal-isle${row.yours ? ' journal-isle-yours' : ''}`),
      `${row.name}: ${row.about}${row.yours ? ' Your level is in its band.' : ''}`,
    );
    isle.append(make('span', row.name, 'journal-isle-name'));
    if (row.band) isle.append(make('span', `${row.band[0]}–${row.band[1]}`, 'journal-isle-band'));
    isles.append(isle);
  }
  return [...marksLine(...tiers, ...rewardMarks(today.rewards)), ...(today.dungeons.length > 0 ? [isles] : [])];
}

/** One of the week's two's marks: its level and this character's word on it, the Abyss's revives and wipe, its
 *  modifiers, and what it pays. */
function weekMarks(dungeon: WeekDungeon): HTMLElement[] {
  const level = saying(make('span', '', 'journal-mark journal-level'), dungeon.about);
  level.append(make('span', 'Lv', 'journal-level-words'), make('b', String(dungeon.level)));
  const abyss =
    dungeon.revives === null
      ? []
      : [
          mark(iconImage('revive', '', MARK_ICON), `${dungeon.revives} revives for the company.`, `${dungeon.revives}`),
          mark(iconImage('wipe', '', MARK_ICON), 'A wipe starts the run over.'),
        ];
  return [
    ...marksLine(level, ...standingMark(dungeon)),
    ...marksLine(...abyss, ...dungeon.modifiers.map(modifierMark), ...rewardMarks(dungeon.rewards)),
  ];
}

/** The words a week's dungeon stands for, in full. */
const weekWords = (dungeon: WeekDungeon): string =>
  [dungeon.about, dungeon.state, ...dungeon.rules, ...dungeon.modifiers.map((one) => `${one.name}: ${one.words}`)]
    .concat(dungeon.pays)
    .filter(Boolean)
    .join(' ');

/** The panel's groups, from the rules' word on the day and the week. */
function groupsOf(week: ThisWeek): readonly Group[] {
  const { today } = week;
  const weekly = week.week.dungeons.map((dungeon): Timer => ({
    id: `week-${dungeon.kind}`,
    icon: dungeon.kind === 'elite' ? 'elite-dungeon' : 'abyss-dungeon',
    name: dungeon.name,
    marks: weekMarks(dungeon),
    words: weekWords(dungeon),
  }));
  const modifier = today.modifier ? ` At Elite and Abyss seas, ${today.modifier.name}: ${today.modifier.words}` : '';
  const boonMark = mark(iconImage('xp', '', MARK_ICON), week.week.boon ?? '', '+25%');
  const boon: Timer[] = week.week.boon
    ? [{ id: 'boon', icon: 'boon', name: 'Abyss boon', marks: marksLine(boonMark), words: week.week.boon }]
    : [];
  const sixWords = 'Six a day, from the board in Overlook’s plaza: two on land, two at sea, two in dungeons.';
  const local = 'in your local time.';
  return [
    {
      id: 'day',
      name: 'Today',
      reset: { icon: 'dawn', endsAt: today.endsAt, words: `The day turns at this time, ${local}` },
      rows: [
        {
          id: 'day',
          icon: 'dungeon',
          name: 'Dungeon of the day',
          marks: dayMarks(today),
          words: `${today.pays}${modifier}`,
        },
        {
          id: 'bounties',
          icon: 'bounty',
          name: 'Bounties',
          marks: [],
          words: sixWords,
        },
      ],
    },
    {
      id: 'week',
      name: 'This week',
      reset: { icon: 'week', endsAt: week.week.endsAt, words: `The week turns at this time, ${local}` },
      rows: [...weekly, ...boon],
    },
    {
      id: 'later',
      name: 'Later',
      reset: null,
      rows: [{ id: 'breaches', icon: 'breach', name: 'Breaches', marks: [], words: 'Breaches come later.' }],
    },
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
  const said = make('p', '', 'journal-timers-said');
  said.dataset['key'] = 'timers-said';
  said.setAttribute('aria-live', 'polite');
  node.append(head, list, said);
  // The pointer gone, the foot says what the focus rests on, or nothing.
  list.addEventListener('pointerleave', () => {
    const active = document.activeElement;
    said.textContent = list.contains(active) && active instanceof HTMLElement ? (active.dataset['say'] ?? '') : '';
  });
  let [word, counts, rows] = [null as string | null, [] as Count[], [] as HTMLElement[]];
  /** Says `sayer`'s words at the foot whenever it is pointed at or focused. */
  const heard = (sayer: HTMLElement) => {
    for (const event of ['pointerenter', 'focus'])
      sayer.addEventListener(event, () => (said.textContent = sayer.dataset['say'] ?? ''));
  };
  const headOf = ({ id, name, reset }: Group): HTMLElement => {
    const heading = make('h4', '', `journal-timers-group ${ROLES.rule}`);
    heading.dataset['key'] = `timers-group-${id}`;
    if (!reset) {
      heading.append(make('span', name, 'journal-timers-group-name'));
      return heading;
    }
    heading.append(iconImage(reset.icon, '', MARK_ICON), make('span', name, 'journal-timers-group-name'));
    const clock = saying(make('span', '', 'journal-timers-clock'), reset.words);
    const count = make('span', '', 'journal-timer-count');
    count.dataset['key'] = `timer-${id}-reset`;
    const when = make('span', '', 'journal-timer-when');
    clock.append(count, when);
    heard(clock);
    heading.append(clock);
    counts.push({ count, when, endsAt: reset.endsAt });
    return heading;
  };
  const rowOf = ({ id, icon, name, marks, words }: Timer): HTMLElement => {
    const row = saying(make('div', '', `journal-timer-row journal-timer-${id}`), `${name}. ${words}`);
    row.dataset['key'] = `timer-row-${id}`;
    row.tabIndex = rows.length === 0 ? 0 : -1;
    rows.push(row);
    // A row focused by a click is the one Tab comes back to.
    row.addEventListener('focus', () => {
      for (const one of rows) one.tabIndex = one === row ? 0 : -1;
    });
    const well = make('span', '', `journal-timer-well ${ROLES.well}`);
    well.append(iconImage(icon, '', ROW_ICON));
    const text = make('div', '', 'journal-timer-text');
    text.append(make('b', name, 'journal-timer-name'), ...marks);
    for (const sayer of [row, ...marks.flatMap(within)]) if (sayer.dataset['say']) heard(sayer);
    row.append(well, text);
    return row;
  };
  const build = (week: ThisWeek | null) => {
    const active = document.activeElement;
    const focused = list.contains(active) && active instanceof HTMLElement ? active.dataset['key'] : undefined;
    [counts, rows] = [[], []];
    if (!week) {
      list.replaceChildren(make('p', 'Loading…', 'gear-hint gear-empty'));
      return;
    }
    list.replaceChildren(...groupsOf(week).flatMap((group) => [headOf(group), ...group.rows.map(rowOf)]));
    // A row focused as the rows are written again (the day turning, a level, a clear) keeps the focus.
    const again = rows.find((row) => row.dataset['key'] === focused);
    if (!again) return;
    for (const row of rows) row.tabIndex = row === again ? 0 : -1;
    again.focus();
  };
  // The arrows step between the rows, each a stop, so the keys hear every row's words; Tab rests on one of them.
  list.addEventListener('keydown', (event) => {
    const keyed = event as KeyboardEvent;
    if (keyed.ctrlKey || keyed.altKey || keyed.metaKey) return;
    const step = { arrowdown: 1, arrowup: -1 }[keyed.key.toLowerCase()];
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
      for (const { count, when, endsAt } of counts) {
        write(count, countdownWords(endsAt - now));
        write(when, whenWords(endsAt, now));
      }
    },
  };
}
