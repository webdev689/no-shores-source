import assert from 'node:assert/strict';
import { test } from 'node:test';
import { justMet } from '../tasks.ts';
import { type Done, Lessons } from './lessons.ts';

const STILL: Done = { x: 10, y: 20, yaw: 0, action: 'idle', foes: 0, boss: false };
const ticked = (lessons: Lessons, done: Done) =>
  lessons
    .frame(done)
    .steps.filter((step) => step.done)
    .map((step) => step.text);

test('waking, the tasks teach the controls, none of them done', () => {
  const quest = new Lessons().frame(STILL);
  assert.equal(quest.task, 'Learn the controls');
  assert.deepEqual(
    quest.steps.map((step) => [step.text, step.done]),
    [
      ['Move', false],
      ['Look round', false],
      ['Attack', false],
      ['Block or dodge', false],
    ],
  );
});

test('each control is ticked off once the player does it, and stays ticked', () => {
  const lessons = new Lessons();
  lessons.frame(STILL);
  assert.deepEqual(ticked(lessons, { ...STILL, x: 11 }), [], 'a step short of the mark');
  assert.deepEqual(ticked(lessons, { ...STILL, x: 12.5 }), ['Move']);
  assert.deepEqual(ticked(lessons, { ...STILL, yaw: 0.6 }), ['Move'], 'a glance short of a look round');
  assert.deepEqual(ticked(lessons, { ...STILL, yaw: -0.5 }), ['Move', 'Look round'], 'turns add up either way');
  assert.deepEqual(ticked(lessons, { ...STILL, action: 'attack' }), ['Move', 'Look round', 'Attack']);
});

test('a dodge or a guard both learn the last control, and then the fight takes over', () => {
  for (const action of ['guard', 'dodge']) {
    const lessons = new Lessons();
    lessons.frame(STILL);
    lessons.frame({ ...STILL, x: 13, yaw: 1.2, action: 'attack' });
    assert.equal(lessons.frame({ ...STILL, action }).task, 'Fight your way through the wreck', action);
  }
});

test('the first foes standing begin the fight with what is left of the lessons, never going back to them', () => {
  const lessons = new Lessons();
  lessons.frame(STILL);
  const fight = lessons.frame({ ...STILL, foes: 3 });
  assert.equal(fight.task, 'Fight your way through the wreck');
  assert.deepEqual(fight.steps, [{ text: 'Foes standing', count: 3 }]);
  assert.deepEqual(lessons.frame(STILL).steps, [], 'between waves');
  assert.equal(lessons.frame(STILL).task, 'Fight your way through the wreck');
  assert.equal(lessons.frame({ ...STILL, boss: true }).task, 'Face Captain Brannoc Thule');
});

test('a step just met is told from one of a new task, which never flashes', () => {
  const lessons = new Lessons();
  const first = lessons.frame(STILL);
  const moved = lessons.frame({ ...STILL, x: 13 });
  assert.deepEqual(justMet(first, moved), [0]);
  assert.deepEqual(justMet(moved, lessons.frame({ ...STILL, x: 13 })), [], 'met already');
  assert.deepEqual(justMet(moved, lessons.frame({ ...STILL, foes: 2 })), [], 'a new task');
  assert.deepEqual(justMet(null, moved), []);
});

test('a turn across due south counts its true size, and rising from death counts the walk again', () => {
  const lessons = new Lessons();
  lessons.frame({ ...STILL, yaw: 3.1 });
  assert.deepEqual(ticked(lessons, { ...STILL, yaw: -3.1 }), [], 'a small turn across the wrap');
  lessons.frame({ ...STILL, x: 11.5, action: 'dead' });
  assert.deepEqual(ticked(lessons, { ...STILL, x: 40 }), [], 'raised far off, not walked');
  assert.deepEqual(ticked(lessons, { ...STILL, x: 42.5 }), ['Move']);
});
