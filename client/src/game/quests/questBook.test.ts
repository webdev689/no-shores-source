import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { QuestState } from '../../network/gearMessages.ts';
import castFile from '../../../../content/story/cast.json' with { type: 'json' };
import houses from '../../../../content/story/houses.json' with { type: 'json' };
import welcome from '../../../../content/story/welcome.json' with { type: 'json' };
import { castOf, scenesOf } from '../../speech/cast.ts';
import { COUNTERS, QUESTS, beginOf, goalNodes, linesBetween, markedGoal, talkAt, trackedOf } from './questBook.ts';

/** A player on quest `quest` (counted from 1) at task `task`, its goals' counts `counts`. */
const onTask = (quest: number, task: number, counts: number[] = []): QuestState => ({
  quest,
  task,
  counts,
  done: [0, 0, 0, 0],
  choices: [0, 0, 0],
  at: null,
});
/** The Stormcallers' road, the second quest in the file. */
const STORM = QUESTS.findIndex((quest) => quest.id === 'stormcallers') + 1;

test('the tracker shows the quest walked: its name, its task, and each goal with what is left of its count', () => {
  assert.equal(STORM, 2);
  assert.deepEqual(trackedOf(onTask(STORM, 1, [2, 3])), {
    name: 'The Stolen Storm',
    task: 'Take back the storm-glass',
    steps: [
      { text: 'Tithe at Tithe Camp', done: false, count: 3 },
      { text: 'Brineglass to gather', done: true },
    ],
  });
  assert.deepEqual(trackedOf(onTask(1, 0, [1]))?.steps, [
    { text: 'Arlo Kestrel, of the Stormcallers', done: true },
    { text: 'Maren Hale, of the Lamplighters', done: false },
    { text: 'Sable, of the Veiled', done: false },
  ]);
  assert.equal(trackedOf(onTask(0, 0)), null, 'none walked');
  assert.equal(trackedOf(onTask(STORM, 99)), null, 'a task the file does not hold');
  assert.equal(trackedOf(undefined), null, 'a room that sends none');
});

test("a counter answers the task's unmet talk goal that names it, and no other", () => {
  const hearing = onTask(1, 0, [1, 0, 0]);
  assert.equal(talkAt(hearing, 'stormcallers'), null, 'Arlo Kestrel heard already');
  assert.equal(talkAt(hearing, 'lamplighters')?.scene, 'houseLamp');
  assert.equal(talkAt(hearing, 'mage'), null, 'no goal names the Mage');
  assert.equal(talkAt(onTask(1, 1), 'veiled'), null, 'choosing a house asks a pledge, not a word');
  assert.equal(
    talkAt(onTask(STORM, 9), 'stormcallers')?.text,
    'Arlo Kestrel, in the Hall of the Arts',
    'the road home',
  );
  assert.deepEqual(
    [COUNTERS.stormcallers, COUNTERS.lamplighters, COUNTERS.veiled, COUNTERS.mage, COUNTERS.harbourmaster],
    [1, 2, 3, 10, 16],
  );
});

test("the HUD marks the task's first unmet goal with a place; the held map the nodes its goals name", () => {
  const grey = QUESTS[STORM - 1]?.tasks.findIndex((task) => task.task === 'Light at Grey Point') ?? -1;
  assert.equal(markedGoal(onTask(STORM, grey, [0, 0]))?.text, 'Grey Point Light, on the Driftwood Moors');
  assert.equal(markedGoal(onTask(STORM, grey, [1, 2]))?.text, "Pell's guards", 'the light reached, its guards next');
  assert.equal(markedGoal(onTask(STORM, grey, [1, 4])), null, 'all met');
  assert.deepEqual(goalNodes(onTask(STORM, grey)), ['driftwood-moors'], 'named once');
  assert.deepEqual(goalNodes(onTask(STORM, grey + 1)), ['maw-shallows']);
  assert.equal(markedGoal(onTask(STORM, grey + 1)), null, 'an instance entered has no place');
  assert.deepEqual(goalNodes(onTask(1, 0)), [], 'the opening names none');
});

test('a step says its scenes in order: each task done, then the task now begun; a road finished; never a begin', () => {
  const walk = (quest: number, task: number, done: number[] = [0, 0, 0, 0]) => ({ quest, task, done });
  assert.deepEqual(linesBetween(walk(STORM, 0), walk(STORM, 1)), ['stormBeacon', 'stormCamp']);
  assert.deepEqual(linesBetween(walk(STORM, 0), walk(STORM, 2)), ['stormBeacon', 'stormGlass'], 'two at once');
  assert.deepEqual(linesBetween(walk(STORM, 2), walk(STORM, 2)), [], 'a count alone says nothing');
  assert.deepEqual(linesBetween(walk(1, 1), walk(STORM, 0, [1, 0, 0, 0])), [], 'pledged: the begin is the watch’s');
  assert.deepEqual(linesBetween(walk(STORM, 9), walk(0, 0, [1, 1, 0, 0])), ['stormHome'], 'the road done');
  assert.deepEqual(linesBetween(walk(3, 2), walk(STORM, 5)), [], 'a switch back to a road part walked');
  const back = linesBetween(walk(3, 1, [1, 0, 0, 0]), walk(STORM, 0, [1, 0, 0, 0]));
  assert.deepEqual(back, [], 'a switch back to a road still on its first task');
  assert.deepEqual(beginOf(QUESTS[STORM - 1]!), ['stormBegin']);
});

test('no speaker says more than two lines in a row where one scene follows another (Dialogue rule 2)', () => {
  const cast = castOf(castFile);
  const scenes = { ...scenesOf(welcome, cast), ...scenesOf(houses, cast) };
  const joined = (names: readonly (string | undefined)[]) =>
    names.flatMap((name) => (name === undefined ? [] : (scenes[name] ?? assert.fail(`${name} is not a scene`))));
  const joins: (readonly (string | undefined)[])[] = [['welcomeLamplighters', 'houseBegin']];
  for (const quest of QUESTS) {
    joins.push(beginOf(quest));
    quest.tasks.forEach((task, index) => joins.push([task.end, quest.tasks[index + 1]?.start]));
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
