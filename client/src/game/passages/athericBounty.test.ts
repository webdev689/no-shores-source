import assert from 'node:assert/strict';
import { test } from 'node:test';
import { wordsIn } from '../../ui/uiForTests.ts';
import { athericCardNode, athericCards } from './athericBounty.ts';

test('Lanternfall’s bounty held on its third step: two done, the third under way with its count, the last to come', () => {
  const [card] = athericCards([{ id: 'lanternfall', step: 2, count: 37, finished: false }]);
  assert.equal(card?.name, 'Lanternfall');
  assert.deepEqual(
    card?.steps.map((step) => [step.state, step.count, step.target]),
    [
      ['done', 1, 1],
      ['done', 5, 5],
      ['under way', 37, 100],
      ['to come', 0, 1],
    ],
  );
  const said = card ? wordsIn(athericCardNode(card)) : [];
  assert.ok(said.includes('37/100'));
  assert.ok(said.includes('Cold Lantern. Cold, and heavier than it looks. Something in it still wants to burn.'));
});

test('a bounty finished shows every step done; one not held shows no card', () => {
  const [card] = athericCards([{ id: 'lanternfall', step: 0, count: 0, finished: true }]);
  assert.ok(card?.steps.every((step) => step.state === 'done'));
  assert.ok(card && wordsIn(athericCardNode(card)).includes('Finished: Lanternfall is yours.'));
  assert.deepEqual(athericCards([]), []);
  assert.deepEqual(athericCards(undefined), []);
});
