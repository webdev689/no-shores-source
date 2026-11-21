import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handle } from './accounts/accounts.ts';
import { characters } from './accounts/characters.ts';
import { sqliteForTests } from './accounts/sqliteForTests.ts';
import { Keeper, type KeptRoom, SAVE_AFTER_CHANGE_MS, SAVE_UNCHANGED_MS } from './keeping.ts';

/** A room on land whose players' characters are plain strings; `{` starts one it can read. */
function roomOf(): KeptRoom & { readonly held: Map<number, string> } {
  const held = new Map<number, string>();
  return {
    held,
    character: (player) => held.get(player) ?? null,
    restoreCharacter: (player, kept) => kept.startsWith('{') && held.has(player) && Boolean(held.set(player, kept)),
    own: (player) => held.has(player),
  };
}

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
  return { database, clock, kept, token };
}

test('a signed-in player plays their kept character, saved after a change and kept while they play', async () => {
  const { clock, kept, token } = await world();
  const room = roomOf();
  room.held.set(1, '{"starting":true}');
  const lost: number[] = [];
  const keeper = new Keeper(kept, room, 'node-overlook', (player) => lost.push(player));
  assert.equal(
    await keeper.signIn(
      1,
      token,
      () => clock.now,
      () => true,
    ),
    true,
  );
  assert.equal(
    await keeper.signIn(
      1,
      token,
      () => clock.now,
      () => true,
    ),
    false,
    'once a socket',
  );
  // Nothing was kept yet, so the starting character is saved soon, as any change is.
  clock.now += SAVE_AFTER_CHANGE_MS;
  await keeper.due(clock.now);
  room.held.set(1, '{"xp":10}');
  keeper.changed(1);
  await keeper.due(clock.now + 1);
  clock.now += SAVE_AFTER_CHANGE_MS;
  await keeper.due(clock.now);
  room.held.set(1, '{"xp":11}');
  keeper.changed(1);
  // As the room server leaves: the keeper is told first, unawaited, and the room forgets the player at once.
  const leaving = keeper.leave(1);
  room.held.delete(1);
  await leaving;

  // Back in another room, the character comes back as it was left.
  const next = roomOf();
  next.held.set(7, '{"starting":true}');
  const again = new Keeper(kept, next, 'node-isle', () => undefined);
  assert.equal(
    await again.signIn(
      7,
      token,
      () => clock.now,
      () => true,
    ),
    true,
  );
  assert.equal(next.held.get(7), '{"xp":11}', 'with the change made just before leaving');
  assert.deepEqual(lost, []);
});

test('a player whose character another room took is let go; a token that is no session keeps nothing', async () => {
  const { clock, kept, token } = await world();
  const [first, second] = [roomOf(), roomOf()];
  first.held.set(1, '{}');
  second.held.set(2, '{}');
  const lost: number[] = [];
  const firstKeeper = new Keeper(kept, first, 'node-a', (player) => lost.push(player));
  await firstKeeper.signIn(
    1,
    token,
    () => clock.now,
    () => true,
  );
  const secondKeeper = new Keeper(kept, second, 'node-b', () => undefined);
  assert.equal(
    await secondKeeper.signIn(
      2,
      token,
      () => clock.now,
      () => true,
    ),
    true,
    'taken after the wait',
  );
  await firstKeeper.due(clock.now + SAVE_UNCHANGED_MS);
  assert.deepEqual(lost, [1]);

  const third = roomOf();
  third.held.set(3, '{}');
  assert.equal(
    await new Keeper(kept, third, 'node-c', () => undefined).signIn(
      3,
      'a'.repeat(64),
      () => 0,
      () => true,
    ),
    false,
  );
  assert.equal(
    await new Keeper(null, third, 'node-c', () => undefined).signIn(
      3,
      token,
      () => 0,
      () => true,
    ),
    false,
  );
});

test('a character this room cannot read, or a player gone before the claim is answered, is let go untouched', async () => {
  const { clock, kept, token } = await world();
  const room = roomOf();
  room.held.set(1, 'not readable');
  const keeper = new Keeper(kept, room, 'node-a', () => undefined);
  await keeper.signIn(
    1,
    token,
    () => clock.now,
    () => true,
  );
  await keeper.leave(1);
  // Kept as something no room reads: the next room is handed it as it is and refuses it, saving nothing over it.
  const other = roomOf();
  other.held.set(4, '{"mine":1}');
  const otherKeeper = new Keeper(kept, other, 'node-b', () => undefined);
  assert.equal(
    await otherKeeper.signIn(
      4,
      token,
      () => clock.now,
      () => true,
    ),
    false,
  );
  assert.equal(other.held.get(4), '{"mine":1}');
  const gone = new Keeper(kept, roomOf(), 'node-c', () => undefined);
  const leaving = roomOf();
  leaving.held.set(5, '{}');
  const leavingKeeper = new Keeper(kept, leaving, 'node-d', () => undefined);
  assert.equal(
    await leavingKeeper.signIn(
      5,
      token,
      () => clock.now,
      () => false,
    ),
    false,
  );
  assert.equal(
    await gone.signIn(
      9,
      token,
      () => clock.now,
      () => true,
    ),
    false,
    'no such player',
  );
});

