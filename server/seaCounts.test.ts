import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handle } from './accounts/accounts.ts';
import { characters } from './accounts/characters.ts';
import { sqliteForTests } from './accounts/sqliteForTests.ts';
import { countAtSea } from './seaCounts.ts';

/** The accounts on a fresh database, and a guest's session token. */
async function world() {
  const database = sqliteForTests();
  const clock = { now: 5_000_000 };
  const kept = characters(
    database,
    () => clock.now,
    () => Promise.resolve(),
  );
  const guest = await handle(new Request('https://a.test/v1/guest', { method: 'POST' }), {
    database,
    now: () => clock.now,
    discord: null,
    pages: [],
  });
  const { token } = (await guest.json()) as { token: string };
  return { kept, token };
}

test('a ship sunk is counted for each player at sea who fought her, never taking one another room holds', async () => {
  const { kept, token } = await world();
  const land = 'node-overlook-social:1';
  const account = (await kept.claim(token, land))?.account ?? '';
  assert.equal(await kept.save(account, land, '{"kept":1}'), true);
  const asked: string[] = [];
  const count = (ask: string) => (asked.push(ask), '{"kept":2}');
  const down = { water: 'continent-4', rank: 3, players: [account] };
  const tokens = new Map([[account, token]]);
  await countAtSea([down], tokens, kept, count, 29_919_420);
  assert.deepEqual(asked, [], 'held on land: not counted');
  assert.equal(await kept.save(account, land, '{"kept":1}'), true, 'and never taken from the room that holds it');
  await kept.release(account, land, '{"kept":1}');
  await countAtSea([down, { ...down, players: ['not-at-sea'] }], tokens, kept, count, 29_919_420);
  assert.deepEqual(
    asked.map((ask) => JSON.parse(ask) as unknown),
    [{ kept: '{"kept":1}', water: 'continent-4', rank: 3, minute: 29_919_420 }],
  );
  assert.equal((await kept.claim(token, 'node-overlook-social:2'))?.body, '{"kept":2}', 'kept as counted, and let go');
});

test('a ship down that moved nothing leaves the character as kept, and a refused claim counts nothing', async () => {
  const { kept, token } = await world();
  const account = (await kept.claim(token, 'node-overlook-social:1'))?.account ?? '';
  await kept.release(account, 'node-overlook-social:1', '{"kept":1}');
  const down = { water: null, rank: 1, players: [account] };
  await countAtSea([down], new Map([[account, token]]), kept, () => '', 29_919_420);
  assert.equal((await kept.claim(token, 'node-overlook-social:2'))?.body, '{"kept":1}', 'untouched');
  await kept.release(account, 'node-overlook-social:2', null);
  await countAtSea([down], new Map([[account, 'not a session']]), kept, () => '{"kept":3}', 29_919_420);
  assert.equal((await kept.claim(token, 'node-overlook-social:3'))?.body, '{"kept":1}', 'no session: not counted');
  assert.equal(await kept.present(token, 'sea'), account, 'present answers the account');
  assert.equal(await kept.present('not a session', 'sea'), null);
});
