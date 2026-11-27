import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ASHORE_EVERY_MS, Ashore, placeOf } from './ashore.ts';
import type { Reach } from './arrival.ts';

const reach = (): Reach => ({ continent: 'continent-1', coast: [], gatedFrom: [], locked: false, ports: [] });

/** The one sea, at Normal, and the three tiers' seas a room's naming may still be handed. */
const [SEAS, TIERED] = [['sea'], ['sea', 'sea--elite', 'sea--abyss']];

/** A room's word on a player for the seas, as `room_named` gives it: only player 4's account, Ann's, is known. */
const named = (player: number) => (player === 4 ? '{"account":"ann","hull":2,"level":9}' : '');

test('every room on land names its players to the one sea, at Normal, at its island', () => {
  assert.deepEqual(placeOf('node-overlook-social', reach(), null), {
    seas: SEAS,
    island: { continent: 'continent-1' },
    draws: true,
  });
  assert.deepEqual(placeOf('node-gullwing-vale--elite', reach(), null), {
    seas: SEAS,
    island: { continent: 'continent-1' },
    draws: true,
  });
  assert.deepEqual(placeOf('node-gullwing-vale--elite--dungeon-1--run-a1b2c3d4', reach(), null)?.seas, SEAS);
  assert.deepEqual(placeOf('node-krakens-grotto--sea--run-k3j4h5g6', null, null), {
    seas: SEAS,
    island: null,
    draws: false,
  });
  assert.deepEqual(placeOf('isle-7-00000000000000ff--elite', null, { id: 7, seed: '255' }), {
    seas: SEAS,
    island: { island: 7, seed: '255' },
    draws: true,
  });
  assert.deepEqual(placeOf('passage-continent-1-w12-z3--run-a1b2c3d4', null, null), {
    seas: SEAS,
    island: { continent: 'continent-1' },
    draws: false,
  });
  // Only an island's own ground draws the ships parked off it: a dungeon, a run or a passage zone names its players,
  // keeping their ships seen at sea, but is sent none.
  assert.equal(placeOf('node-gullwing-vale--dungeon-1', reach(), null)?.draws, false);
  assert.equal(placeOf('sea-dungeon-continent-1-crypt-0000002a', null, { id: 7, seed: '42' })?.draws, false);
  assert.equal(placeOf('node-gullwing-vale', null, null), null, 'a node whose island is unknown');
  assert.equal(placeOf('fleet-trial', null, null), null, 'a room on no island');
});

test('the seas are told as an account is known and every 15 s, and their answers handed to the room', async () => {
  const words: [string, string][] = [];
  const answers: Record<string, string> = {
    sea: '{"ships":[{"account":"ann","number":3}],"taken":[5,9]}',
    'sea--elite': '{"ships":[{"account":"bea","number":3}],"taken":[9]}',
    'sea--abyss': '',
  };
  let given = '';
  const place = { seas: TIERED, island: { continent: 'continent-1' }, draws: true };
  const sea = (name: string) => ({
    ashoreWord: (word: string) => {
      words.push([name, word]);
      const answer = answers[name];
      return answer === undefined ? Promise.reject(new Error('gone')) : Promise.resolve(answer);
    },
  });
  const ashore = new Ashore(sea, (ships) => (given = ships), named);
  ashore.own(4, 'ann');
  assert.equal(words.length, 0, 'a room on no island names no one');
  ashore.stand(place);
  ashore.own(4, 'ann');
  ashore.own(5, 'bea');
  await new Promise((settled) => setImmediate(settled));
  const { seconds, ...first } = JSON.parse(words.at(0)?.[1] ?? '{}') as { seconds: number };
  const ann = { account: 'ann', hull: 2, level: 9 };
  assert.deepEqual([words.at(0)?.[0], first], ['sea', { named: [ann], continent: 'continent-1' }]);
  const last = JSON.parse(words.at(-1)?.[1] ?? '{}') as { named: unknown[] };
  assert.deepEqual(last.named, [ann], 'each as the room has their character now, none it holds no account of');
  assert.ok(Math.abs(seconds * 1000 - Date.now()) < 2000, "each word carries the host's time, by which namings lapse");
  const handed = JSON.parse(given) as { ships: { number: number }[]; taken: number[] };
  assert.deepEqual(
    handed.ships.map((ship) => ship.number),
    [3, 3 + 2 ** 30],
    'each sea after the first its numbers set apart',
  );
  assert.deepEqual(handed.taken, [5, 9], 'every traffic ship the seas have taken, each once');
  words.length = 0;
  ashore.due(Date.now());
  assert.equal(words.length, 0, 'not again so soon');
  delete answers['sea--elite'];
  ashore.left(4);
  const later = Date.now() + ASHORE_EVERY_MS;
  ashore.due(later);
  await new Promise((settled) => setImmediate(settled));
  ashore.left(5);
  const again = `{"named":[],"continent":"continent-1","seconds":${Math.floor(later / 1000)}}`;
  assert.deepEqual(words.at(0), ['sea', again], 'one gone is named no more');
  assert.equal(
    (JSON.parse(given) as { ships: unknown[] }).ships.length,
    2,
    'a sea that did not answer keeps its last answer',
  );
});

test('a room whose page draws no parked ships names its players to the seas but is handed none', async () => {
  const words: string[] = [];
  const sea = () => ({
    ashoreWord: (word: string) => {
      words.push(word);
      return Promise.resolve('{"ships":[{"account":"ann","number":3}],"taken":[]}');
    },
  });
  let given: string | null = null;
  const ashore = new Ashore(sea, (ships) => (given = ships), named);
  ashore.stand({ seas: SEAS, island: { continent: 'continent-1' }, draws: false });
  ashore.own(4, 'ann');
  await new Promise((settled) => setImmediate(settled));
  assert.equal(words.length, 1, 'named to the sea, so its ship stays seen there');
  assert.equal(given, null);
});

test('a sea’s last answer is handed on no longer than 45 s once it stops answering', async () => {
  let answering = true;
  const sea = () => ({
    ashoreWord: () =>
      answering
        ? Promise.resolve('{"ships":[{"account":"ann","number":3}],"taken":[5]}')
        : Promise.reject(new Error('gone')),
  });
  let given = '';
  const ashore = new Ashore(sea, (ships) => (given = ships), named);
  ashore.stand({ seas: ['sea'], island: { continent: 'continent-1' }, draws: true });
  const start = Date.now();
  ashore.own(4, 'ann');
  await new Promise((settled) => setImmediate(settled));
  assert.equal((JSON.parse(given) as { ships: unknown[] }).ships.length, 1);
  answering = false;
  for (const after of [15_000, 30_000, 45_000]) {
    ashore.due(start + after);
    await new Promise((settled) => setImmediate(settled));
    assert.equal((JSON.parse(given) as { ships: unknown[] }).ships.length, 1, `kept ${after / 1000} s on`);
  }
  ashore.due(start + 60_000);
  await new Promise((settled) => setImmediate(settled));
  assert.equal(given, '{"ships":[],"taken":[]}', 'past 45 s, as its namings there have lapsed');
});

test('a sea that learns a player’s account tells no other, the one sea letting their parked ship go itself', () => {
  const words: [string, string][] = [];
  const sea = (name: string) => ({
    ashoreWord: (word: string) => {
      words.push([name, word]);
      return Promise.resolve('{"ships":[],"taken":[]}');
    },
  });
  const ashore = new Ashore(sea, () => undefined, named);
  ashore.own(4, 'ann', 0);
  assert.deepEqual(words, []);
});
