import assert from 'node:assert/strict';
import { test } from 'node:test';
import { characters } from './characters.ts';
import { accounts } from './accountsForTests.ts';

/** A world with three named players, and each one's token. */
async function three() {
  const world = accounts();
  const named = async (username: string) => {
    const token = (await world.ask('POST', '/v1/guest')).body['token'] as string;
    await world.ask('POST', '/v1/register', { username, password: 'long enough' }, token);
    return token;
  };
  return { ...world, ada: await named('Ada'), ben: await named('Ben'), cal: await named('Cal') };
}

test('a player asks another by username; the one asked accepts, and each lists the other', async () => {
  const { ask, ada, ben } = await three();
  const list = async (token: string) => (await ask('GET', '/v1/friends', undefined, token)).body;
  assert.equal((await ask('POST', '/v1/friends/ask', { name: 'BEN' }, ada)).status, 200, 'however it is typed');
  assert.deepEqual(await list(ada), { friends: [], asking: [], asked: ['Ben'] });
  assert.deepEqual(await list(ben), { friends: [], asking: ['Ada'], asked: [] });
  assert.equal((await ask('POST', '/v1/friends/ask', { name: 'Ben' }, ada)).status, 409, 'asked already');
  assert.equal((await ask('POST', '/v1/friends/accept', { name: 'Ada' }, ada)).status, 400, 'not of oneself');
  assert.equal((await ask('POST', '/v1/friends/accept', { name: 'Ben' }, ada)).status, 404, 'only the one asked');
  assert.equal((await ask('POST', '/v1/friends/accept', { name: 'Ada' }, ben)).status, 200);
  assert.deepEqual(await list(ben), { friends: [{ name: 'Ada', playing: false }], asking: [], asked: [] });
  assert.equal((await ask('POST', '/v1/friends/ask', { name: 'Ada' }, ben)).status, 409, 'friends already');
  assert.equal((await ask('POST', '/v1/friends/remove', { name: 'Ada' }, ben)).status, 200);
  assert.deepEqual(await list(ada), { friends: [], asking: [], asked: [] }, 'either may end it');
});

test('an ask that crosses one already made accepts it; no one is found by a name they lack', async () => {
  const { ask, ada, cal } = await three();
  await ask('POST', '/v1/friends/ask', { name: 'Cal' }, ada);
  assert.equal((await ask('POST', '/v1/friends/ask', { name: 'Ada' }, cal)).status, 200);
  assert.deepEqual((await ask('GET', '/v1/friends', undefined, ada)).body['friends'], [
    { name: 'Cal', playing: false },
  ]);
  assert.equal((await ask('POST', '/v1/friends/ask', { name: 'Nobody' }, ada)).status, 404);
  assert.equal((await ask('POST', '/v1/friends/ask', { name: 7 }, ada)).status, 400);
});

test('a guest has no friends until it takes a username', async () => {
  const { ask } = await three();
  const guest = (await ask('POST', '/v1/guest')).body['token'] as string;
  const refused = await ask('GET', '/v1/friends', undefined, guest);
  assert.equal(refused.status, 409);
  assert.equal(refused.body['error'], 'Add a username in Settings to have friends.');
  assert.equal((await ask('GET', '/v1/friends')).status, 401);
});

test('a friend is playing while a room holds their character, and not once the hold lapses', async () => {
  const { ask, deps, clock, ada, ben } = await three();
  await ask('POST', '/v1/friends/ask', { name: 'Ben' }, ada);
  await ask('POST', '/v1/friends/accept', { name: 'Ada' }, ben);
  const kept = characters(
    deps.database,
    () => clock.now,
    () => Promise.resolve(),
  );
  await kept.claim(ben, 'node-overlook-social:1');
  const friends = async () => (await ask('GET', '/v1/friends', undefined, ada)).body['friends'];
  assert.deepEqual(await friends(), [{ name: 'Ben', playing: true }]);
  clock.now += 61_000;
  assert.deepEqual(await friends(), [{ name: 'Ben', playing: false }]);
});
