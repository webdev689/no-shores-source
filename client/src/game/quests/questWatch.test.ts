import assert from 'node:assert/strict';
import { test } from 'node:test';
import factions from '../../../../content/gear/factions.json' with { type: 'json' };
import type { GearState } from '../../network/gearMessages.ts';
import { standing, state } from '../../network/gearForTests.ts';
import { QUESTS } from './questBook.ts';
import { BEGUN_KEY, QuestWatch } from './questWatch.ts';

/** A character's gear on quest `quest` at task `task`: that task's counts, pledged to `pledge`, each quest done by
 *  `done`, each Art's road earned by `earned` and its fragment choices waiting by `choices`, each goal's failures, the
 *  states of the figures walking for it, their Aurem, and whether the word is on their own character. */
function gear(
  quest: number,
  task: number,
  more: {
    counts?: number[];
    pledge?: number;
    done?: number[];
    earned?: number[];
    choices?: number[];
    fails?: number[];
    figures?: number[];
    aurem?: number;
    claimed?: boolean;
  } = {},
): GearState {
  const { counts = [], pledge = 0, done = [0, 0, 0, 0], earned = [0, 0, 0], choices = [0, 0, 0] } = more;
  const { fails = [], figures = [], aurem = 0, claimed = true } = more;
  const walking = figures.map((figureState) => ({ look: 22, x: 0, y: 0, z: 0, facing: 0, state: figureState }));
  return state({
    aurem,
    standing: standing({ pledge }),
    arts: { art: 0, cores: [], anima: 0, tenets: [0, 0], earned },
    quest: { quest, task, counts, done, choices, at: null, fails, figures: walking, claimed },
  });
}

/** A browser's keeping, as a map. */
function browser() {
  const kept = new Map<string, string>();
  return { kept, keeping: { getItem: (key: string) => kept.get(key) ?? null, setItem: kept.set.bind(kept) } };
}

/** A watch that has heard its first word, `first`, the story and the welcome past. */
function heard(first: GearState): QuestWatch {
  const watch = new QuestWatch();
  watch.look(first, true);
  return watch;
}

/** The place of a quest by its id, counted from 1. */
const questOf = (id: string): number => QUESTS.findIndex((quest) => quest.id === id) + 1;
const [STORM, LAMP] = [questOf('stormcallers'), questOf('lamplighters')];
/** The scenes a task of a road says as it ends and as it begins. */
const ending = (quest: number, task: number) => QUESTS[quest - 1]?.tasks[task]?.end;
const starting = (quest: number, task: number) => QUESTS[quest - 1]?.tasks[task]?.start;
const said = (...scenes: (string | undefined)[]) => scenes.filter((scene) => scene !== undefined);

test('a task done says its end, then the next task’s start, in order; each once', () => {
  const watch = heard(gear(STORM, 1, { pledge: 1 }));
  assert.deepEqual(watch.look(gear(STORM, 1, { pledge: 1 }), true).scenes, [], 'unchanged, nothing');
  assert.deepEqual(watch.look(gear(STORM, 2, { pledge: 1 }), true).scenes, said(ending(STORM, 1), starting(STORM, 2)));
  assert.deepEqual(
    watch.look(gear(STORM, 5, { pledge: 1 }), true).scenes,
    said(
      ending(STORM, 2),
      starting(STORM, 3),
      ending(STORM, 3),
      starting(STORM, 4),
      ending(STORM, 4),
      starting(STORM, 5),
    ),
  );
  assert.deepEqual(watch.look(gear(STORM, 5, { pledge: 1 }), true).scenes, [], 'said once');
});

test('a word not on the player’s own character is nothing: neither where they stand nor news', () => {
  // A page loading mid-road hears the room's starting character first, then their own: neither says anything.
  const watch = new QuestWatch();
  assert.deepEqual(watch.look(gear(1, 0, { claimed: false }), true), { scenes: [], moments: [], toasts: [] });
  const own = gear(LAMP, 6, { pledge: 2, done: [1, 0, 0, 0], earned: [0, 3, 0] });
  assert.deepEqual(watch.look(own, true), { scenes: [], moments: [], toasts: [] }, 'their own, however late it comes');
  // A room joined later does the same, its starting character never taken for where they stand.
  assert.deepEqual(watch.look(gear(1, 0, { claimed: false }), true).scenes, []);
  assert.deepEqual(watch.look(own, true), { scenes: [], moments: [], toasts: [] });
  assert.deepEqual(
    watch.look(gear(LAMP, 7, { pledge: 2, done: [1, 0, 0, 0], earned: [0, 3, 0] }), true).scenes,
    said(ending(LAMP, 6), starting(LAMP, 7)),
  );
});

test('a word that goes back is never news', () => {
  const own = gear(STORM, 3, { pledge: 1, done: [1, 0, 0, 0], earned: [1, 0, 0] });
  const watch = heard(own);
  assert.deepEqual(watch.look(gear(1, 0), true), { scenes: [], moments: [], toasts: [] }, 'unpledged, nothing earned');
  assert.deepEqual(watch.look(own, true), { scenes: [], moments: [], toasts: [] });
});

