import assert from 'node:assert/strict';
import { test } from 'node:test';
import castFile from '../../../../content/story/cast.json' with { type: 'json' };
import houses from '../../../../content/story/houses.json' with { type: 'json' };
import welcome from '../../../../content/story/welcome.json' with { type: 'json' };
import type { QuestState } from '../../network/questMessages.ts';
import { castOf, scenesOf } from '../../speech/cast.ts';
import { clockWords } from '../tasks.ts';
import { TOUR } from '../welcome/tour.ts';
import {
  COUNTERS,
  type Goal,
  QUESTS,
  beginOf,
  buyAt,
  failLine,
  goalNodes,
  goalOf,
  linesBetween,
  offeredAt,
  puzzlePoints,
  talkAt,
  trackedOf,
} from './questBook.ts';

// The roads are written by their story's own hand and change: these tests read what they expect from the file.

/** The place of a quest by its id, counted from 1; of a task in it by its id; and that task's goals. */
const questOf = (id: string): number => QUESTS.findIndex((quest) => quest.id === id) + 1;
const taskOf = (quest: number, id: string): number => {
  const place = QUESTS[quest - 1]?.tasks.findIndex((task) => task.id === id) ?? -1;
  assert.ok(place >= 0, `${id} is a task`);
  return place;
};
const goalsOf = (quest: number, task: number): readonly Goal[] => QUESTS[quest - 1]?.tasks[task]?.goals ?? [];
const [STORM, LAMP, VEIL] = [questOf('stormcallers'), questOf('lamplighters'), questOf('veiled')];

/** A player on quest `quest` (counted from 1) at task `task`, its goals' counts `counts`, and more of the word. */
const onTask = (quest: number, task: number, counts: number[] = [], more: Partial<QuestState> = {}): QuestState => ({
  quest,
  task,
  counts,
  done: [0, 0, 0, 0],
  choices: [0, 0, 0],
  at: null,
  ...more,
});

/** The first task of a road whose goals hold one of `kind`, and that goal's place among them. */
function stepOf(quest: number, kind: string): { task: number; goal: number } {
  const task = QUESTS[quest - 1]?.tasks.findIndex((each) => each.goals.some((goal) => goal.kind === kind)) ?? -1;
  assert.ok(task >= 0, `a ${kind} step on road ${quest}`);
  return { task, goal: goalsOf(quest, task).findIndex((goal) => goal.kind === kind) };
}

test('the tracker shows the quest walked: its name, its task, and each goal with what is left of its count', () => {
  const quest = QUESTS[0];
  const goals = goalsOf(1, 0);
  assert.deepEqual(
    trackedOf(onTask(1, 0, [1])),
    quest && {
      name: quest.name,
      task: quest.tasks[0]?.task,
      steps: goals.map((goal, index) => ({ text: goal.text, done: index === 0 })),
    },
  );
  const counted = QUESTS[STORM - 1]?.tasks.findIndex((task) => task.goals.some((goal) => (goal.count ?? 1) > 1)) ?? -1;
  const many = goalsOf(STORM, counted).findIndex((goal) => (goal.count ?? 1) > 1);
  const most = goalsOf(STORM, counted)[many]?.count ?? 0;
  const counts = goalsOf(STORM, counted).map((_goal, index) => (index === many ? 2 : 0));
  assert.equal(trackedOf(onTask(STORM, counted, counts))?.steps[many]?.count, most - 2, 'what is left of it');
  assert.equal(trackedOf(onTask(0, 0)), null, 'none walked');
  assert.equal(trackedOf(onTask(STORM, 99)), null, 'a task the file does not hold');
  assert.equal(trackedOf(undefined), null, 'a room that sends none');
  assert.equal(trackedOf(onTask(1, 0, [], { claimed: false })), null, "a room's starting character, not theirs");
});

test("a counter answers the task's unmet talk goal that names it, and no other", () => {
  const houses = taskOf(1, 'hear-three-houses');
  const goals = goalsOf(1, houses);
  const [first, second] = [goals[0]?.to ?? '', goals[1]?.to ?? ''];
  const hearing = onTask(1, houses, [1, 0, 0]);
  assert.equal(talkAt(hearing, first), null, 'heard already');
  assert.equal(talkAt(hearing, second), goals[1]);
  assert.equal(talkAt(hearing, 'mage'), null, 'no goal names the Mage');
  assert.equal(talkAt(onTask(1, taskOf(1, 'choose-house')), 'veiled'), null, 'choosing a house asks a pledge');
  assert.deepEqual(
    [COUNTERS.stormcallers, COUNTERS.lamplighters, COUNTERS.veiled, COUNTERS.mage, COUNTERS.harbourmaster],
    [1, 2, 3, 10, 16],
  );
  assert.deepEqual([COUNTERS.mail, COUNTERS.stranger], [17, 18], "the Postmaster's and the stranger's");
});

