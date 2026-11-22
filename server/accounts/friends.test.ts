import assert from 'node:assert/strict';
import { test } from 'node:test';
import { characters } from './characters.ts';
import { accounts, slowly } from './accountsForTests.ts';
import { FRIENDS_MOST } from './friends.ts';
import type { Roster } from './roster.ts';

type Ask = ReturnType<typeof accounts>['ask'];

/** A player's friends as the Roster lists them: each friend by name and whether they play, and the asks either way. */
async function listOf(ask: Ask, token: string) {
  const roster = (await ask('GET', '/v1/roster', undefined, token)).body as unknown as Roster;
  return {
    friends: roster.friends.map((each) => ({ name: each.name, playing: each.place !== null })),
    asking: roster.asking.map((each) => each.name),
    asked: roster.asked.map((each) => each.name),
  };
}

/** Asks of the friends' routes as the player holding `token`. */
const friend = (ask: Ask, asked: 'ask' | 'accept' | 'remove', name: unknown, token: string) =>
  ask('POST', `/v1/social/friend/${asked}`, { name }, token);

/** How many friends and own asks a player's list counts toward their most. */
async function mine(ask: Ask, token: string): Promise<number> {
  const list = await listOf(ask, token);
  return list.friends.length + list.asked.length;
}

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
  assert.equal((await friend(ask, 'ask', 'BEN', ada)).status, 200, 'however it is typed');
  assert.deepEqual(await listOf(ask, ada), { friends: [], asking: [], asked: ['Ben'] });
  assert.deepEqual(await listOf(ask, ben), { friends: [], asking: ['Ada'], asked: [] });
  assert.equal((await friend(ask, 'ask', 'Ben', ada)).status, 409, 'asked already');
  assert.equal((await friend(ask, 'ask', 'Ada', ada)).status, 400, 'not of oneself');
  assert.equal((await friend(ask, 'accept', 'Ben', ada)).status, 404, 'only the one asked');
  assert.equal((await friend(ask, 'accept', 'Ada', ben)).status, 200);
  assert.deepEqual(await listOf(ask, ben), { friends: [{ name: 'Ada', playing: false }], asking: [], asked: [] });
  assert.equal((await friend(ask, 'ask', 'Ada', ben)).status, 409, 'friends already');
  assert.equal((await friend(ask, 'remove', 'Ada', ben)).status, 200);
  assert.deepEqual(await listOf(ask, ada), { friends: [], asking: [], asked: [] }, 'either may end it');
});

test('an ask that crosses one already made accepts it; no one is found by a name they lack', async () => {
  const { ask, ada, cal } = await three();
  await friend(ask, 'ask', 'Cal', ada);
  assert.equal((await friend(ask, 'ask', 'Ada', cal)).status, 200);
  assert.deepEqual((await listOf(ask, ada)).friends, [{ name: 'Cal', playing: false }]);
  assert.equal((await friend(ask, 'ask', 'Nobody', ada)).status, 404);
  assert.equal((await friend(ask, 'ask', 7, ada)).status, 404, 'no one has a name that is not one');
});

test('a guest has no friends until it takes a username', async () => {
  const { ask } = await three();
  const guest = (await ask('POST', '/v1/guest')).body['token'] as string;
  const refused = await ask('GET', '/v1/roster', undefined, guest);
  assert.equal(refused.status, 409);
  assert.equal(refused.body['error'], 'Add a username in Settings to use the Roster.');
  assert.equal((await friend(ask, 'ask', 'Ada', guest)).status, 409);
  assert.equal((await ask('GET', '/v1/roster')).status, 401);
});

test('a friend is playing while a room holds their character, and not once the hold lapses', async () => {
  const { ask, deps, clock, ada, ben } = await three();
  await friend(ask, 'ask', 'Ben', ada);
  await friend(ask, 'accept', 'Ada', ben);
  const kept = characters(
    deps.database,
    () => clock.now,
    () => Promise.resolve(),
  );
  await kept.claim(ben, 'node-overlook-social:1');
  const friends = async () => (await listOf(ask, ada)).friends;
  assert.deepEqual(await friends(), [{ name: 'Ben', playing: true }]);
  clock.now += 61_000;
  assert.deepEqual(await friends(), [{ name: 'Ben', playing: false }]);
});

