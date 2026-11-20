// The Journal's words, pure: a countdown and the moment it ends in the player's own clock, the quests held as cards,
// and the bounties taken. The page judges no rule: the step comes from the gear, the words from the content the
// rules read.
import written from '../../../content/gear/quests.json' with { type: 'json' };
import type { GearQuest, GearState } from '../network/gearMessages.ts';
import { type BountyRow, bountyRows } from './bountyBoard.ts';

/** A quest as content/gear/quests.json writes it: as much of it as its card reads. */
export interface WrittenQuest {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly tale: string;
  readonly banner?: string;
  readonly steps: readonly { readonly name: string }[];
}

const { quests }: { readonly quests: readonly WrittenQuest[] } = written;

/** The quests written, read with the page from the file the rules read. */
export const QUESTS_WRITTEN: readonly WrittenQuest[] = quests;

/** A quest held, as its card shows it. */
export interface QuestCard {
  readonly id: string;
  readonly kind: string;
  /** The banner's key: its own, else its kind's. */
  readonly banner: string;
  readonly name: string;
  readonly tale: string;
  /** Its step's number from 1, and its name. */
  readonly step: number;
  readonly stepName: string;
  /** Every step done, waiting to be finished. */
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

/** The kinds' order on the page: story missions, then side quests, then any kind to come. */
const KINDS = ['story', 'side'];
const kindPlace = (kind: string) => (KINDS.includes(kind) ? KINDS.indexOf(kind) : KINDS.length);

/** The quests held as cards: story missions first, then side quests, then any kind to come, each as written; a quest
 *  this page's content lacks is left out, and a step past its last stands at its last. */
export function questCardsOf(held: readonly GearQuest[], writtenQuests = QUESTS_WRITTEN): readonly QuestCard[] {
  const byId = new Map(held.map((quest) => [quest.id, quest]));
  return writtenQuests
    .filter((quest) => byId.has(quest.id) && quest.steps.length > 0)
    .sort((one, other) => kindPlace(one.kind) - kindPlace(other.kind))
    .map((quest) => {
      const heldAt = byId.get(quest.id) ?? { step: 0, done: false };
      const place = Math.min(heldAt.step, quest.steps.length - 1);
      const { id, kind, name, tale } = quest;
      const stepName = quest.steps[place]?.name ?? '';
      return { id, kind, banner: quest.banner ?? kind, name, tale, step: place + 1, stepName, done: heldAt.done };
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
 *  while the gear is of another day's board (at sea, the last land's gear is kept through the reset). */
export function bountyColumnOf(gear: GearState | null, day: number | null = null): BountyColumn {
  if (!gear?.bounties || (day !== null && gear.day !== day))
    return { taken: [], slots: 0, said: 'Six a day, from the board in Overlook’s plaza.' };
  if (gear.prologueDone === false) return { taken: [], slots: 0, said: 'The bounty board opens after the prologue.' };
  const taken = bountyRows(gear).filter((row) => row.state !== 'open');
  const said = taken.length > 0 ? null : 'None taken yet. Take them at the bounty board in Overlook’s plaza.';
  return { taken, slots: gear.bounties.length, said };
}