test('the opening hears the stranger, then the round of the counters, each keeper with a scene of their own', () => {
  assert.deepEqual(
    QUESTS[0]?.tasks.map((task) => task.id),
    ['hear-the-stranger', 'find-your-way', 'your-ship', 'wear-them', 'hear-three-houses', 'choose-house'],
  );
  const ship = goalsOf(1, taskOf(1, 'your-ship'));
  assert.deepEqual(
    ship.map((goal) => [goal.kind, goal.to]),
    [['talk', 'harbourmaster']],
    'the Harbourmaster alone, who hands over the Sloop',
  );
  assert.ok(talkAt(onTask(1, 0), 'stranger'), 'her task waits on her');
  const round = goalsOf(1, taskOf(1, 'find-your-way'));
  assert.ok(round.every((goal) => goal.kind === 'talk' && goal.scene && COUNTERS[goal.to ?? ''] !== undefined));
});

test('a smith whose ware a buy goal of the task asks is the one it lights, until it is bought', () => {
  // No task of the file asks a purchase now the keepers give the opening's gear: a task of buy goals, made here.
  const goals: Goal[] = [
    { kind: 'buy', slot: 'melee', text: 'A Melee weapon' },
    { kind: 'buy', slot: 'head', text: 'Head armour' },
  ];
  const opening = QUESTS[0] as unknown as { tasks: unknown[] };
  opening.tasks.push({ id: 'buy-here', task: 'Buy here', goals });
  try {
    const arm = taskOf(1, 'buy-here');
    assert.equal(buyAt(onTask(1, arm), 'weaponsmith'), true);
    assert.equal(buyAt(onTask(1, arm), 'armorsmith'), true);
    assert.equal(buyAt(onTask(1, arm), 'mage'), false);
    assert.equal(buyAt(onTask(1, arm, [1, 0]), 'weaponsmith'), false, 'bought');
  } finally {
    opening.tasks.pop();
  }
  assert.equal(buyAt(onTask(1, taskOf(1, 'wear-them')), 'armorsmith'), false, 'worn is no smith of theirs');
});

test("the held map marks each node the task's goals name", () => {
  // A task of two places in two nodes, made here.
  const goals: Goal[] = [
    { kind: 'reach', node: 'gullwing-vale', place: 'Weir Mill', text: 'Weir Mill' },
    { kind: 'reach', node: 'saltgrass-downs', place: 'Saltgrass', text: 'Saltgrass' },
  ];
  const road = QUESTS[STORM - 1] as unknown as { tasks: unknown[] };
  road.tasks.push({ id: 'two-nodes', task: 'Two nodes', goals });
  try {
    const both = onTask(STORM, taskOf(STORM, 'two-nodes'));
    assert.deepEqual(goalNodes(both), ['gullwing-vale', 'saltgrass-downs']);
  } finally {
    road.tasks.pop();
  }
  assert.deepEqual(goalNodes(onTask(1, 0)), [], 'the opening names none');
});