test('two asks that cross at once make one friendship, never two waiting rows', async () => {
  const world = accounts();
  slowly(world.deps);
  const named = async (username: string) => {
    const token = (await world.ask('POST', '/v1/guest')).body['token'] as string;
    await world.ask('POST', '/v1/register', { username, password: 'long enough' }, token);
    return token;
  };
  const [ada, ben] = [await named('Ada'), await named('Ben')];
  await Promise.all([friend(world.ask, 'ask', 'Ben', ada), friend(world.ask, 'ask', 'Ada', ben)]);
  assert.deepEqual(await listOf(world.ask, ada), {
    friends: [{ name: 'Ben', playing: false }],
    asking: [],
    asked: [],
  });
});

test('strangers cannot fill a list: a player counts only friends and their own asks', async () => {
  const { ask, ada, ben, cal } = await three();
  await friend(ask, 'ask', 'Ada', ben);
  await friend(ask, 'ask', 'Ada', cal);
  assert.equal((await friend(ask, 'ask', 'Ben', ada)).status, 200, 'their ask is accepted');
  assert.equal(await mine(ask, ada), 1, 'one friend; Cal’s ask does not count against Ada');
});

test('the one asked is counted as the asker is, so strangers asking cannot close their list to a friend', async () => {
  const { ask, deps, ada, cal } = await three();
  const { database } = deps;
  const ben = await database.prepare("SELECT id FROM accounts WHERE username = 'Ben'").first<{ id: string }>();
  const crowd = async (asking: boolean) => {
    for (let index = 0; index < FRIENDS_MOST; index++) {
      const stranger = `stranger-${asking}-${index}`;
      await database.prepare('INSERT INTO accounts (id, created_at) VALUES (?1, 0)').bind(stranger).run();
      const [asker, asked] = asking ? [stranger, ben?.id] : [ben?.id, stranger];
      await database
        .prepare('INSERT INTO friends (asker_id, asked_id, created_at) VALUES (?1, ?2, 0)')
        .bind(asker, asked)
        .run();
    }
  };
  await crowd(true);
  assert.equal((await friend(ask, 'ask', 'Ben', ada)).status, 200, "a hundred strangers' asks leave room");
  await crowd(false);
  const full = await friend(ask, 'ask', 'Ben', cal);
  assert.deepEqual([full.status, full.body['error']], [409, 'Their list is full.'], 'a hundred of his own asks do not');
});

test('a full list accepts no ask, by accepting it or by asking back', async () => {
  const { ask, deps, ada, ben } = await three();
  const { database } = deps;
  const own = await database.prepare("SELECT id FROM accounts WHERE username = 'Ada'").first<{ id: string }>();
  assert.equal((await friend(ask, 'ask', 'Ada', ben)).status, 200, 'Ben asks while she has room');
  for (let index = 0; index < FRIENDS_MOST; index++) {
    const stranger = `stranger-${index}`;
    await database.prepare('INSERT INTO accounts (id, created_at) VALUES (?1, 0)').bind(stranger).run();
    await database
      .prepare('INSERT INTO friends (asker_id, asked_id, created_at) VALUES (?1, ?2, 0)')
      .bind(own?.id, stranger)
      .run();
  }
  const full = `You can keep ${FRIENDS_MOST} friends and asks at most.`;
  for (const asked of ['accept', 'ask'] as const) {
    const answer = await friend(ask, asked, 'Ben', ada);
    assert.deepEqual([answer.status, answer.body['error']], [409, full], asked);
  }
  assert.equal(await mine(ask, ada), FRIENDS_MOST);
  assert.deepEqual((await listOf(ask, ada)).asking, ['Ben'], 'his ask still waits');
  const never = await friend(ask, 'accept', 'Cal', ada);
  assert.deepEqual([never.status, never.body['error']], [404, 'They have not asked you.'], 'no name told apart');
});

test('accepting or removing tells nothing of which names exist', async () => {
  const { ask, ada } = await three();
  const nobody = await friend(ask, 'accept', 'Nobody', ada);
  const someone = await friend(ask, 'accept', 'Ben', ada);
  assert.deepEqual([nobody.status, nobody.body], [someone.status, someone.body]);
  assert.equal((await friend(ask, 'remove', 'Nobody', ada)).status, 200);
  assert.equal((await friend(ask, 'ask', '', ada)).status, 404, 'an empty name is no one');
});

test("friends are served only by the Roster's routes", async () => {
  const { ask, ada } = await three();
  assert.equal((await ask('GET', '/v1/friends', undefined, ada)).status, 404);
  assert.equal((await ask('POST', '/v1/friends/ask', { name: 'Ben' }, ada)).status, 404);
  assert.deepEqual((await listOf(ask, ada)).asked, [], 'and the ask was not made');
});
