// What one word on a player's character says that the one before it did not, for the houses' roads: where they walk
// and what each step holds (`Kept`), the lines a step says as it goes (a goal met, a failure, an ambush), and the
// toasts for what a road gives. The watch (questWatch.ts) decides when they are said.
import arts from '../../../../content/arts/arts.json' with { type: 'json' };
import factions from '../../../../content/gear/factions.json' with { type: 'json' };
import type { GearState } from '../../network/gearMessages.ts';
import { FIGURE_STATES } from '../../network/questMessages.ts';
import { type Goal, QUESTS, type Reward, type Task, type Walked, failLine } from './questBook.ts';
import { lessonNotice } from './lessons.ts';

/** What the page keeps of a character to tell what is new: where they walk, the task's counts and each goal's
 *  failures, the states of the figures walking for it, their pledge and Aurem, what each Art's road has earned and
 *  each Art's fragment choices waiting, in the Arts' order. */
export interface Kept extends Walked {
  readonly counts: readonly number[];
  readonly fails: readonly number[];
  readonly figures: readonly number[];
  readonly pledge: number;
  readonly aurem: number;
  readonly earned: readonly number[];
  readonly choices: readonly number[];
}

/** What a gear message holds of the roads; none from a room that sends none, or from a word not on the player's own
 *  character. */
export function keptOf(gear: GearState | null): Kept | null {
  const quest = gear?.quest;
  if (!gear || !quest || quest.claimed === false) return null;
  const { done, choices, counts, fails = [], figures = [] } = quest;
  return {
    quest: quest.quest,
    task: quest.task,
    counts,
    fails,
    figures: figures.map((figure) => figure.state),
    done,
    pledge: gear.standing?.pledge ?? 0,
    aurem: gear.aurem,
    earned: gear.arts?.earned ?? [],
    choices,
  };
}

/** Whether `after` stands behind `before`, as no character goes: unpledged, a quest undone, a gift taken back, or a
 *  task of the same quest gone back. */
export function behind(before: Kept, after: Kept): boolean {
  const lost = (was: readonly number[], now: readonly number[]) =>
    was.some((bits, index) => (bits & ~(now[index] ?? 0)) !== 0);
  return (
    (before.pledge > 0 && after.pledge === 0) ||
    lost(before.done, after.done) ||
    lost(before.earned, after.earned) ||
    (before.quest === after.quest && after.task < before.task)
  );
}

/** The task `before` was on and every one done before `after`'s, in order: the tasks a word saw done. A quest left
 *  done on its last task was done by it; one left otherwise (the opening, done by a pledge) was not. */
function tasksDone(before: Kept, after: Kept): readonly Task[] {
  const left = QUESTS[before.quest - 1];
  if (!left) return [];
  if (before.quest === after.quest) return left.tasks.slice(before.task, Math.max(before.task, after.task));
  const finished = after.done[before.quest - 1] === 1 && before.done[before.quest - 1] !== 1;
  const last = left.tasks.at(-1);
  return finished && last && left.tasks[before.task] === last ? [last] : [];
}

/** How many a goal asks for, and whether `count` meets it. */
const met = (goal: Goal, count: number | undefined): boolean => (count ?? 0) >= (goal.count ?? 1);

/** The scenes of the goals met between `before` and `after`, in the task's order: those met in the task still walked,
 *  or, where the word saw it done, every goal of the task left that `before` saw unmet. */
export function metBetween(before: Kept, after: Kept): string[] {
  const same = before.quest === after.quest && before.task === after.task;
  const task = same ? QUESTS[after.quest - 1]?.tasks[after.task] : tasksDone(before, after)[0];
  const scenes = (task?.goals ?? []).flatMap((goal, index) =>
    goal.scene !== undefined && !met(goal, before.counts[index]) && (!same || met(goal, after.counts[index]))
      ? [goal.scene]
      : [],
  );
  return scenes;
}

/** The notices of the riding and sailing lessons' steps the room ticked between `before` and `after`, in the task's
 *  order: those met in the task still walked, or every one left of a task the word saw done. */
export function lessonsBetween(before: Kept, after: Kept): string[] {
  const same = before.quest === after.quest && before.task === after.task;
  const task = same ? QUESTS[after.quest - 1]?.tasks[after.task] : tasksDone(before, after)[0];
  return (task?.goals ?? []).flatMap((goal, index) =>
    (goal.kind === 'ride' || goal.kind === 'sail') &&
    !met(goal, before.counts[index]) &&
    (!same || met(goal, after.counts[index]))
      ? [lessonNotice(goal)]
      : [],
  );
}

/** The lines of a moment in the task walked between `before` and `after`: each goal's own line as its failures rise,
 *  and an escort's shout as an ambush stops its figure. */
export function momentsBetween(before: Kept, after: Kept): string[] {
  const task = QUESTS[after.quest - 1]?.tasks[after.task];
  if (!task || before.quest !== after.quest || before.task !== after.task) return [];
  const failed = task.goals.filter((_goal, index) => (after.fails[index] ?? 0) > (before.fails[index] ?? 0));
  const held = (states: readonly number[]) => states.includes(FIGURE_STATES.ambushed);
  const shout = held(after.figures) && !held(before.figures) ? task.goals.find((goal) => goal.shout)?.shout : undefined;
  return [...failed.map(failLine), shout].filter((scene) => scene !== undefined);
}