test('a leaving player whose release the accounts do not answer has their last save made all the same', async () => {
  const { clock, kept, token } = await world();
  const room = roomOf();
  room.held.set(1, '{"starting":true}');
  const asked: string[] = [];
  const flaky = {
    ...kept,
    release: () => {
      asked.push('release');
      return Promise.reject(new Error('the accounts are not answering'));
    },
    save: (account: string, holder: string, body: string) => {
      asked.push('save');
      return kept.save(account, holder, body);
    },
  };
  const waited: number[] = [];
  const keeper = new Keeper(
    flaky,
    room,
    'node-overlook',
    () => undefined,
    (millis) => {
      waited.push(millis);
      return Promise.resolve();
    },
  );
  assert.equal(
    await keeper.signIn(
      1,
      token,
      () => clock.now,
      () => true,
    ),
    true,
  );
  room.held.set(1, '{"xp":7}');
  const leaving = keeper.leave(1);
  room.held.delete(1);
  await leaving;
  assert.deepEqual(asked, ['release', 'release', 'release', 'release', 'release', 'save']);
  assert.deepEqual(waited, [1_000, 4_000, 15_000, 40_000], 'each try after a longer wait, through a minute out');
  const back = await kept.claim(token, 'room-b:1');
  assert.equal(back?.body, '{"xp":7}', 'the last save is kept');
});

test('a change that changed nothing is not saved again, and a leaving save waits for one under way', async () => {
  const { clock, kept, token } = await world();
  const room = roomOf();
  room.held.set(1, '{"xp":1}');
  const saved: string[] = [];
  let landSave = () => undefined as void;
  const slow = {
    ...kept,
    save: async (account: string, holder: string, body: string) => {
      saved.push(body);
      if (body === '{"xp":2}') await new Promise<void>((resolve) => (landSave = resolve));
      return kept.save(account, holder, body);
    },
    release: (account: string, holder: string, body: string | null) => {
      saved.push(`release ${body}`);
      return kept.release(account, holder, body);
    },
  };
  const keeper = new Keeper(slow, room, 'node-overlook', () => undefined);
  await keeper.signIn(
    1,
    token,
    () => clock.now,
    () => true,
  );
  clock.now += SAVE_AFTER_CHANGE_MS;
  await keeper.due(clock.now);
  keeper.changed(1);
  clock.now += SAVE_AFTER_CHANGE_MS;
  await keeper.due(clock.now);
  assert.deepEqual(saved, ['{"xp":1}'], 'a refused ask leaves nothing new to save');

  room.held.set(1, '{"xp":2}');
  keeper.changed(1);
  clock.now += SAVE_AFTER_CHANGE_MS;
  const saving = keeper.due(clock.now);
  room.held.set(1, '{"xp":3}');
  const leaving = keeper.leave(1);
  room.held.delete(1);
  await Promise.resolve();
  assert.deepEqual(saved, ['{"xp":1}', '{"xp":2}'], 'the release waits for the save under way');
  landSave();
  await Promise.all([saving, leaving]);
  assert.deepEqual(saved, ['{"xp":1}', '{"xp":2}', 'release {"xp":3}']);
  assert.equal((await kept.claim(token, 'room-b:1'))?.body, '{"xp":3}', 'the newest lands last');
});

test('a new account’s character is the one the room holds, given back to the room so it keeps it', async () => {
  const { clock, kept, token } = await world();
  const room = roomOf();
  room.held.set(1, '{"starting":true}');
  const given: string[] = [];
  const restore = room.restoreCharacter;
  room.restoreCharacter = (player, body) => (given.push(body), restore(player, body));
  const keeper = new Keeper(kept, room, 'sea', () => undefined);
  assert.equal(
    await keeper.signIn(
      1,
      token,
      () => clock.now,
      () => true,
    ),
    true,
  );
  assert.deepEqual(given, ['{"starting":true}'], 'no kept character yet: the room’s own, given back');
});
