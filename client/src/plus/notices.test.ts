import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NoticeStack, slidIn } from './notices.ts';

const words = (stack: NoticeStack) => stack.rows.map((row) => row.text);

test('the notices stand newest last, three at most, and one said again moves to the foot', () => {
  const stack = new NoticeStack();
  const told: string[] = [];
  stack.show(['No guns bear there.', 'The Tithe Brig surrenders!'], 0, (text) => told.push(text));
  assert.deepEqual(words(stack), ['No guns bear there.', 'The Tithe Brig surrenders!']);
  stack.show(['The Tithe Brig surrenders!', 'No guns bear there.'], 1, (text) => told.push(text));
  assert.deepEqual(words(stack), ['The Tithe Brig surrenders!', 'No guns bear there.'], 'said again, it is newest');
  assert.deepEqual(told, ['No guns bear there.', 'The Tithe Brig surrenders!'], 'a line is told once, as it comes');
  stack.show(['a', 'b', 'c', 'd'], 2);
  assert.deepEqual(words(stack), ['b', 'c', 'd']);
  stack.show([], 3);
  assert.deepEqual(words(stack), [], 'none shows none');
});

test('a row in order keeps the moment it came, so only a new or moved one slides in again', () => {
  const stack = new NoticeStack();
  stack.show(['a', 'b'], 0);
  stack.show(['a', 'b', 'c'], 5);
  assert.deepEqual(
    stack.rows.map((row) => row.since),
    [0, 0, 5],
  );
  stack.show(['a', 'c', 'b'], 9);
  assert.deepEqual(
    stack.rows.map((row) => row.since),
    [0, 9, 9],
    'a stays first; c and b are laid again after it',
  );
});

test('a notice slides in over 0.26 s in four steps, and at once with less motion', () => {
  assert.equal(slidIn(0, 0, false), 0);
  assert.equal(slidIn(0, 0.07, false), 0.25);
  assert.equal(slidIn(0, 0.2, false), 0.75);
  assert.equal(slidIn(0, 0.3, false), 1);
  assert.equal(slidIn(0, 0, true), 1);
});
