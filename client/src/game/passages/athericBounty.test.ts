import assert from 'node:assert/strict';
import { test } from 'node:test';
import { wordsIn } from '../../ui/uiForTests.ts';
import { athericCardNode, athericCards, lampCold } from './athericBounty.ts';

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
  assert.ok(said.includes('3. Defeat 100 foes there with a thunderlock'));
  assert.ok(
    !said.some((line) => line.includes('heavier than it looks')),
    'the find’s words are its moment’s, not the card’s',
  );
});

test('a bounty finished shows every step done; one not held shows no card', () => {
  const [card] = athericCards([{ id: 'lanternfall', step: 0, count: 0, finished: true }]);
  assert.ok(card?.steps.every((step) => step.state === 'done'));
  assert.ok(card && wordsIn(athericCardNode(card)).includes('Lanternfall is yours'));
  assert.deepEqual(athericCards([]), []);
  assert.deepEqual(athericCards(undefined), []);
});

test('the fourth lamp stands cold only for one on Lanternfall’s last step, on Saltmere', () => {
  const last = [{ id: 'lanternfall', step: 3, count: 0, finished: false }];
  assert.equal(lampCold(last, 'continent-1', 4), true);
  assert.equal(lampCold(last, 'continent-1', 3), false, 'another lamp');
  assert.equal(lampCold(last, 'continent-2', 4), false, 'another island');
  assert.equal(lampCold([{ ...last[0]!, step: 2 }], 'continent-1', 4), false, 'an earlier step');
  assert.equal(lampCold([{ ...last[0]!, finished: true }], 'continent-1', 4), false, 'finished');
  assert.equal(lampCold(undefined, 'continent-1', 4), false);
});