test('a step says its scenes in order: each task done, then the task now begun; a road finished; never a begin', () => {
  const walk = (quest: number, task: number, done: number[] = [0, 0, 0, 0]) => ({ quest, task, done });
  const tasks = QUESTS[STORM - 1]?.tasks ?? [];
  const sceneList = (...scenes: (string | undefined)[]) => scenes.filter((scene) => scene !== undefined);
  assert.deepEqual(linesBetween(walk(STORM, 0), walk(STORM, 1)), sceneList(tasks[0]?.end, tasks[1]?.start));
  assert.deepEqual(
    linesBetween(walk(STORM, 0), walk(STORM, 2)),
    sceneList(tasks[0]?.end, tasks[1]?.start, tasks[1]?.end, tasks[2]?.start),
    'two at once, the one between begun and done',
  );
  assert.deepEqual(linesBetween(walk(STORM, 2), walk(STORM, 2)), [], 'a count alone says nothing');
  assert.deepEqual(linesBetween(walk(1, 1), walk(STORM, 0, [1, 0, 0, 0])), [], 'pledged: the begin is the watch’s');
  const home = tasks.length - 1;
  assert.deepEqual(linesBetween(walk(STORM, home), walk(0, 0, [1, 1, 0, 0])), sceneList(tasks[home]?.end), 'done');
  assert.deepEqual(linesBetween(walk(LAMP, 2), walk(STORM, 5)), [], 'a switch back to a road part walked');
  const back = linesBetween(walk(LAMP, 1, [1, 0, 0, 0]), walk(STORM, 0, [1, 0, 0, 0]));
  assert.deepEqual(back, [], 'a switch back to a road still on its first task');
  assert.deepEqual(beginOf(QUESTS[STORM - 1]!), sceneList(QUESTS[STORM - 1]?.begin, tasks[0]?.start));
});

test('the tracker runs a clock as m:ss for a race, a defence, a tail and an unseen step, never an escort', () => {
  assert.deepEqual(
    [clockWords(150), clockWords(64.2), clockWords(9), clockWords(0), clockWords(-3)],
    ['2:30', '1:05', '0:09', '0:00', '0:00'],
  );
  for (const [quest, kind] of [
    [STORM, 'race'],
    [STORM, 'defend'],
    [VEIL, 'tail'],
    [VEIL, 'unseen'],
  ] as const) {
    const { task, goal } = stepOf(quest, kind);
    const steps = trackedOf(onTask(quest, task, [], { clock: 7 }))?.steps;
    assert.equal(steps?.[goal]?.clock, 7, `a ${kind}'s clock`);
    assert.equal(trackedOf(onTask(quest, task, [], { clock: null }))?.steps[goal]?.clock, undefined, 'none running');
  }
  const escort = stepOf(LAMP, 'escort');
  assert.equal(trackedOf(onTask(LAMP, escort.task, [], { clock: 7 }))?.steps[escort.goal]?.clock, undefined);
});

test("a defence shows its ward's health; a puzzle its points lit of all", () => {
  const defend = stepOf(STORM, 'defend');
  const ward = { x: 0, y: 0, health: 0.64 };
  assert.equal(trackedOf(onTask(STORM, defend.task, [], { ward }))?.steps[defend.goal]?.share, 0.64);
  const waiting = trackedOf(onTask(STORM, defend.task, [], { ward, clock: 9 }))?.steps[defend.goal];
  assert.deepEqual(
    [waiting?.clock, waiting?.share],
    [9, undefined],
    'the wait, not the health, while it is tried again',
  );
  assert.equal(trackedOf(onTask(STORM, defend.task))?.steps[defend.goal]?.share, undefined, 'no ward here');
  const puzzle = stepOf(STORM, 'puzzle');
  const points = [true, true, false, false].map((lit, index) => ({ x: index, y: 0, lit }));
  assert.equal(trackedOf(onTask(STORM, puzzle.task, [], { points }))?.steps[puzzle.goal]?.count, '2/4');
  assert.equal(trackedOf(onTask(STORM, puzzle.task, [], { points: [] }))?.steps[puzzle.goal]?.count, undefined);
  assert.equal(trackedOf(onTask(STORM, puzzle.task, [1], { points }))?.steps[puzzle.goal]?.done, true);
});

test("a varied step's goal names its points and the line it fails with", () => {
  const puzzle = stepOf(VEIL, 'puzzle');
  const named = goalsOf(VEIL, puzzle.task)[puzzle.goal]?.points?.[0]?.name;
  const chest = onTask(VEIL, puzzle.task, [], { points: [{ x: 1, y: 2, lit: false }] });
  assert.deepEqual(puzzlePoints(chest), [{ name: named, index: 0, x: 1, y: 2, lit: false }]);
  assert.deepEqual(puzzlePoints({ ...chest, claimed: false }), [], "a starting character's");
  assert.deepEqual(puzzlePoints(onTask(VEIL, 0)), [], 'none in the room');
  assert.equal(goalOf(onTask(LAMP, stepOf(LAMP, 'escort').task), 'defend'), null);
  const failing = QUESTS.flatMap((quest) => quest.tasks.flatMap((task) => task.goals)).filter(
    (goal) => goal.lost ?? goal.late ?? goal.seen ?? goal.noticed ?? goal.wrong,
  );
  assert.ok(failing.length >= 8 && failing.every((goal) => failLine(goal) !== undefined), 'each failing goal its line');
});