test('a road begins as it is pledged to, once; a switch back to a road on its first task says nothing again', () => {
  const watch = heard(gear(1, 1));
  const pledged = (pledge: number, quest: number) => gear(quest, 0, { pledge, done: [1, 0, 0, 0] });
  assert.deepEqual(watch.look(pledged(1, STORM), true).scenes, said(QUESTS[STORM - 1]?.begin, starting(STORM, 0)));
  assert.deepEqual(watch.look(pledged(2, LAMP), true).scenes, said(QUESTS[LAMP - 1]?.begin, starting(LAMP, 0)));
  assert.deepEqual(watch.look(pledged(1, STORM), true).scenes, [], 'back to the Stormcallers, still on task 0');
});

test('the opening begins once the welcome passes; never while the story or the welcome holds', () => {
  const watch = new QuestWatch();
  assert.deepEqual(watch.look(gear(1, 0), false).scenes, [], 'the welcome plays');
  assert.deepEqual(watch.look(gear(1, 0), true).scenes, said(QUESTS[0]?.begin), 'the welcome given');
  assert.deepEqual(watch.look(gear(1, 0), true).scenes, [], 'once');
  const pledged = new QuestWatch();
  pledged.look(gear(STORM, 2, { pledge: 1 }), false);
  assert.deepEqual(pledged.look(gear(STORM, 2, { pledge: 1 }), true).scenes, [], 'on a road already');
});

test('a pledge made during the welcome is said once it passes, and the opening it left never is', () => {
  const watch = new QuestWatch();
  watch.look(gear(1, 0), false);
  // Pledged at the Stormcallers' stop of the welcome, their counter open.
  const pledged = gear(STORM, 0, { pledge: 1, done: [1, 0, 0, 0] });
  assert.deepEqual(watch.look(pledged, false).scenes, [], 'held while the welcome holds');
  assert.deepEqual(watch.look(pledged, true).scenes, said(QUESTS[STORM - 1]?.begin, starting(STORM, 0)));
  assert.deepEqual(watch.look(pledged, true).scenes, []);
  const walking = heard(gear(STORM, 0, { pledge: 1 }));
  walking.look(gear(STORM, 1, { pledge: 1 }), false);
  assert.deepEqual(
    walking.look(gear(STORM, 1, { pledge: 1 }), true).scenes,
    said(ending(STORM, 0), starting(STORM, 1)),
  );
});

test('a character from before the roads hears its road begin once for its account, on task 0 with nothing counted', () => {
  const { kept, keeping } = browser();
  let account: string | null = 'arlo-fan';
  const first = (look: GearState) => new QuestWatch(keeping, () => account).look(look, true).scenes;
  const pledged = gear(STORM, 0, { pledge: 1 });
  const stormBegin = said(QUESTS[STORM - 1]?.begin, starting(STORM, 0));
  assert.deepEqual(first(pledged), stormBegin, 'pledged before the roads, on their first task');
  assert.equal(kept.get(`${BEGUN_KEY}.arlo-fan`), 'stormcallers', 'kept for the account');
  assert.deepEqual(first(pledged), [], 'a page loaded again says it no more');
  account = 'another';
  assert.deepEqual(first(pledged), stormBegin, 'another account in the same browser hears its own');
  assert.deepEqual(first(gear(1, 0)), said(QUESTS[0]?.begin), 'unpledged, the opening');
  assert.equal(kept.get(`${BEGUN_KEY}.another`), 'stormcallers,house');
  account = 'third';
  assert.deepEqual(first(gear(STORM, 0, { pledge: 1, counts: [1] })), [], 'something counted: begun already');
  assert.deepEqual(first(gear(STORM, 1, { pledge: 1 })), [], 'past its first task');
});

test('a browser that keeps nothing says a begin once in the page', () => {
  const refuse = () => {
    throw new Error('this browser keeps nothing');
  };
  const watch = new QuestWatch({ getItem: refuse, setItem: refuse }, () => 'arlo-fan');
  watch.look(gear(1, 1), true);
  const pledged = gear(STORM, 0, { pledge: 1, done: [1, 0, 0, 0] });
  assert.deepEqual(watch.look(pledged, true).scenes, said(QUESTS[STORM - 1]?.begin, starting(STORM, 0)));
  watch.look(gear(LAMP, 0, { pledge: 2, done: [1, 0, 0, 0] }), true);
  assert.deepEqual(watch.look(pledged, true).scenes, [], 'kept in the page');
});

