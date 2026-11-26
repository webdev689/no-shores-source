// What one word on a player's character says that the one before it did not, for the houses' roads: where they walk
// and what each step holds (`Kept`), the lines a step says as it goes (a goal met, a failure, an ambush), and the
// notices of what the player obtains (obtained.ts): a keeper's gift, a road's reward, a quest acquired, a step done.
// The watch (questWatch.ts) decides when they are said.
import arts from '../../../../content/arts/arts.json' with { type: 'json' };
import factions from '../../../../content/gear/factions.json' with { type: 'json' };
import items from '../../../../content/gear/items.json' with { type: 'json' };
import type { GearState } from '../../network/gearMessages.ts';
import { emblemSvg } from '../artsCards.ts';
import { keeperMarkSvg } from '../npc/npcMarks.ts';
import type { Notice } from '../obtained.ts';
import { FIGURE_STATES } from '../../network/questMessages.ts';
import { type Goal, QUESTS, type Reward, type Task, type Walked, failLine } from './questBook.ts';
import { isLesson, lessonNotice } from './lessons.ts';

/** What the page keeps of a character to tell what is new: where they walk, the task's counts and each goal's
 *  failures, the states of the figures walking for it, their pledge and Aurem, what each Art's road has earned and
 *  each Art's fragment choices waiting, in the Arts' order, the keeper offering the quest walked while it waits, and
 *  the houses whose own piece they hold as its leader gives it (Magic), a bit each by the house's number less one. */
