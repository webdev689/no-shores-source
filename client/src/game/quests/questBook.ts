// The houses' roads as the page reads them (content/quests/quests.json): what the tracker shows of the quest walked,
// the talk goal a counter answers, the goal the HUD marks and the nodes the held map marks, and the scenes each step
// of a road says. The rules judge every goal and give every reward; the page only shows.
import book from '../../../../content/quests/quests.json' with { type: 'json' };
import type { QuestState } from '../../network/gearMessages.ts';
import type { Quest as Tracked, Step } from '../tasks.ts';

/** A goal as the file writes it: its tracker words, its count (1 when left out), its kind, and what its kind names:
 *  the counter a `talk` goal speaks at and its scene, the node and place a `reach`, `kill` or `enter` goal names. */
export interface Goal {
  readonly kind: string;
  readonly text: string;
  readonly count?: number;
  readonly to?: string;
  readonly scene?: string;
  readonly node?: string;
  readonly place?: string;
}

/** A task: its tracker words, the scenes said as it begins and as it is done, and its goals. */
export interface Task {
  readonly task: string;
  readonly start?: string;
  readonly end?: string;
  readonly goals: readonly Goal[];
}

/** A quest: its name, its house (0 the opening), the scene said as it begins, and its tasks in order. */
export interface QuestLine {
  readonly id: string;
  readonly name: string;
  readonly faction: number;
  readonly begin: string;
  readonly tasks: readonly Task[];
}

/** The quests in the file's order, the opening first: the gear message counts them from 1. */
export const QUESTS: readonly QuestLine[] = (book as unknown as { quests: QuestLine[] }).quests;

/** The number ask 64 names each counter a `talk` goal speaks at by (protocol's gear_wire). */
export const COUNTERS: Readonly<Record<string, number>> = {
  stormcallers: 1,
  lamplighters: 2,
  veiled: 3,
  mage: 10,
  vault: 11,
  armorsmith: 12,
  weaponsmith: 13,
  tailor: 14,
  tack: 15,
  harbourmaster: 16,
};

/** How many a goal asks for. */
const most = (goal: Goal): number => goal.count ?? 1;

/** The quest walked and its task now, with that task's goals' counts; none for no quest or one the file lacks. */
function walked(state: QuestState | null | undefined): { quest: QuestLine; task: Task; counts: number[] } | null {
  const quest = state ? QUESTS[state.quest - 1] : undefined;
  const task = quest?.tasks[state?.task ?? 0];
  if (!state || !quest || !task) return null;
  return { quest, task, counts: task.goals.map((_goal, index) => state.counts[index] ?? 0) };
}

/** Whether the goal at `index` of the task now is met. */
const met = (goal: Goal, count: number): boolean => count >= most(goal);

/** What the tracker shows of the quest walked: its name, its task, and each goal's words with what is left of its
 *  count, ticked once met; none while no quest is walked. */
export function trackedOf(state: QuestState | null | undefined): Tracked | null {
  const now = walked(state);
  if (!now) return null;
  const steps = now.task.goals.map((goal, index): Step => {
    const left = Math.max(0, most(goal) - (now.counts[index] ?? 0));
    return { text: goal.text, done: left === 0, ...(most(goal) > 1 && left > 0 ? { count: left } : {}) };
  });
  return { name: now.quest.name, task: now.task.task, steps };
}

/** The unmet `talk` goal of the task now that the counter `counter` (a station's kind) answers, if one does. */
export function talkAt(state: QuestState | null | undefined, counter: string): Goal | null {
  const now = walked(state);
  const open = (goal: Goal, index: number) =>
    goal.kind === 'talk' && goal.to === counter && !met(goal, now?.counts[index] ?? 0);
  return now?.task.goals.find(open) ?? null;
}

/** The goal the HUD's mark stands for: the task's first unmet goal with a place, as the room finds `quest_at`. */
export function markedGoal(state: QuestState | null | undefined): Goal | null {
  const now = walked(state);
  return now?.task.goals.find((goal, index) => goal.place !== undefined && !met(goal, now.counts[index] ?? 0)) ?? null;
}

/** The nodes the task's goals name, each once, which the held map marks. */
export function goalNodes(state: QuestState | null | undefined): string[] {
  const named = walked(state)?.task.goals.flatMap((goal) => (goal.node === undefined ? [] : [goal.node])) ?? [];
  return [...new Set(named)];
}

/** Where a character stands on the roads, as far as their lines go: the quest walked and its task, and each quest
 *  done by place. */
export interface Walked {
  readonly quest: number;
  readonly task: number;
  readonly done: readonly number[];
}

/** The scenes said as a character goes from `before` to `after`, in order: on the same quest, the end of each task
 *  done and the start of the task now; on another, the end of the last task of the one finished, and the new one's
 *  `begin` and first task's start where it is walked from its beginning. A switch back to a road part walked says
 *  nothing: it was said before. */
export function linesBetween(before: Walked, after: Walked): string[] {
  const quest = QUESTS[after.quest - 1];
  if (before.quest === after.quest) {
    if (!quest || after.task <= before.task) return [];
    const ends = quest.tasks.slice(before.task, after.task).map((task) => task.end);
    return [...ends, quest.tasks[after.task]?.start].filter((scene) => scene !== undefined);
  }
  const left = QUESTS[before.quest - 1];
  const finished = left && after.done[before.quest - 1] === 1 && before.done[before.quest - 1] !== 1;
  const ended = finished ? [left.tasks[before.task]?.end] : [];
  const begun = quest && after.task === 0 ? [quest.begin, quest.tasks[0]?.start] : [];
  return [...ended, ...begun].filter((scene) => scene !== undefined);
}

/** The opening's place in the file, counted from 1: it begins once the welcome is past. */
export const OPENING = 1;
