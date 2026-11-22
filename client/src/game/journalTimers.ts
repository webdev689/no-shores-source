// The timers panel that drops from the Journal's top, after DFO's timers window, drawn by the game and led by icons:
// Today and This week, each head its icon and the one countdown to its reset in the player's own clock, then Later.
// Each row is its icon, its name and its marks (the seas of each tier and how this character stands with them, the
// modifiers, what a run pays, the Abyss's rules). The words a row stands for are read to a screen reader as it takes
// the focus, and the panel's foot says them for whatever is pointed at or focused; nothing is written twice.
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

/** A modifier's icon, Burn's flame in its Art's colours. */
function modifierNode(modifier: KeyedModifier): Node {
  const drawn = modifierIcon(modifier.key);
  return icon(drawn?.name ?? 'breach', drawn?.tones);
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
  return [
    [level, ...standingMarks(dungeon)],
    [...abyss, ...dungeon.modifiers.map(modifierMark), ...dungeon.rewards.map(rewardMark)],
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
          words: 'Six a day, from the board in Overlook’s plaza: two on land, two at sea, two in dungeons.',
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
      rows: [
        {
          id: 'breaches',
          icon: 'breach',
          name: 'Breaches',
          lines: [[{ drawn: [icon('locked')], words: 'Not open yet.' }]],
          words: 'Breaches come later.',
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

/** The timers panel at `now`, kept within `most` pixels wide: its head with Close (T), its groups' heads each with its
 *  reset's countdown and when it comes, each group's rows, and at its foot the words of whatever is pointed at or
 *  focused. */
export function timersNode(ui: Interface, week: ThisWeek | null, now: number, sizes: Sizes, most: number): Node {
  const said = new Map<string, string>();
  const say = (id: string, words: string) => (said.set(id, words), id);
  const markNode = (mark: Mark, id: string): Node => ({
    id: say(id, mark.words),
    gap: 4,
    alignY: 'center',
    minHeight: 28,
    ...(mark.boxed && { padding: [1, 6, 1, 2], fill: 'rgba(6,7,9,0.55)' }),
    children: [...mark.drawn, mark.short !== undefined && words(mark.short, 1, mark.boxed ? INK.brassLit : INK.faint)],
  });
  const isleNode = (row: WeekRow, id: string): Node => ({
    id: say(id, `${row.name}: ${row.about}${row.yours ? ' Your level is in its band.' : ''}`),
    gap: 6,
    padding: [1, 6],
    ...(row.yours && { fill: 'rgba(243,207,134,0.08)' }),
    children: [
      words(row.name, 1, row.yours ? INK.brassLit : INK.word),
      row.band && words(`${row.band[0]}–${row.band[1]}`, 1, INK.faint),
    ],
  });
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
            words(timer.name, sizes.label + 1, INK.word),
            ...lines,
            isles.length > 0 && {
              width: 'grow',
              gap: 4,
              wrap: true,
              children: isles.map((row, place) => isleNode(row, `isle-${place}`)),
            },
          ],
        },
      ],
    };
  };
  const headNode = (group: Group): Node => {
    const reset = group.reset;
    return {
      width: 'grow',
      gap: 8,
      alignY: 'center',
      padding: [6, 0],
      children: [
        reset && icon(reset.icon),
        { width: 'grow', ...words(group.name.toUpperCase(), 1, INK.brass, { tracking: 3 }) },
        reset && {
          id: say(`timer-${group.id}-reset`, reset.words),
          gap: 10,
          alignY: 'center',
          children: [
            words(countdownWords(reset.endsAt - now), 2, INK.gain),
            words(whenWords(reset.endsAt, now), 1, INK.faint),
          ],
        },
      ],
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
    maxHeight: Math.max(0, ui.size.height - 160),
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
          { width: 'grow', ...words('Timers', 2, INK.word) },
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