export interface Kept extends Walked {
  readonly offered: number;
  readonly counts: readonly number[];
  readonly fails: readonly number[];
  readonly figures: readonly number[];
  readonly pledge: number;
  readonly aurem: number;
  readonly earned: readonly number[];
  readonly choices: readonly number[];
  readonly houseGifts: number;
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
    offered: quest.offered ?? 0,
    // Carried, vaulted, or posted for want of room.
    houseGifts: factions.factions.reduce(
      (bits, house) =>
        [...gear.items, ...(gear.mail ?? []).flatMap((letter) => letter.item ?? [])].some(
          (held) => held.named === houseTorso(house.id)?.id && held.rarity === MAGIC,
        )
          ? bits | (1 << (house.id - 1))
          : bits,
      0,
    ),
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

/** The keeper each lesson's steps are announced under: the Tack's riding, the Harbourmaster's sailing; a gift's step
 *  its counter's keeper, the Tailor's for the dye. */
const lessonKeeper = (goal: Goal): string =>
  goal.kind === 'ride' ? 'tack' : goal.kind === 'sail' ? 'harbourmaster' : (goal.to ?? 'tailor');

/** The notices of the riding, sailing and gifts' lessons' steps the room ticked between `before` and `after`, in
 *  the task's order: those met in the task still walked, or every one left of a task the word saw done. */
export function lessonsBetween(before: Kept, after: Kept): Notice[] {
  const same = before.quest === after.quest && before.task === after.task;
  const task = same ? QUESTS[after.quest - 1]?.tasks[after.task] : tasksDone(before, after)[0];
  return (task?.goals ?? []).flatMap((goal, index) =>
    isLesson(goal) && !met(goal, before.counts[index]) && (!same || met(goal, after.counts[index]))
      ? [{ ...lessonNotice(goal), icon: keeperIcon(lessonKeeper(goal)) }]
      : [],
  );
}

/** The lines of a moment in the task walked between `before` and `after`: each goal's own line as its failures rise,
 *  an escort's shout as an ambush stops its figure, and its mount line as its figure begins to wait for the player to
 *  get on their horse. */
export function momentsBetween(before: Kept, after: Kept): string[] {
  const task = QUESTS[after.quest - 1]?.tasks[after.task];
  if (!task || before.quest !== after.quest || before.task !== after.task) return [];
  const failed = task.goals.filter((_goal, index) => (after.fails[index] ?? 0) > (before.fails[index] ?? 0));
  const began = (state: number) => after.figures.includes(state) && !before.figures.includes(state);
  const shout = began(FIGURE_STATES.ambushed) ? task.goals.find((goal) => goal.shout)?.shout : undefined;
  const mount = began(FIGURE_STATES.mounting) ? task.goals.find((goal) => goal.mount)?.mount : undefined;
  return [...failed.map(failLine), shout, mount].filter((scene) => scene !== undefined);
}

/** An escort's or a tail's greeting, as its figure first walks in the task walked: waiting before (for the player to
 *  come near, or to mount), walking after. */
export function greetBetween(before: Kept, after: Kept): string | undefined {
  const task = QUESTS[after.quest - 1]?.tasks[after.task];
  if (!task || before.quest !== after.quest || before.task !== after.task) return undefined;
  const waited = [FIGURE_STATES.waiting, FIGURE_STATES.mounting].some((state) => before.figures.includes(state));
  const starts = waited && after.figures.includes(FIGURE_STATES.walking);
  return starts ? task.goals.find((goal) => goal.greet)?.greet : undefined;
}

/** An Art's emblem as a notice's icon. */
export const artIcon = (art: (typeof arts.arts)[number]) => ({ key: `art ${art.key}`, svg: emblemSvg(art) });
/** A keeper's mark as a notice's icon; none for a keeper with no mark. */
const keeperIcon = (keeper: string) => {
  const svg = keeperMarkSvg(keeper);
  return svg ? { key: `keeper ${keeper}`, svg } : null;
};
/** The key that opens the character screen, where the Arts and the gear worn are, and what it opens. */
const CHARACTER = { key: 'character', opens: 'Open Character' } as const;

/** The notices of what a road gave between `before` and `after`: each keeper's gift on the opening's round
 *  (`giftNotice`); each Art, Tenet and fragment choice; and a choice its Art had no fragment left for, paid in Aurem
 *  at the counter's price. */
export function giftsBetween(before: Kept, after: Kept): Notice[] {
  const given = tasksDone(before, after).reduce((sum, task) => sum + (task.reward?.fragments ?? 0), 0);
  const house = factions.factions.find((faction) => faction.id === QUESTS[before.quest - 1]?.faction);
  const artsGiven = arts.arts.flatMap((art, place): Notice[] => {
    const earned = (after.earned[place] ?? 0) & ~(before.earned[place] ?? 0);
    const tenets = art.tenets.filter((_tenet, index) => (earned & (2 << index)) !== 0);
    const choosing = Math.max(0, (after.choices[place] ?? 0) - (before.choices[place] ?? 0));
    const owed = house?.art === art.id ? given - choosing : 0;
    const paid = Math.min(owed, Math.floor((after.aurem - before.aurem) / factions.fragmentAurem));
    const price = (paid * factions.fragmentAurem).toLocaleString('en');
    const icon = artIcon(art);
    const choose = "Press {key}, then choose it on the Art's screen.";
    return [
      ...((earned & 1) !== 0
        ? [
            {
              title: `${art.name} Art earned`,
              line: `${art.anima.name} is yours. Press {key} to see it.`,
              icon,
              ...CHARACTER,
            },
          ]
        : []),
      ...tenets.map((tenet) => ({
        title: `Tenet earned: ${tenet.name}`,
        line: 'Press {key} to see it.',
        icon,
        ...CHARACTER,
      })),
      ...(choosing > 0 ? [{ title: `A ${art.name} fragment to choose`, line: choose, icon, ...CHARACTER }] : []),
      ...(paid > 0 ? [{ title: `No ${art.name} fragment left to choose`, line: `${price} Aurem instead.`, icon }] : []),
    ];
  });
  const pledged = houseGiftGiven(before, after);
  return [
    ...keepersGiftsBetween(before, after).map(giftNotice),
    ...(pledged ? [houseGiftNotice(pledged)] : []),
    ...artsGiven,
  ];
}

/** Each house's leader and the line they say as they give its own piece (`content/story/houses.json`), by its key. */
const LEADERS: Readonly<Record<string, { readonly leader: string; readonly scene: string }>> = {
  stormcallers: { leader: 'Arlo Kestrel', scene: 'giftStorm' },
  lamplighters: { leader: 'Elder Maren Hale', scene: 'giftLamp' },
  veiled: { leader: 'Sable', scene: 'giftVeil' },
};

/** The rarity a house's leader gives its piece at: Magic, the game's Uncommon. */
const MAGIC = 1;

/** A house's own torso piece in the catalogue, whose look and name its leader's gift wears (`give_house_piece`). */
function houseTorso(house: number) {
  const key = factions.factions.find((each) => each.id === house)?.key;
  return items.items.find((named) => named.faction === key && named.kind === 'torso');
}

/** The house whose piece a word saw given, by its number: the one pledged to by it, whose Magic piece is held now and
 *  was not before; none for a pledge to a house whose piece was given before. */
export function houseGiftGiven(before: Kept, after: Kept): number | null {
  const bit = after.pledge > 0 ? 1 << (after.pledge - 1) : 0;
  return after.pledge !== before.pledge && (after.houseGifts & ~before.houseGifts & bit) !== 0 ? after.pledge : null;
}

/** The line a house's leader says as they give its piece. */
export const houseGiftScene = (house: number): string | undefined =>
  LEADERS[factions.factions.find((found) => found.id === house)?.key ?? '']?.scene;

/** The notice a house's piece is announced by: its leader's gift, under the house's Art, with the key to wear it. */
export function houseGiftNotice(house: number): Notice {
  const found = factions.factions.find((each) => each.id === house);
  const art = arts.arts.find((each) => each.id === found?.art);
  const leader = LEADERS[found?.key ?? '']?.leader ?? 'Your house';
  const name = houseTorso(house)?.name ?? 'Your house colours';
  return {
    title: `${leader}'s gift`,
    line: `${name}. Press {key} to wear it.`,
    icon: art ? artIcon(art) : null,
    ...CHARACTER,
  };
}

/** The notices of a quest acquired and of each step done between `before` and `after`, and of a quest done. */
export function stepsBetween(before: Kept, after: Kept): Notice[] {
  const quest = QUESTS[before.quest - 1];
  if (!quest) return [];
  const icon = quest.offer ? keeperIcon(quest.offer.keeper) : null;
  const acquired =
    before.quest === after.quest && before.offered > 0 && after.offered === 0
      ? [{ title: 'Quest acquired', line: `${quest.name}. Follow its steps in the tracker.`, icon }]
      : [];
  const done = after.done[before.quest - 1] === 1 && before.done[before.quest - 1] !== 1;
  const steps = tasksDone(before, after).map((task) => ({ title: 'Step done', line: task.task, icon }));
  return [...acquired, ...steps, ...(done ? [{ title: 'Quest done', line: quest.name, icon }] : [])];
}

/** What each keeper on the opening's round gives, by the name its goal's or task's reward gives it (`gifts.rs`, the
 *  Tack's horse and the Harbourmaster's ship beside them): who gives it, what, and the key that takes the player to
 *  it, where one does. */
const GIFT_NOTICES: Readonly<Record<string, Omit<Notice, 'icon'> & { readonly keeper: string }>> = {
  weapons: {
    keeper: 'weaponsmith',
    title: "The Weaponsmith's gift",
    line: 'A Melee and a Ranged weapon of your choice, free at her counter.',
  },
  armour: {
    keeper: 'armorsmith',
    title: "The Armorsmith's gift",
    line: 'Head, torso, arm and leg armour. Press {key} to put it on.',
    ...CHARACTER,
  },
  vestige: { keeper: 'mage', title: "The Mage's gift", line: 'A Vestige for her to open.' },
  cloak: { keeper: 'vault', title: "The Vault Keeper's gift", line: 'A cloak, laid in your vault.' },
  dye: { keeper: 'tailor', title: "The Tailor's gift", line: 'Harbour Blue dye.' },
  letter: { keeper: 'mail', title: "The Postmaster's gift", line: 'A letter at the mail counter.' },
  horse: {
    keeper: 'tack',
    title: "The Tack's gift",
    line: 'The Bay Horse. Press {key} to ride.',
    key: 'mount',
    opens: 'Mount',
  },
  ship: { keeper: 'harbourmaster', title: "The Harbourmaster's gift", line: 'The Sloop, your own ship.' },
};

/** The notice a keeper's gift is announced by: the one place its words are made, so the notice is restyled here. */
export function giftNotice(gift: string): Notice {
  const found = GIFT_NOTICES[gift];
  if (!found) return { title: 'A gift from a keeper', line: 'Yours to keep.', icon: null };
  const { keeper, ...notice } = found;
  return { ...notice, icon: keeperIcon(keeper) };
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
