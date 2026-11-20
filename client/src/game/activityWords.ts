// What the Journal's timers and an entrance's card say, from what the rules say is on (`activitiesAt`), why the gates shut
// (`gatesAt`) and the character's record as their gear last carried it. Nothing here judges a rule: it only words
// what the rules gave, and reads "taken" against the drawn day and week.
import { type Activities, type Gates, type ModifierShown, eliteRun } from './activities.ts';
import type { ActivityRecord } from '../network/gearMessages.ts';
import type { Difficulty } from '../heldmap/heldMap.ts';
import { nodeRoom } from './rooms.ts';
import type { NodeInfo } from './worldData.ts';

/** The tiers in the rules' order, as the gear's record numbers them. */
export const TIERS: readonly Difficulty[] = ['normal', 'elite', 'abyss'];
/** Each tier's seas, so a screen says which Elite it means. */
const SEAS = ['Normal seas', 'Elite seas', 'Abyss seas'];

const DAY_PAYS = 'Once a day at each tier, on any island: a Vestige and a richer cache.';
const PLAIN_PAYS = 'It pays its kills and its cache.';
const ELITE_PAYS = 'Once a week: a Legendary Vestige and Essence.';
const ABYSS_PAYS = 'Once a week: a Legendary or Atheric Vestige, Essence, and the Abyss boon.';
const NEVER_MATCHED = 'Never matched. Bring your company.';
const BOON = 'Abyss boon: 25% more XP until the week turns.';

/** An island's band, or a fixed level: "Levels 3 to 6", "Level 26". */
export function levelWords([low, high]: readonly [number, number]): string {
  return low === high ? `Level ${low}` : `Levels ${low} to ${high}`;
}

/** A line of This Week: what it is, what is said of it, and this character's word on it: taken, not taken, or why it
 *  is shut (null where the character is not yet known, or the line has none). */
export interface WeekRow {
  readonly name: string;
  readonly about: string;
  readonly state: string | null;
  readonly shut: boolean;
}

/** One of the week's two, with its rules, modifiers and pay. */
export interface WeekDungeon extends WeekRow {
  readonly rules: readonly string[];
  readonly modifiers: readonly ModifierShown[];
  readonly pays: string;
}

export interface ThisWeek {
  readonly today: {
    /** The clock's day it words, as the gear's day counts it. */
    readonly day: number;
    /** When it resets, in Unix milliseconds. */
    readonly endsAt: number;
    readonly pays: string;
    readonly modifier: ModifierShown | null;
    readonly tiers: readonly WeekRow[];
    readonly dungeons: readonly WeekRow[];
  };
  readonly week: {
    readonly endsAt: number;
    readonly dungeons: readonly WeekDungeon[];
    readonly boon: string | null;
  };
}

/** The names the page knows places by: a patrol's dungeon's, and a node's. */
export interface Named {
  dungeon(patrol: string, number: number): string;
  place(id: string): string;
}

/** The modifiers of these keys, as the rules name and word them. */
const shown = (drawn: Activities, keys: readonly string[]): ModifierShown[] =>
  keys.flatMap((key) => (drawn.modifiers[key] ? [drawn.modifiers[key]] : []));

/** The line Abyss's rules add: the revives its company shares. */
const revivesWords = (drawn: Activities) => `${drawn.revives} revives for the company. A wipe starts the run over.`;

/** Whether this character cleared the dungeon of the day at tier `tier` today. */
const takenToday = (drawn: Activities, record: ActivityRecord | null, tier: number) =>
  record?.day === drawn.day && record.cleared.includes(tier);

/** Whether this character cleared the week's Elite or Abyss Dungeon this week. */
const takenThisWeek = (drawn: Activities, record: ActivityRecord | null, which: 'elite' | 'abyss') =>
  record?.week === drawn.week && record[which];

/** A line's state: the gate's reason first, then taken or not, or none with no record. */
function stateOf(shut: string | null, record: ActivityRecord | null, taken: boolean): string | null {
  if (shut !== null) return shut;
  if (record === null) return null;
  return taken ? 'Taken' : 'Not taken';
}

/** An island's band at a tier, as its foes are raised; none for a continent with no island. */
const bandAt = (drawn: Activities, continent: string, tier: number) => drawn.bands[continent]?.[tier] ?? null;

/** What the Journal's timers say: the day's dungeons, its modifier and each tier taken or not, then the week's two,
 *  each with when it resets. */
