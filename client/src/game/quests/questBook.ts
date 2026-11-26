// The houses' roads as the page reads them (content/quests/quests.json): what the tracker shows of the quest walked
// (with a running clock, and a puzzle's points lit), the talk goal a counter answers, the nodes the held map marks, a
// varied step's goal (a puzzle's, a ward's, an ambush's), and the scenes each step of a road says. The rules judge
// every goal and give every reward; the page only shows.
import book from '../../../../content/quests/quests.json' with { type: 'json' };
import { FIGURE_STATES, type QuestState } from '../../network/questMessages.ts';
import type { Quest as Tracked, Step } from '../tasks.ts';

/** A goal as the file writes it: its tracker words, its count (1 when left out), its kind, and what its kind names:
 *  the counter a `talk` goal speaks at (`to`), the scene said as it is met, the node and place a goal stands at, the
 *  places an `escort` or a `tail` walks between (`from`, `to`) and its figure (`who` a speaker, `foe` a roster type)
 *  with the line said as it first walks (`greet`), a `defend` goal's ward, a `puzzle`'s points and their `order`, a
 *  `race`'s checkpoints, the line said as it fails (`lost`, `late`, `seen`, `noticed`, `wrong`), an escort's `shout`
 *  as an ambush springs, its `mount` as it waits for the player to get on their horse and the coat of the horse it
 *  rides (`horse`), and the slot a `buy` or a `wear` goal names. The rest the rules read alone. */
export interface Goal {
  readonly kind: string;
  readonly text: string;
  readonly count?: number;
  readonly to?: string;
  readonly from?: string;
  readonly scene?: string;
  readonly node?: string;
  readonly place?: string;
  readonly who?: string;
  readonly foe?: string;
  readonly ward?: string;
  readonly points?: readonly { readonly name: string }[];
  readonly checkpoints?: readonly string[];
  readonly lost?: string;
  readonly late?: string;
  readonly seen?: string;
  readonly noticed?: string;
  readonly wrong?: string;
  readonly shout?: string;
  readonly greet?: string;
  readonly mount?: string;
  readonly horse?: string;
  readonly order?: readonly number[];
  readonly slot?: string;
  readonly types?: readonly string[];
  readonly rank?: string;
  readonly island?: string;
  readonly side?: string;
}

/** A task: its id, its tracker words, the scenes said as it begins and as it is done, its goals, and what it gives
 *  as it is done (of which the page reads only the fragments to choose). */
export interface Task {
  readonly id: string;
  readonly task: string;
  readonly reward?: { readonly fragments?: number };
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
  mail: 17,
  stranger: 18,
};

/** The smith who sells a slot's pieces, by their station's kind. */
export const SMITH_OF: Readonly<Record<string, string>> = {
  melee: 'weaponsmith',
  ranged: 'weaponsmith',
  head: 'armorsmith',
  torso: 'armorsmith',
  arms: 'armorsmith',
  legs: 'armorsmith',
};

/** How many a goal asks for. */
const most = (goal: Goal): number => goal.count ?? 1;

/** The quest walked and its task now, with that task's goals' counts; none for no quest or one the file lacks, and
 *  none from a word not on the player's own character (a room's starting character, before theirs is given). */
function walked(state: QuestState | null | undefined): { quest: QuestLine; task: Task; counts: number[] } | null {
  const quest = state && state.claimed !== false ? QUESTS[state.quest - 1] : undefined;
  const task = quest?.tasks[state?.task ?? 0];
  if (!state || !quest || !task) return null;
  return { quest, task, counts: task.goals.map((_goal, index) => state.counts[index] ?? 0) };
}

/** Whether the goal at `index` of the task now is met. */
const met = (goal: Goal, count: number): boolean => count >= most(goal);

/** The task now's goals not yet met, in its order, each with its place among the task's goals. */
export function openGoals(state: QuestState | null | undefined): { readonly goal: Goal; readonly index: number }[] {
  const now = walked(state);
  return (now?.task.goals ?? []).flatMap((goal, index) =>
    met(goal, now?.counts[index] ?? 0) ? [] : [{ goal, index }],
  );
}

/** The kinds whose goal runs the task's clock: a race's time left, or the wait before a failed step (a ward lost, a
 *  quarry that noticed, the player seen) is tried again. An escort waits on no clock: it waits for the player. */
const CLOCKED: ReadonlySet<string> = new Set(['race', 'defend', 'tail', 'unseen']);

/** What an escort's step says under it while its figure waits for the player, near it, to get on their horse: that,
 *  or, `horsed` false (none worn in the Mount slot), where one is had. */
export const MOUNT_NOTES = {
  horsed: 'Get on your horse',
  none: 'No horse worn: the Tack in Overlook gives one',
} as const;

