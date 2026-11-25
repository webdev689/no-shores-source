// The timers panel that drops from the Journal's top, after DFO's timers window, drawn by the game and led by icons:
// Today and This week, each head its icon and the one countdown to its reset in the player's own clock, then Later.
// Each row is its icon, its name and its marks (the seas of each tier and how this character stands with them, the
// modifiers, what a run pays, the Abyss's rules). The words a row stands for are read to a screen reader as it takes
// the focus, and the panel's foot says them for whatever is pointed at or focused; nothing is written twice.
import { ISLANDS } from './hudLaw.ts';
import { lampWords } from './passages/passageMap.ts';
import type { Child, Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import type { KeyedModifier, Reward, Standing, ThisWeek, WeekDungeon, WeekRow } from './activityWords.ts';
import { INK, type Sizes, glyphNode, pressNode, words } from './gearNodes.ts';
import { type IconName, iconNode, modifierIcon } from './journalIcons.ts';
import { countdownWords, whenWords } from './journalWords.ts';

/** A mark: its drawn parts, a few words or a number beside them where it has them, what it stands for in full, and
 *  whether it stands in a small well of its own (a tier's seas, a modifier, a rule, a level). */
interface Mark {
  readonly drawn: readonly Node[];
  readonly short?: string;
  readonly words: string;
  readonly boxed?: boolean;
}

/** A row of the panel: its id, icon and name, its lines of marks, and the words it stands for. */
interface Timer {
  readonly id: string;
  readonly icon: IconName;
  readonly name: string;
  readonly lines: readonly (readonly Mark[])[];
  readonly words: string;
  readonly isles?: ThisWeek['today']['dungeons'];
}

/** A lamp's mark, gold once lit and grey while cold. */
const COLD_LAMP = { c: '#8a8a86', d: '#b4b4ae', e: '#6a6a66' };
const lampMark = (lit: boolean, words: string): Mark => ({ drawn: [icon('lamp', lit ? undefined : COLD_LAMP)], words });

/** The passages' lamps of each island with passages: today, whether its day's lamp has paid; this week, which of
 *  its four lamps are lit. */
function lampRows(week: ThisWeek, when: 'day' | 'week'): Timer[] {
  return Object.entries(ISLANDS).map(([island, name]) => {
    const held = week.lamps?.find((each) => each.island === island);
    if (when === 'day')
      return {
        id: `day-lamp-${island}`,
        icon: 'lamp',
        name: `${name}’s lamp of the day`,
        lines: [[lampMark(held?.dayLamp ?? false, held?.dayLamp ? 'Lit today.' : 'Not lit today.')]],
        words: `The first lamp lit today in ${name}’s passages pays a dungeon of the day’s clear and a sure Vestige.`,
      };
    const lit = held?.lamps ?? [];
    return {
      id: `lamps-${island}`,
      icon: 'lamp',
      name: `${name}’s lamps`,
      lines: [
        [1, 2, 3, 4].map((lamp) =>
          lampMark(lit.includes(lamp), `${lampWords(lamp)}, ${lit.includes(lamp) ? 'lit' : 'not lit'} this week.`),
        ),
      ],
      words: `The first time each week each lamp in ${name}’s passages is lit, it pays its week’s lamp.`,
    };
  });
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
/** The panel's own ground, a step above the dimmed page, and its brass rule along its top. */
const PANEL_GROUND = '#12151b';
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

const icon = (name: IconName, tones?: Readonly<Record<string, string>>) => iconNode(name, MARK_ICON, tones);

/** One thing a run pays: its Vestige in its rarity, its Essence, its cache or the boon. */
function rewardMark(reward: Reward): Mark {
  const rarity = VESTIGE_RARITY[reward];
  const drawn =
    rarity !== undefined
      ? glyphNode('vestige', MARK_ICON, rarity)
      : reward === 'essence'
        ? glyphNode('weapon-essence', MARK_ICON)
        : icon(reward === 'cache' ? 'cache' : 'boon');
  return { drawn: [drawn], words: `Pays once: ${REWARD_WORDS[reward]}.` };
}

/** A modifier's icon `side` pixels square, Burn's flame in its Art's colours. */
export function modifierNode(modifier: KeyedModifier, side = MARK_ICON): Node {
  const drawn = modifierIcon(modifier.key);
  return iconNode(drawn?.name ?? 'breach', side, drawn?.tones);
}

/** A mark's part grown with the words beside it: an icon drawn at the marks' size `side` pixels square, words at
 *  `size`. */
function sized(node: Node, side: number, size: number): Node {
  if (node.width === MARK_ICON) return { ...node, width: side, height: side };
  return node.text ? { ...node, text: { ...node.text, size } } : node;
}

/** A modifier: its icon alone; its name and what it does are its words. */
const modifierMark = (modifier: KeyedModifier): Mark => ({
  drawn: [modifierNode(modifier)],
  words: `${modifier.name}: ${modifier.words}`,
  boxed: true,
});

/** How this character stands with a line, as its mark, beside the seas it is of and any modifier on them; none where
 *  it has nothing to show. */
function standingMarks(row: WeekRow, seas?: IconName, modifier?: KeyedModifier | null): Mark[] {
  const shown = row.standing ? STANDINGS[row.standing] : undefined;
  if (!seas && !shown) return [];
  const said = row.state ? `${row.name}: ${row.state}` : row.name;
  const drawn: Node[] = [{ ...icon(seas ?? shown ?? 'locked'), opacity: seas && row.standing === 'shut' ? 0.7 : 1 }];
  if (seas && shown) drawn.push(icon(shown));
  if (modifier) drawn.push(modifierNode(modifier));
  const more = modifier ? ` At Elite and Abyss seas, ${modifier.name}: ${modifier.words}` : '';
  return [{ drawn, words: `${said}.${more}`, boxed: true }];
}

/** One of the week's two's lines of marks: its level and this character's word on it; then the Abyss's revives and
 *  wipe, its modifiers, and what it pays. */
function weekLines(dungeon: WeekDungeon): Mark[][] {
  const level: Mark = {
    drawn: [words('Lv', 1, INK.faint), words(String(dungeon.level), 1, INK.brassLit)],
    words: dungeon.about,
    boxed: true,
  };
  const abyss: Mark[] =
    dungeon.revives === null
      ? []
      : [
          {
            drawn: [icon('revive')],
            short: `${dungeon.revives}`,
            words: `${dungeon.revives} revives for the company.`,
            boxed: true,
          },
          { drawn: [icon('wipe')], words: 'A wipe starts the run over.', boxed: true },
        ];
  const queued: Mark = { drawn: [words('Playlist', 1, INK.faint)], words: dungeon.queued, boxed: true };
  return [
    [level, ...standingMarks(dungeon), queued],
    [...abyss, ...dungeon.modifiers.map(modifierMark), ...dungeon.rewards.map(rewardMark)],
  ];
}

/** The words a week's dungeon stands for, in full. */
const weekWords = (dungeon: WeekDungeon): string =>
  [dungeon.about, dungeon.state, ...dungeon.rules, ...dungeon.modifiers.map((one) => `${one.name}: ${one.words}`)]
    .concat(dungeon.pays, dungeon.queued)
    .filter(Boolean)
    .join(' ');

/** The panel's groups, from the rules' word on the day and the week. */
function groupsOf(week: ThisWeek): readonly Group[] {
  const { today } = week;
  const weekly = week.week.dungeons.map((dungeon): Timer => ({
    id: `week-${dungeon.kind}`,
    icon: dungeon.kind === 'elite' ? 'elite-dungeon' : 'abyss-dungeon',
    name: dungeon.name,
    lines: weekLines(dungeon),
    words: weekWords(dungeon),
  }));
  const modifier = today.modifier ? ` At Elite and Abyss seas, ${today.modifier.name}: ${today.modifier.words}` : '';
  const boon: Timer[] = week.week.boon
    ? [
        {
          id: 'boon',
          icon: 'boon',
          name: 'Abyss boon',
          lines: [[{ drawn: [icon('xp')], short: '+25%', words: week.week.boon }]],
          words: week.week.boon,
        },
      ]
    : [];
  const tiers = today.tiers.flatMap((row, tier) => standingMarks(row, SEAS[tier], tier > 0 ? today.modifier : null));
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
          lines: [[...tiers, ...today.rewards.map(rewardMark)]],
          words: `${today.pays}${modifier}`,
          isles: today.dungeons,
        },
        {
          id: 'bounties',
          icon: 'bounty',
          name: 'Bounties',
          lines: [],
          words: 'Posted each day on the board in Overlook’s plaza.',
        },
        ...lampRows(week, 'day'),
      ],
    },
    {
      id: 'week',
      name: 'This week',
      reset: { icon: 'week', endsAt: week.week.endsAt, words: `The week turns at this time, ${local}` },
      rows: [
        ...weekly,
        ...boon,
        ...lampRows(week, 'week'),
        {
          id: 'breaches',
          icon: 'breach',
          name: 'Breaches',
          lines: [],
          words:
            'The Drowned Vale, at Normal and Hard: each encounter pays once a week at each tier. A company launches it from the Playlist beside any port.',
        },
      ],
    },
  ];
}

