import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Kept } from './kept.ts';

test('a value is shared while held, and of those let go only the newest few are kept', () => {
  const dropped: string[] = [];
  const kept = new Kept<string, string>(1, (value) => dropped.push(value));
  assert.equal(kept.take('woodland'), undefined, 'nothing made yet');
  kept.keep('woodland', 'woods');
  assert.equal(kept.take('woodland'), 'woods', 'a second view shares it');
  kept.give('woodland');
  kept.give('woodland');
  assert.deepEqual(dropped, [], 'let go by both, it is kept for the next');
  kept.keep('desert', 'sands');
  kept.give('desert');
  assert.deepEqual(dropped, ['woods'], 'one let go of more recently: the older is dropped');
  assert.equal(kept.take('woodland'), undefined);
  assert.equal(kept.take('desert'), 'sands', 'taken again, without being made again');
  kept.keep('steppe', 'grass');
  kept.give('steppe');
  assert.deepEqual(dropped, ['woods'], 'one held and one let go: nothing more dropped');
});