/** An escort's or a tail's greeting, as its figure first walks in the task walked: waiting before, walking after. */
export function greetBetween(before: Kept, after: Kept): string | undefined {
  const task = QUESTS[after.quest - 1]?.tasks[after.task];
  if (!task || before.quest !== after.quest || before.task !== after.task) return undefined;
  const starts = before.figures.includes(FIGURE_STATES.waiting) && after.figures.includes(FIGURE_STATES.walking);
  return starts ? task.goals.find((goal) => goal.greet)?.greet : undefined;
}

/** The toasts for what a road gave between `before` and `after`: each keeper's gift on the opening's round
 *  (`giftNotice`); each Art, Tenet and fragment choice; and a choice its Art had no fragment left for, paid in Aurem
 *  at the counter's price. */
export function giftsBetween(before: Kept, after: Kept): string[] {
  const given = tasksDone(before, after).reduce((sum, task) => sum + (task.reward?.fragments ?? 0), 0);
  const house = factions.factions.find((faction) => faction.id === QUESTS[before.quest - 1]?.faction);
  const artsGiven = arts.arts.flatMap((art, place) => {
    const earned = (after.earned[place] ?? 0) & ~(before.earned[place] ?? 0);
    const tenets = art.tenets.filter((_tenet, index) => (earned & (2 << index)) !== 0);
    const choosing = Math.max(0, (after.choices[place] ?? 0) - (before.choices[place] ?? 0));
    const owed = house?.art === art.id ? given - choosing : 0;
    const paid = Math.min(owed, Math.floor((after.aurem - before.aurem) / factions.fragmentAurem));
    const price = (paid * factions.fragmentAurem).toLocaleString('en');
    return [
      ...((earned & 1) !== 0 ? [`${art.name} Art earned: ${art.anima.name}`] : []),
      ...tenets.map((tenet) => `Tenet earned: ${tenet.name}`),
      ...(choosing > 0 ? [`A ${art.name} fragment to choose`] : []),
      ...(paid > 0 ? [`No ${art.name} fragment left to choose: ${price} Aurem instead`] : []),
    ];
  });
  return [...keepersGiftsBetween(before, after).map(giftNotice), ...artsGiven];
}

/** What each keeper on the opening's round gives, by the name its goal's or task's reward gives it (`gifts.rs`, the
 *  Tack's horse and the Harbourmaster's ship beside them). */
const GIFT_NOTICES: Readonly<Record<string, string>> = {
  weapons: "The Weaponsmith's gift: a Melee and a Ranged weapon of your choice, free at her counter",
  armour: "The Armorsmith's gift: head, torso, arm and leg armour",
  vestige: "The Mage's gift: a Vestige for her to open",
  cloak: "The Vault Keeper's gift: a cloak, laid in your vault",
  dye: "The Tailor's gift: Harbour Blue dye",
  letter: "The Postmaster's gift: a letter at the mail counter",
  horse: "The Tack's gift: the Bay Horse",
  ship: "The Harbourmaster's gift: the Sloop",
};

/** The notice a keeper's gift is announced by: the one place its words are made, so the notice is restyled here. */
export function giftNotice(gift: string): string {
  return GIFT_NOTICES[gift] ?? 'A gift from a keeper';
}

/** The names of the keepers' gifts a word saw given, in the road's order: each goal met since `before` that gives one,
 *  each task done that gives the ship; and as the opening is left by a first pledge, every gift its tasks from the one
 *  walked still held, as the rules give them then (`give_gifts_ahead`). */
export function keepersGiftsBetween(before: Kept, after: Kept): string[] {
  const named = (reward: Reward | undefined) => [
    ...(reward?.gift ? [reward.gift] : []),
    ...(reward?.horse ? ['horse'] : []),
    ...(reward?.ship ? ['ship'] : []),
  ];
  const quest = QUESTS[before.quest - 1];
  if (quest?.faction === 0 && before.pledge === 0 && after.pledge > 0) {
    // The opening left by a pledge: the gifts ahead, but the horse and the ship, which their counters give instead.
    const ahead = quest.tasks
      .slice(before.task)
      .flatMap((task, later) =>
        task.goals.filter((goal, index) => later > 0 || !met(goal, before.counts[index])).map((goal) => goal.reward),
      );
    return ahead.flatMap((reward) => (reward?.gift ? [reward.gift] : []));
  }
  const same = before.quest === after.quest && before.task === after.task;
  const walked = same ? [QUESTS[after.quest - 1]?.tasks[after.task]] : tasksDone(before, after);
  return walked.flatMap((task, later) => {
    if (!task) return [];
    const goals = task.goals.filter(
      (goal, index) => (later > 0 || !met(goal, before.counts[index])) && (!same || met(goal, after.counts[index])),
    );
    return [...goals.flatMap((goal) => named(goal.reward)), ...(same ? [] : named({ ship: task.reward?.ship }))];
  });
}