test("no puzzle's order uses a point twice, or one it does not have", () => {
  const puzzles = QUESTS.flatMap((quest) => quest.tasks.flatMap((task) => task.goals)).filter(
    (goal) => goal.kind === 'puzzle',
  );
  assert.ok(puzzles.length > 0);
  for (const goal of puzzles) {
    const order = goal.order ?? [];
    assert.equal(new Set(order).size, order.length, `${goal.text}: a point twice`);
    assert.ok(
      order.every((place) => place >= 0 && place < (goal.points?.length ?? 0)),
      `${goal.text}: no such point`,
    );
  }
});

test('no speaker says more than two lines in a row where one scene follows another (Dialogue rule 2)', () => {
  const cast = castOf(castFile);
  const scenes = { ...scenesOf(welcome, cast), ...scenesOf(houses, cast) };
  const joined = (names: readonly (string | undefined)[]) =>
    names.flatMap((name) => (name === undefined ? [] : (scenes[name] ?? assert.fail(`${name} is not a scene`))));
  // The stranger's welcome says its scenes in turn, and the opening's begin follows it.
  const joins: (readonly (string | undefined)[])[] = [[...TOUR.map((step) => step.scene), QUESTS[0]?.begin]];
  for (const quest of QUESTS) {
    joins.push(beginOf(quest));
    quest.tasks.forEach((task, index) => {
      const next = quest.tasks[index + 1]?.start;
      joins.push([task.end, next]);
      // A goal met last says its scene before the task's end; a figure's greeting follows the task's start.
      for (const goal of task.goals) {
        if (goal.scene !== undefined) joins.push([goal.scene, task.end, next]);
        if (goal.greet !== undefined) joins.push([task.start, goal.greet]);
      }
    });
  }
  for (const names of joins) {
    let [run, last] = [0, ''];
    for (const line of joined(names)) {
      run = line.who === last ? run + 1 : 1;
      last = line.who;
      assert.ok(run <= 2, `${names.filter(Boolean).join(' then ')}: ${line.who} says ${run} lines in a row`);
    }
  }
});

test('every scene a road names is in its lines: begins, starts, ends, goals met, greetings, failures and shouts', () => {
  const scenes = scenesOf(houses, castOf(castFile));
  for (const quest of QUESTS)
    for (const named of [
      quest.begin,
      ...quest.tasks.flatMap((task) => [task.start, task.end]),
      ...quest.tasks.flatMap((task) =>
        task.goals.flatMap((goal) => [goal.scene, goal.greet, failLine(goal), goal.shout]),
      ),
    ])
      if (named !== undefined) assert.ok(scenes[named], `${quest.id} names ${named}`);
});

test('a quest offered by a keeper shows its offer at their counter, and the tracker leads there to acquire it', () => {
  const opening = questOf('house');
  const round = taskOf(opening, 'find-your-way');
  assert.equal(offeredAt(onTask(opening, 0), 'weaponsmith'), null, "not on the stranger's task");
  const waiting = onTask(opening, round, [], { offered: COUNTERS.weaponsmith });
  const offered = offeredAt(waiting, 'weaponsmith');
  assert.equal(offered?.quest.name, 'A House of Your Own');
  assert.equal(offered?.acquired, false);
  assert.equal(offeredAt(waiting, 'armorsmith'), null, 'another keeper offers it not');
  assert.deepEqual(trackedOf(waiting), {
    name: 'A House of Your Own',
    task: 'Acquire it',
    steps: [{ text: 'The Weaponsmith', done: false }],
  });
  assert.equal(talkAt(waiting, 'weaponsmith')?.text, 'The Weaponsmith', 'her keeper lit, the mark led there');
  assert.equal(talkAt(waiting, 'armorsmith'), null, 'no other word counts before');
  const acquired = onTask(opening, round, [1]);
  assert.equal(offeredAt(acquired, 'weaponsmith')?.acquired, true, 'shown acquired while it is walked');
  assert.equal(trackedOf(acquired)?.steps[0]?.done, true);
  const road = onTask(STORM, 0, [], { offered: COUNTERS.stormcallers });
  assert.equal(offeredAt(road, 'stormcallers')?.offer.story, 'stormBegin', 'a road from its leader, in their words');
});