test('what a road gives is toasted: its Art, each Tenet, a fragment to choose, and one paid in Aurem instead', () => {
  const watch = heard(gear(STORM, 2, { pledge: 1 }));
  assert.deepEqual(watch.look(gear(STORM, 3, { pledge: 1, earned: [1, 0, 0] }), true).toasts, [
    'Storm Art earned: Tempest',
  ]);
  assert.deepEqual(watch.look(gear(STORM, 4, { pledge: 1, earned: [3, 0, 0] }), true).toasts, [
    'Tenet earned: Quicken',
  ]);
  // The first task that gives fragments, done: a choice, or its price where the Art has none left to choose.
  const giving = QUESTS[STORM - 1]?.tasks.findIndex((task) => (task.reward?.fragments ?? 0) > 0) ?? -1;
  const before = gear(STORM, giving, { pledge: 1, earned: [3, 0, 0], aurem: 1000 });
  const chosen = heard(before).look(
    gear(STORM, giving + 1, { pledge: 1, earned: [3, 0, 0], choices: [1, 0, 0] }),
    true,
  );
  assert.deepEqual(chosen.toasts, ['A Storm fragment to choose']);
  const price = 1000 + factions.fragmentAurem;
  const paid = heard(before).look(gear(STORM, giving + 1, { pledge: 1, earned: [3, 0, 0], aurem: price }), true);
  assert.deepEqual(paid.toasts, [
    `No Storm fragment left to choose: ${factions.fragmentAurem.toLocaleString('en')} Aurem instead`,
  ]);
  const spent = heard(gear(STORM, 7, { pledge: 1, choices: [1, 0, 0] }));
  assert.deepEqual(spent.look(gear(STORM, 7, { pledge: 1 }), true).toasts, [], 'a choice spent is no gift');
});

test("a goal's own line is said as its failures rise, once while it waits or is said; dropped while the welcome holds", () => {
  const defence = QUESTS[STORM - 1]?.tasks.findIndex((task) => task.goals.some((goal) => goal.lost)) ?? -1;
  const holding = (fails: number[]) => gear(STORM, defence, { pledge: 1, fails });
  const lost = QUESTS[STORM - 1]?.tasks[defence]?.goals.find((goal) => goal.lost)?.lost;
  const watch = new QuestWatch();
  assert.deepEqual(watch.look(holding([2]), true).moments, [], 'not on the first word');
  assert.deepEqual(watch.look(holding([3]), true).moments, said(lost), 'broken again');
  assert.deepEqual(watch.look(holding([3]), true).moments, [], 'once');
  assert.deepEqual(watch.look(holding([4]), false).moments, [], 'broken while the welcome held: gone with the moment');
  assert.deepEqual(watch.look(holding([4]), true).scenes, [], 'and not held for after');
});

/** Two tasks made at the end of the Lamplighters' road for a test: a walk with an escort that greets and shouts and a
 *  place whose goal says a scene as it is met, then a task after it; taken away again as `run` ends. */
function madeWalk(run: (walk: number) => void): void {
  const road = QUESTS[LAMP - 1] as unknown as { tasks: unknown[] };
  const walk = road.tasks.length;
  const goals = [
    { kind: 'escort', text: 'Walk', node: 'moors', from: 'a', to: 'b', greet: 'madeGreet', shout: 'madeShout' },
    { kind: 'reach', text: 'There', node: 'moors', place: 'b', scene: 'madeThere' },
  ];
  road.tasks.push({ id: 'made-walk', task: 'Walk', goals, end: 'madeEnd' });
  road.tasks.push({ id: 'made-after', task: 'After', start: 'madeStart', goals: [] });
  try {
    run(walk);
  } finally {
    road.tasks.splice(walk, 2);
  }
}

test("an escort's greeting as it first walks, once a task; its shout as an ambush holds it", () => {
  madeWalk((walk) => {
    const walking = (figure: number) => gear(LAMP, walk, { pledge: 2, figures: [figure] });
    const watch = heard(walking(0));
    assert.deepEqual(watch.look(walking(1), true).scenes, ['madeGreet'], 'met: they set off');
    assert.deepEqual(watch.look(walking(4), true).moments, ['madeShout']);
    assert.deepEqual(watch.look(walking(4), true).moments, [], 'still held');
    watch.look(walking(1), true);
    assert.deepEqual(watch.look(walking(4), true).moments, ['madeShout'], 'held again');
    watch.look(walking(0), true);
    assert.deepEqual(watch.look(walking(1), true).scenes, [], 'greeted once a task');
    assert.deepEqual(heard(walking(1)).look(walking(1), true).scenes, [], 'a page loaded mid-walk greets no one');
    const held = heard(walking(0));
    held.look(walking(1), false);
    assert.deepEqual(held.look(walking(1), true).scenes, ['madeGreet'], 'held through the welcome');
  });
});

test("a goal's scene is said as the room meets it, before its task's end where the same word ends it", () => {
  madeWalk((walk) => {
    const counts = (there: number) => gear(LAMP, walk, { pledge: 2, counts: [0, there] });
    const watch = heard(counts(0));
    assert.deepEqual(watch.look(counts(1), true).scenes, ['madeThere'], 'met');
    assert.deepEqual(watch.look(counts(1), true).scenes, [], 'once');
    const ending = heard(counts(0));
    assert.deepEqual(
      ending.look(gear(LAMP, walk + 1, { pledge: 2 }), true).scenes,
      ['madeThere', 'madeEnd', 'madeStart'],
      'met in the word that ends the task',
    );
    const held = heard(counts(0));
    held.look(counts(1), false);
    assert.deepEqual(held.look(counts(1), true).scenes, ['madeThere'], 'held through the welcome');
  });
});
