import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Aboard, NOT_ABOARD, aboardAsked } from './aboard.ts';

const join = (query: string) => new Request(`https://rooms/room/sea${query}`);

test('a join names the company member whose ship it travels aboard by a username, or none', () => {
  assert.equal(aboardAsked(join('?aboard=Ann_1')), 'Ann_1');
  for (const query of ['', '?aboard=', '?aboard=a', '?aboard=1ann', '?aboard=Ann%20Bea'])
    assert.equal(aboardAsked(join(query)), null, query);
});

test('a passenger asks the sea as they join and boards on their company’s word once their account is known', async () => {
  const [asked, boarded, sent]: [number[], [number, string][], [number, string][]] = [[], [], []];
  const room = {
    askAboard: (player: number) => asked.push(player) > 0 && player !== 3,
    goAboard: (player: number, word: string) => boarded.push([player, word]) > 0 && player === 1,
  };
  const company = (account: string) =>
    account === 'gone' ? Promise.reject(new Error('down')) : Promise.resolve([account, 'ann']);
  const aboard = new Aboard(room, company, (player, why) => sent.push([player, why]));
  aboard.joined(1, join('?aboard=Ann'));
  aboard.joined(2, join('?aboard=Ann'));
  aboard.joined(3, join('?aboard=Ann'));
  aboard.joined(4, join(''));
  assert.deepEqual(asked, [1, 2, 3], 'only a join that asks');
  await aboard.owned(1, 'bea');
  await aboard.owned(2, 'gone');
  await aboard.owned(3, 'cal');
  await aboard.owned(4, 'dee');
  assert.deepEqual(boarded, [
    [1, '{"captain":"Ann","company":["bea","ann"]}'],
    [2, '{"captain":"Ann","company":[]}'],
  ]);
  assert.deepEqual(sent, [[2, NOT_ABOARD]], 'sent away where no such ship of their company sails');
  await aboard.owned(1, 'bea');
  assert.equal(boarded.length, 2, 'boarded once');
});
