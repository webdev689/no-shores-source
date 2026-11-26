import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ASHORE_EVERY_MS, Ashore, placeOf } from './ashore.ts';
import type { Reach } from './arrival.ts';

const reach = (social: boolean): Reach => ({ social, continent: 'continent-1', coast: [], gatedFrom: [] });

test('a room names its players to the seas they land from, at its island', () => {
  assert.deepEqual(placeOf('node-overlook-social', reach(true), null), {
    seas: ['sea', 'sea--elite', 'sea--abyss'],
    island: { continent: 'continent-1' },
  });
  assert.deepEqual(placeOf('node-gullwing-vale--elite', reach(false), null), {
    seas: ['sea--elite'],
    island: { continent: 'continent-1' },
  });
  assert.deepEqual(placeOf('node-gullwing-vale--elite--dungeon-1--run-a1b2c3d4', reach(false), null)?.seas, [
    'sea--elite',
  ]);
  // A run started at sea is entered from any tier's sea, so its players' ships may lie in any of them.
  assert.deepEqual(placeOf('node-krakens-grotto--sea--run-k3j4h5g6', null, null), {
    seas: ['sea', 'sea--elite', 'sea--abyss'],
    island: null,
  });
  assert.deepEqual(placeOf('isle-7-00000000000000ff--elite', null, { id: 7, seed: '255', sea: 'sea--elite' }), {
    seas: ['sea--elite'],
    island: { island: 7, seed: '255' },
  });
  assert.equal(placeOf('node-gullwing-vale', null, null), null, 'a node whose island is unknown');
  assert.equal(placeOf('fleet-trial', null, null), null, 'a room on no island');
});

test('the seas are told as an account is known and every 15 s, and their answers handed to the room', async () => {
  const words: [string, string][] = [];
  const answers: Record<string, string> = {
    sea: '[{"account":"ann","number":3}]',
    'sea--elite': '[{"account":"bea","number":3}]',
    'sea--abyss': '',
  };
  let given = '';
  const place = { seas: ['sea', 'sea--elite', 'sea--abyss'], island: { continent: 'continent-1' } };
  const sea = (name: string) => ({
    ashoreWord: (word: string) => {
      words.push([name, word]);
      const answer = answers[name];
      return answer === undefined ? Promise.reject(new Error('gone')) : Promise.resolve(answer);
    },
  });
  const ashore = new Ashore(sea, (ships) => (given = ships));
  ashore.own(4, 'ann');
  assert.equal(words.length, 0, 'a room on no island names no one');
  ashore.stand(place);
  ashore.own(4, 'ann');
  await new Promise((settled) => setImmediate(settled));
  assert.deepEqual(words.at(0), ['sea', '{"accounts":["ann"],"continent":"continent-1"}']);
  assert.deepEqual(
    (JSON.parse(given) as { number: number }[]).map((ship) => ship.number),
    [3, 3 + 2 ** 30],
    'each sea after the first its numbers set apart',
  );
  words.length = 0;
  ashore.due(Date.now());
  assert.equal(words.length, 0, 'not again so soon');
  delete answers['sea--elite'];
  ashore.left(4);
  ashore.due(Date.now() + ASHORE_EVERY_MS);
  await new Promise((settled) => setImmediate(settled));
  assert.deepEqual(words.at(0), ['sea', '{"accounts":[],"continent":"continent-1"}'], 'one gone is named no more');
  assert.equal((JSON.parse(given) as unknown[]).length, 2, 'a sea that did not answer keeps its last answer');
});