export function thisWeekOf(
  drawn: Activities,
  gates: Gates | null,
  record: ActivityRecord | null,
  named: Named,
): ThisWeek {
  const tiers = SEAS.map((name, tier) => {
    const shut = gates?.day[tier] ?? null;
    return { name, about: '', state: stateOf(shut, record, takenToday(drawn, record, tier)), shut: shut !== null };
  });
  const dungeons = drawn.ofTheDay.map(({ continent, patrol, number }) => {
    const band = bandAt(drawn, continent, 0);
    return { name: named.dungeon(patrol, number), about: band ? levelWords(band) : '', state: null, shut: false };
  });
  const weekly = (which: 'elite' | 'abyss'): WeekDungeon => {
    const weekOn = which === 'elite' ? drawn.weekElite : drawn.weekAbyss;
    const shut = (which === 'elite' ? gates?.weekElite : gates?.weekAbyss) ?? null;
    const words = which === 'elite' ? 'Elite Dungeon of the week' : 'Abyss Dungeon of the week';
    return {
      name: named.place(weekOn.place),
      about: `${words} · Level ${weekOn.level}`,
      state: stateOf(shut, record, takenThisWeek(drawn, record, which)),
      shut: shut !== null,
      rules: which === 'abyss' ? [revivesWords(drawn)] : [],
      modifiers: shown(drawn, weekOn.modifiers),
      pays: which === 'elite' ? ELITE_PAYS : ABYSS_PAYS,
    };
  };
  const boon = record?.week === drawn.week && record.boon ? BOON : null;
  return {
    today: {
      day: drawn.day,
      endsAt: (drawn.minute + drawn.untilDay) * 60_000,
      pays: DAY_PAYS,
      modifier: drawn.modifiers[drawn.dayModifier] ?? null,
      tiers,
      dungeons,
    },
    week: {
      endsAt: (drawn.minute + drawn.untilWeek) * 60_000,
      dungeons: [weekly('elite'), weekly('abyss')],
      boon,
    },
  };
}

/** Where a card is opened: the place the player stands in, its seas, the entrance's number and its dungeon's name. */
export interface AtEntrance {
  readonly node: NodeInfo;
  readonly seas: Difficulty;
  readonly number: number;
  readonly name: string;
}

/** What an entrance's card says of the run it opens. */
export interface EntranceCard {
  readonly name: string;
  readonly tier: string;
  readonly rules: readonly string[];
  readonly modifiers: readonly ModifierShown[];
  readonly pays: string;
  readonly shut: string | null;
  /** The run's base Find a Company matches (`nodeRoom`), or null where it matches none or is shut. */
  readonly finds: string | null;
}

/** An entrance's card: a patrol's dungeon at its seas, or an Elite Dungeon's run as `eliteRun` picks it. */
export function entranceCardOf(
  entrance: AtEntrance,
  drawn: Activities,
  gates: Gates | null,
  record: ActivityRecord | null,
): EntranceCard {
  const { node, seas, number, name } = entrance;
  const tierWords = (words: string, tier: number) => {
    const band = bandAt(drawn, node.continent, tier);
    return band ? `${words} · ${levelWords(band)}` : words;
  };
  if (node.kind !== 'dungeon') {
    const tier = Math.max(0, TIERS.indexOf(seas));
    const ofTheDay = drawn.ofTheDay.some((one) => one.patrol === node.id && one.number === number);
    const dayPays = takenToday(drawn, record, tier) ? `Taken today. ${PLAIN_PAYS}` : DAY_PAYS;
    return {
      name,
      tier: tierWords(SEAS[tier] ?? '', tier),
      rules: seas === 'abyss' ? [revivesWords(drawn)] : [],
      modifiers: ofTheDay && tier > 0 ? shown(drawn, [drawn.dayModifier]) : [],
      pays: ofTheDay ? dayPays : PLAIN_PAYS,
      shut: gates?.day[tier] ?? null,
      finds: null,
    };
  }
  const run = eliteRun(node.id, seas, drawn);
  if (run.seas === 'normal') {
    const shut = gates?.eliteDungeon ?? null;
    const finds = shut === null ? nodeRoom(node, 'normal') : null;
    return { name, tier: tierWords(run.words, 0), rules: [], modifiers: [], pays: PLAIN_PAYS, shut, finds };
  }
  const which = run.seas === 'elite' ? 'elite' : 'abyss';
  const weekOn = which === 'elite' ? drawn.weekElite : drawn.weekAbyss;
  const shut = (which === 'elite' ? gates?.weekElite : gates?.weekAbyss) ?? null;
  const pays = which === 'elite' ? ELITE_PAYS : ABYSS_PAYS;
  return {
    name,
    tier: `${run.words} · Level ${weekOn.level}`,
    rules: which === 'abyss' ? [revivesWords(drawn), NEVER_MATCHED] : [],
    modifiers: shown(drawn, weekOn.modifiers),
    pays: takenThisWeek(drawn, record, which) ? `Taken this week. ${PLAIN_PAYS}` : pays,
    shut,
    finds: which === 'elite' && shut === null ? nodeRoom(node, 'elite') : null,
  };
}