/** What the tracker shows of the quest walked: its name, its task, and each goal's words with what is left of its
 *  count, ticked once met; the clock running beside the first unmet goal that runs it, a ward's health beside its
 *  defence while it stands, a puzzle's points lit of all of them, and under an escort waiting for the player to mount
 *  what to do (`MOUNT_NOTES`). None while no quest is walked. The clock runs down `ran` seconds from the room's last
 *  word on it, never below none. */
export function trackedOf(state: QuestState | null | undefined, ran = 0, horsed = true): Tracked | null {
  const now = walked(state);
  if (!state || !now) return null;
  const clocked = now.task.goals.findIndex(
    (goal, index) => CLOCKED.has(goal.kind) && !met(goal, now.counts[index] ?? 0),
  );
  const { points = [], clock, ward, figures = [] } = state;
  const mounting = figures.some((figure) => figure.state === FIGURE_STATES.mounting);
  const steps = now.task.goals.map((goal, index): Step => {
    const left = Math.max(0, most(goal) - (now.counts[index] ?? 0));
    const shown = { text: goal.text, done: left === 0 };
    if (left === 0) return shown;
    if (index === clocked && clock !== undefined && clock !== null)
      return { ...shown, clock: Math.max(0, clock - ran) };
    if (goal.kind === 'defend' && ward) return { ...shown, share: ward.health };
    if (goal.kind === 'escort' && mounting) return { ...shown, note: horsed ? MOUNT_NOTES.horsed : MOUNT_NOTES.none };
    if (goal.kind === 'puzzle' && points.length > 0)
      return { ...shown, count: `${points.filter((point) => point.lit).length}/${points.length}` };
    return most(goal) > 1 ? { ...shown, count: left } : shown;
  });
  return { name: now.quest.name, task: now.task.task, steps };
}

/** The task's first goal of `kind`, if it has one. */
export function goalOf(state: QuestState | null | undefined, kind: string): Goal | null {
  return walked(state)?.task.goals.find((goal) => goal.kind === kind) ?? null;
}

/** A puzzle's point as the page shows it: its name, its place among its goal's points, where it stands and whether
 *  it is lit. */
export interface PuzzlePoint {
  readonly name: string;
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly lit: boolean;
}

/** The task's puzzle's points where the room stands them, each named by its goal; none where none stand, or from a
 *  word not on the player's own character. */
export function puzzlePoints(state: QuestState | null | undefined): PuzzlePoint[] {
  const goal = goalOf(state, 'puzzle');
  const named = goal?.points ?? [];
  return goal
    ? (state?.points ?? []).map((point, index) => ({ name: named[index]?.name ?? 'the point', index, ...point }))
    : [];
}

/** The line a goal says as it fails: a ward lost, a race late, seen, noticed, a wrong point. */
export const failLine = (goal: Goal): string | undefined =>
  goal.lost ?? goal.late ?? goal.seen ?? goal.noticed ?? goal.wrong;

/** The unmet `talk` goal of the task now that the counter `counter` (a station's kind) answers, if one does. */
export function talkAt(state: QuestState | null | undefined, counter: string): Goal | null {
  const now = walked(state);
  const open = (goal: Goal, index: number) =>
    goal.kind === 'talk' && goal.to === counter && !met(goal, now?.counts[index] ?? 0);
  return now?.task.goals.find(open) ?? null;
}

/** Whether an unmet `buy` goal of the task now asks a ware of the smith at the counter `counter`. */
export function buyAt(state: QuestState | null | undefined, counter: string): boolean {
  const now = walked(state);
  const open = (goal: Goal, index: number) =>
    goal.kind === 'buy' && SMITH_OF[goal.slot ?? ''] === counter && !met(goal, now?.counts[index] ?? 0);
  return now?.task.goals.some(open) ?? false;
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

/** The scenes said as a character goes from `before` to `after`, in order: on the same quest, each task done's end
 *  and the next task's start, a task begun and done in one word saying both; on another, the end of the last task of
 *  the one finished. A quest's `begin` is never among them: whether it was said before is the browser's to know
 *  (questWatch.ts). */
export function linesBetween(before: Walked, after: Walked): string[] {
  const quest = QUESTS[after.quest - 1];
  if (before.quest === after.quest) {
    if (!quest || after.task <= before.task) return [];
    const done = quest.tasks.slice(before.task, after.task);
    return done
      .flatMap((task, index) => [task.end, quest.tasks[before.task + index + 1]?.start])
      .filter((scene) => scene !== undefined);
  }
  const left = QUESTS[before.quest - 1];
  const finished = left && after.done[before.quest - 1] === 1 && before.done[before.quest - 1] !== 1;
  return finished ? [left.tasks[before.task]?.end].filter((scene) => scene !== undefined) : [];
}

/** The scenes a quest begins with: its `begin`, then its first task's start. */
export function beginOf(quest: QuestLine): string[] {
  return [quest.begin, quest.tasks[0]?.start].filter((scene) => scene !== undefined);
}
