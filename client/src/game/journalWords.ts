// The Journal's words, pure: a countdown and the moment it ends in the player's own clock, the houses' roads as
// cards, and the bounties taken. The page judges no rule: where the player stands on the roads comes from the gear,
// the words from the content the rules read (content/quests/quests.json) and the scenes the roads say.
import houses from '../../../content/story/houses.json' with { type: 'json' };
import type { GearState } from '../network/gearMessages.ts';
import type { QuestState } from '../network/questMessages.ts';
import { BANNER_KEYS } from '../plus/journalArt.ts';
import { type BountyRow, bountyRows } from './bountyBoard.ts';
import { QUESTS, type QuestLine } from './quests/questBook.ts';

/** A quest as its card shows it: every one of the roads is a story mission. */
export interface QuestCard {
  readonly id: string;
  readonly kind: string;
  /** The banner's key: one of its kind's chosen by its id. */
  readonly banner: string;
  readonly name: string;
  /** The first line its opening scene says, as a line of its tale. */
  readonly tale: string;
  /** Its task's number from 1, and its words; a quest done stands at its last. */
  readonly step: number;
  readonly stepName: string;
  readonly done: boolean;
}

/** The cards a page of the Journal holds: two columns of three. */
export const CARDS_A_PAGE = 6;

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const two = (count: number) => String(count).padStart(2, '0');

/** A countdown: days and hours from a day, then h:mm:ss from an hour, then m:ss; rounded up, never below 0:00. */
export function countdownWords(remaining: number): string {
  const left = Math.max(0, Math.ceil(remaining / SECOND) * SECOND);
  if (left >= DAY) return `${Math.floor(left / DAY)}d ${two(Math.floor((left % DAY) / HOUR))}h`;
  const [minutes, seconds] = [Math.floor((left % HOUR) / MINUTE), Math.floor((left % MINUTE) / SECOND)];
  if (left >= HOUR) return `${Math.floor(left / HOUR)}:${two(minutes)}:${two(seconds)}`;
  return `${minutes}:${two(seconds)}`;
}

/** A moment in the player's own clock: "18:05" today, "Sun 18:00" within six days, "Sun 18 Oct 18:00" past them. */
export function whenWords(moment: number, now: number): string {
  const date = new Date(moment);
  const time = `${two(date.getHours())}:${two(date.getMinutes())}`;
  const dayOf = (day: Date) => new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const daysAhead = Math.round((dayOf(date) - dayOf(new Date(now))) / DAY);
  const weekday = WEEKDAYS[date.getDay()] ?? '';
  if (daysAhead === 0) return time;
  if (daysAhead > 0 && daysAhead <= 6) return `${weekday} ${time}`;
  return `${weekday} ${date.getDate()} ${MONTHS[date.getMonth()] ?? ''} ${time}`;
}

const SCENES: Readonly<Record<string, readonly { readonly say: string }[]>> = houses.scenes;
/** The story missions' pennants, one to each road by its place in the roads' file, so no two roads wear the same. */
const PENNANTS = BANNER_KEYS.filter((key) => key.startsWith('story-'));

/** The quest at `road` (its place in the roads' file) as its card, at task `task` (from 0), or done. */
function cardOf(quest: QuestLine, road: number, task: number, done: boolean): QuestCard {
  const place = Math.min(task, quest.tasks.length - 1);
  return {
    id: quest.id,
    kind: 'story',
    banner: PENNANTS[road % PENNANTS.length] ?? 'story',
    name: quest.name,
    tale: SCENES[quest.begin]?.[0]?.say ?? '',
    step: place + 1,
    stepName: quest.tasks[place]?.task ?? '',
    done,
  };
}

/** The houses' roads as cards, in the file's order (the opening first): the quest walked at its task and each quest
 *  done, as the gear says them; none from a word not on the player's own character, which shows nothing. */
export function questCardsOf(state: QuestState | null | undefined, quests: readonly QuestLine[] = QUESTS) {
  if (!state || state.claimed === false) return [];
  return quests.flatMap((quest, place): QuestCard[] => {
    if (state.quest === place + 1) return [cardOf(quest, place, state.task, false)];
    return state.done[place] === 1 ? [cardOf(quest, place, quest.tasks.length - 1, true)] : [];
  });
}

/** The Journal's bounties: those taken in the board's order, the board's slots, and what to say where none shows. */
export interface BountyColumn {
  readonly taken: readonly BountyRow[];
  /** The board's places, six, as the gear carries them; none before a board is heard or while it is shut. */
  readonly slots: number;
  readonly said: string | null;
}

/** The bounties a player took from the day's board, as the Journal's column shows them on the page's `day`: none known
 *  while the gear is of another day's board, a word heard before the reset (at sea, sent only as the character
 *  changes). */
export function bountyColumnOf(gear: GearState | null, day: number | null = null): BountyColumn {
  if (!gear?.bounties || (day !== null && gear.day !== day))
    return { taken: [], slots: 0, said: 'Posted each day on the board in Overlook’s plaza.' };
  if (gear.prologueDone === false) return { taken: [], slots: 0, said: 'The bounty board opens after the prologue.' };
  const taken = bountyRows(gear).filter((row) => row.state !== 'open');
  const said = taken.length > 0 ? null : 'None taken yet. Take them at the bounty board in Overlook’s plaza.';
  return { taken, slots: gear.bounties.length, said };
}
