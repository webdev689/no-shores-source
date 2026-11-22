import assert from 'node:assert/strict';
import { test } from 'node:test';
import castFile from '../../../../content/story/cast.json' with { type: 'json' };
import houses from '../../../../content/story/houses.json' with { type: 'json' };
import welcome from '../../../../content/story/welcome.json' with { type: 'json' };
import type { QuestState } from '../../network/questMessages.ts';
import { castOf, scenesOf } from '../../speech/cast.ts';
import { clockWords } from '../tasks.ts';
import {
  COUNTERS,
  type Goal,
  QUESTS,
  beginOf,
  failLine,
  goalNodes,
  goalOf,
  linesBetween,
  markedGoal,
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
  const goals = goalsOf(1, 0);
  const [first, second] = [goals[0]?.to ?? '', goals[1]?.to ?? ''];
  const hearing = onTask(1, 0, [1, 0, 0]);
  assert.equal(talkAt(hearing, first), null, 'heard already');
  assert.equal(talkAt(hearing, second), goals[1]);
  assert.equal(talkAt(hearing, 'mage'), null, 'no goal names the Mage');
  assert.equal(talkAt(onTask(1, 1), 'veiled'), null, 'choosing a house asks a pledge, not a word');
  assert.deepEqual(
    [COUNTERS.stormcallers, COUNTERS.lamplighters, COUNTERS.veiled, COUNTERS.mage, COUNTERS.harbourmaster],
    [1, 2, 3, 10, 16],
  );
});

test("the HUD marks the task's first unmet goal standing somewhere in the node the player is in", () => {
  // A task of two places in two nodes, made here: the mark in each node is its own goal's.
  const goals: Goal[] = [
    { kind: 'reach', node: 'gullwing-vale', place: 'Weir Mill', text: 'Weir Mill' },
    { kind: 'reach', node: 'saltgrass-downs', place: 'Saltgrass', text: 'Saltgrass' },
  ];
  const road = QUESTS[STORM - 1] as unknown as { tasks: unknown[] };
  road.tasks.push({ id: 'two-nodes', task: 'Two nodes', goals });
  try {
    const both = onTask(STORM, taskOf(STORM, 'two-nodes'));
    assert.equal(markedGoal(both, 'gullwing-vale'), goals[0]);
    assert.equal(markedGoal(both, 'saltgrass-downs'), goals[1], 'not the first goal of another node');
    assert.equal(markedGoal({ ...both, counts: [0, 1] }, 'saltgrass-downs'), null, 'met');
    assert.equal(markedGoal(both, 'driftwood-moors'), null);
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

test("a varied step's goal names its mark, its points and the line it fails with", () => {
  for (const [quest, kind] of [
    [LAMP, 'escort'],
    [STORM, 'race'],
    [VEIL, 'tail'],
    [LAMP, 'defend'],
    [STORM, 'puzzle'],
    [VEIL, 'unseen'],
  ] as const) {
    const { task, goal } = stepOf(quest, kind);
    const named = goalsOf(quest, task)[goal];
    const first = goalsOf(quest, task).find(
      (each) => each.node === named?.node && (each.place ?? each.from ?? each.checkpoints),
    );
    assert.equal(markedGoal(onTask(quest, task), named?.node ?? ''), first, `a ${kind} stands somewhere marked`);
  }
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
  const joins: (readonly (string | undefined)[])[] = [['welcomeLamplighters', 'houseBegin']];
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