/** Whether the pointer stands in `id`'s box as last laid. */
function pointedAt(ui: Interface, id: string): boolean {
  const [pointer, box] = [ui.pointerAt, ui.boxOf(id)];
  return (
    pointer !== null &&
    box !== null &&
    pointer.x >= box.x &&
    pointer.y >= box.y &&
    pointer.x < box.x + box.width &&
    pointer.y < box.y + box.height
  );
}

/** The timers panel at `now`, kept within `most` pixels wide and `tallest` high: its head with Close (T), its groups'
 *  heads each with its reset's countdown and when it comes, each group's rows, and at its foot the words of whatever
 *  is pointed at or focused. */
export function timersNode(
  ui: Interface,
  week: ThisWeek | null,
  now: number,
  sizes: Sizes,
  most: number,
  tallest: number,
): Node {
  const said = new Map<string, string>();
  const say = (id: string, words: string) => (said.set(id, words), id);
  const size = sizes.label;
  const side = MARK_ICON + (size - 1) * 12;
  // Too narrow for a head's countdown beside its name, or the isles' three columns, as on a phone.
  const narrow = most < 480;
  const markNode = (mark: Mark, id: string): Node => ({
    id: say(id, mark.words),
    gap: 4,
    alignY: 'center',
    minHeight: side + 4,
    ...(mark.boxed && { padding: [1, 6, 1, 2], fill: 'rgba(6,7,9,0.55)' }),
    children: [
      ...mark.drawn.map((part) => sized(part, side, size)),
      mark.short !== undefined && words(mark.short, size, mark.boxed ? INK.brassLit : INK.faint),
    ],
  });
  const isleNode = (row: WeekRow, id: string): Node => ({
    id: say(id, `${row.name}: ${row.about}${row.yours ? ' Your level is in its band.' : ''}`),
    width: 'grow',
    gap: 6,
    padding: [2, 6],
    ...(row.yours && { fill: 'rgba(243,207,134,0.08)' }),
    children: [
      { width: 'grow', ...words(row.name, size, row.yours ? INK.brassLit : INK.word, { ellipsis: true }) },
      row.band && words(`${row.band[0]}–${row.band[1]}`, size, INK.faint),
    ],
  });
  /** The isles in columns read down, each row ruled under, as DFO's timers list them. */
  const islesNode = (isles: readonly WeekRow[]): Node => {
    const columns = narrow ? 1 : 3;
    const tall = Math.ceil(isles.length / columns);
    return {
      width: 'grow',
      children: Array.from({ length: columns }, (_unused, column): Node => ({
        width: `${Math.floor(100 / columns)}%`,
        padding: [0, column < columns - 1 ? 12 : 0, 0, 0],
        direction: 'column',
        children: isles
          .slice(column * tall, (column + 1) * tall)
          .flatMap((row, nth): Child[] => [
            isleNode(row, `isle-${column * tall + nth}`),
            { width: 'grow', height: 1, fill: 'rgba(163,152,128,0.12)' },
          ]),
      })),
    };
  };
  const rowNode = (timer: Timer): Node => {
    const id = say(`timer-row-${timer.id}`, `${timer.name}. ${timer.words}`);
    const lit = ui.hovered(id) || (ui.focused(id) && ui.keyFocused);
    const lines: Child[] = timer.lines
      .filter((line) => line.length > 0)
      .map((line, place) => ({
        gap: 8,
        wrap: true,
        alignY: 'center',
        children: line.map((mark, nth) => markNode(mark, `mark-${timer.id}-${place}-${nth}`)),
      }));
    const isles = timer.isles ?? [];
    return {
      id,
      focusable: true,
      label: said.get(id) ?? timer.name,
      width: 'grow',
      gap: 14,
      padding: [10, 8],
      ...(lit && { fill: 'rgba(243,207,134,0.035)' }),
      children: [
        {
          role: 'well',
          width: 44,
          height: 44,
          fill: '#06070a',
          alignX: 'center',
          alignY: 'center',
          children: [iconNode(timer.icon, ROW_ICON)],
        },
        {
          width: 'grow',
          direction: 'column',
          gap: 8,
          padding: [3, 0, 0, 0],
          children: [
            { width: 'grow', ...words(timer.name, size, INK.word, { ellipsis: true }) },
            ...lines,
            isles.length > 0 && islesNode(isles),
          ],
        },
      ],
    };
  };
  const headNode = (group: Group): Node => {
    const reset = group.reset;
    const name: Node = {
      width: 'grow',
      gap: 8,
      alignY: 'center',
      children: [
        reset && iconNode(reset.icon, side),
        { width: 'grow', ...words(group.name.toUpperCase(), size, INK.brass, { tracking: 3 }) },
      ],
    };
    const clock: Child = reset && {
      id: say(`timer-${group.id}-reset`, reset.words),
      gap: 10,
      alignY: 'center',
      children: [
        words(countdownWords(reset.endsAt - now), size + 1, INK.gain),
        words(whenWords(reset.endsAt, now), size, INK.faint),
      ],
    };
    // Narrow, the countdown stands under its head's name rather than past the panel's edge.
    return {
      width: 'grow',
      direction: narrow ? 'column' : 'row',
      gap: 8,
      alignY: 'center',
      padding: [6, 0],
      children: [name, clock],
    };
  };
  const list: Child[] = week
    ? groupsOf(week).map((group, place) => ({
        width: 'grow',
        direction: 'column',
        padding: [place === 0 ? 0 : 12, 0, 0, 0],
        children: [
          headNode(group),
          { width: 'grow', height: 1, fill: 'rgba(192,138,62,0.35)' },
          ...group.rows.flatMap((row, nth): Child[] => [
            nth > 0 && { width: 'grow', height: 1, fill: 'rgba(163,152,128,0.12)' },
            rowNode(row),
          ]),
        ],
      }))
    : [{ padding: [24, 0], text: { words: 'Loading…', colour: INK.faint } }];
  // Pointed at first, a mark over the row it stands on; else the row the pointer or the focus is on.
  const sayer =
    [...said.keys()].find((id) => !id.startsWith('timer-row-') && pointedAt(ui, id)) ??
    [...said.keys()].find((id) => ui.hovered(id) || ui.focused(id));
  return {
    id: 'journal-timers',
    modal: true,
    width: 'grow',
    maxWidth: most,
    maxHeight: Math.max(0, tallest),
    direction: 'column',
    padding: [14, 20, 0, 20],
    fill: PANEL_GROUND,
    outline: { width: 2, colour: INK.stoneHi },
    children: [
      { width: 'grow', height: 2, fill: INK.brass, float: { to: 'parent', anchor: [0, 0], at: [0, 0] } },
      {
        width: 'grow',
        gap: 12,
        alignY: 'center',
        padding: [0, 0, 6, 0],
        children: [
          { width: 'grow', ...words('TIMERS', 2, INK.word, { tracking: 3 }) },
          pressNode('timers-close', 'Close', 'button', 'T', sizes.label, { label: 'Close the timers' }),
        ],
      },
      {
        id: 'timers-list',
        width: 'grow',
        height: 'grow',
        direction: 'column',
        scroll: true,
        padding: [0, 4, 8, 0],
        children: list,
      },
      {
        id: 'timers-said',
        width: 'grow',
        minHeight: 44,
        padding: [10, 0, 12, 0],
        children: [{ width: 'grow', text: { words: sayer ? (said.get(sayer) ?? '') : '', colour: INK.faint } }],
      },
    ],
  };
}
