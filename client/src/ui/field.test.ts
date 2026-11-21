import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allSelected, emptyField, erased, moved, replaced, selected, typed } from './field.ts';

test('typing goes in at the caret, over the selection, and no further than the most', () => {
  const start = { text: 'hello', caret: 2, anchor: 2 };
  assert.deepEqual(typed(start, 'XY'), { text: 'heXYllo', caret: 4, anchor: 4 });
  assert.deepEqual(typed({ text: 'hello', caret: 1, anchor: 4 }, 'a'), { text: 'hao', caret: 2, anchor: 2 });
  assert.deepEqual(typed(emptyField('abc'), 'defg', 5), { text: 'abcde', caret: 5, anchor: 5 });
  assert.deepEqual(replaced(emptyField('abc'), 0, 1, 'zz', Infinity, 1), { text: 'zzbc', caret: 1, anchor: 1 });
});

test('Backspace and Delete take a character, a whole pair, a word, or the selection', () => {
  assert.deepEqual(erased(emptyField('abc'), -1), emptyField('ab'));
  assert.deepEqual(erased({ text: 'abc', caret: 0, anchor: 0 }, 1), { text: 'bc', caret: 0, anchor: 0 });
  assert.deepEqual(erased(emptyField('a😀'), -1), emptyField('a'), 'an emoji is one character');
  assert.deepEqual(erased(emptyField('one two'), -1, true), emptyField('one '));
  assert.deepEqual(erased({ text: 'abcd', caret: 3, anchor: 1 }, -1), { text: 'ad', caret: 1, anchor: 1 });
  assert.deepEqual(erased({ text: 'ab', caret: 0, anchor: 0 }, -1), { text: 'ab', caret: 0, anchor: 0 });
});

test('the caret moves by character, word and end, and Shift grows the selection', () => {
  const field = emptyField('one two');
  assert.equal(moved(field, -1, false).caret, 6);
  assert.equal(moved(field, -1, false, true).caret, 4);
  assert.equal(moved(field, 'start', false).caret, 0);
  const grown = moved(moved(field, -1, true), -1, true);
  assert.equal(selected(grown), 'wo');
  assert.equal(moved(grown, 1, false).caret, 7, 'an arrow without Shift goes to the selection’s end');
  assert.equal(selected(allSelected(field)), 'one two');
});

test('a field kept to its most never cuts a pair in half', () => {
  assert.deepEqual(typed(emptyField('abc'), '😀', 4), { text: 'abc', caret: 3, anchor: 3 });
  assert.deepEqual(typed(emptyField('ab'), 'x😀', 4), { text: 'abx', caret: 3, anchor: 3 });
  assert.deepEqual(typed(emptyField('ab'), '😀', 4), { text: 'ab😀', caret: 4, anchor: 4 });
});
