import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Quest, sameQuest } from './tasks.ts';

const quest = (count: number, done = false): Quest => ({
  name: 'The Fissure',
  task: 'The High Downs',
  steps: [{ text: 'Carry shards to the fissure', count, done, keys: ['E'] }],
});

test('two quests read alike only when every word, count, key and tick is the same', () => {
  assert.ok(sameQuest(quest(3), quest(3)), 'alike, though not the same object');
  assert.ok(sameQuest(null, null));
  assert.ok(!sameQuest(quest(3), null));
  assert.ok(!sameQuest(quest(3), quest(2)), 'a count changed');
  assert.ok(!sameQuest(quest(3), quest(3, true)), 'a step met');
  assert.ok(!sameQuest(quest(3), { ...quest(3), steps: [] }), 'a step gone');
  assert.ok(!sameQuest(quest(3), { ...quest(3), steps: [{ text: 'Carry shards to the fissure', count: 3 }] }), 'a key gone');
});
