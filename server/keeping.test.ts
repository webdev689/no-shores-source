import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NO_WAY_HERE } from './arrival.ts';
import { Keeper, leftByWayOut, partFrom, SAVE_AFTER_CHANGE_MS, SAVE_UNCHANGED_MS } from './keeping.ts';
import { roomOf, world } from './keepingForTests.ts';

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

test('a character the room’s gate shuts is let go untouched, and its player sent away with the reason', async () => {
  const { clock, kept, token } = await world();
  const plaza = roomOf();
  plaza.held.set(1, '{"level":1}');
  const first = new Keeper(kept, plaza, 'node-overlook-social', () => undefined);
  assert.equal(
    await first.signIn(
      1,
      token,
      () => clock.now,
      () => true,
    ),
    true,
  );
  await first.leave(1);
  const abyss = roomOf((body) => (body === '{"level":1}' ? 'Abyss seas open at level 20.' : ''));
  abyss.held.set(2, '{"starting":true}');
  const sent: [number, string | undefined][] = [];
  const gated = new Keeper(kept, abyss, 'node-tidewall--abyss', (player, why) => sent.push([player, why]));
  assert.equal(
    await gated.signIn(
      2,
      token,
      () => clock.now,
      () => true,
    ),
    false,
  );
  assert.deepEqual(sent, [[2, 'Abyss seas open at level 20.']]);
  assert.equal(abyss.held.get(2), '{"starting":true}', 'never given the kept character');
  const back = roomOf();
  back.held.set(3, '{"starting":true}');
  const again = new Keeper(kept, back, 'node-overlook-social', () => undefined);
  assert.equal(
    await again.signIn(
      3,
      token,
      () => clock.now,
      () => true,
    ),
    true,
  );
  assert.equal(back.held.get(3), '{"level":1}', 'as it was kept, at once');
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

test("a leaver's chest is opened and what lies for them mailed before their last save reads it; the room lets them go last", () => {
  // The room's character for player 1: its XP, which opening the chest lying for them raises.
  let gained = 10;
  let joined = true;
  const steps: string[] = [];
  const room = {
    parting: (player: number) => {
      steps.push(`parting ${player}`);
      gained += 500;
    },
    mailLying: (player: number) => steps.push(`mail ${player}`),
    leave: (player: number) => {
      steps.push(`leave ${player}`);
      joined = false;
    },
  };
  const kept: (string | null)[] = [];
  const keeper = {
    leave: (player: number) => {
      // As Keeper.leave does: the character read at once, before any wait.
      kept.push(joined ? `{"player":${player},"xp":${gained}}` : null);
      return Promise.resolve();
    },
  };
  partFrom(room, keeper, 1, (call) => call());
  assert.deepEqual(kept, ['{"player":1,"xp":510}'], "the kept character holds the chest's XP");
  assert.deepEqual(steps, ['parting 1', 'mail 1', 'leave 1']);
  // A fault in the room is caught by the guard, and the rest still runs.
  const faulty = { ...room, parting: () => assert.fail('the room faulted') };
  const caught: unknown[] = [];
  partFrom(faulty, keeper, 1, (call) => {
    try {
      call();
    } catch (error) {
      caught.push(error);
    }
  });
  assert.equal(caught.length, 1);
  assert.deepEqual(steps.slice(-1), ['leave 1'], 'the room still lets them go');
  assert.equal(kept.length, 2, 'and their character is still kept');
});

test('a room that turns an arrival away judges before it claims, so the room playing the character keeps it', async () => {
  const { clock, kept, token } = await world();
  const plaza = roomOf();
  plaza.held.set(1, '{"level":1}');
  const lost: number[] = [];
  const first = new Keeper(kept, plaza, 'node-overlook-social', (player) => void lost.push(player));
  assert.equal(
    await first.signIn(
      1,
      token,
      () => clock.now,
      () => true,
    ),
    true,
  );
  const far = roomOf();
  far.held.set(2, '{"starting":true}');
  const sent: [number, string | undefined][] = [];
  const judging = new Keeper(kept, far, 'node-gullwing-vale', (player, why) => sent.push([player, why]));
  judging.judgingArrivals(() => false);
  assert.equal(
    await judging.signIn(
      2,
      token,
      () => clock.now,
      () => true,
    ),
    false,
  );
  assert.deepEqual(sent, [[2, NO_WAY_HERE]], 'turned away, saying why');
  plaza.held.set(1, '{"level":2}');
  first.changed(1);
  await first.due(clock.now + 3_600_000);
  assert.deepEqual(lost, [], 'the plaza still holds the character: its next save is its own');
});

test('a room that judges arrivals, whose look the accounts never answer, leaves the player unkept without a claim', async () => {
  const { clock, kept, token } = await world();
  const room = roomOf();
  room.held.set(1, '{"starting":true}');
  const claims: string[] = [];
  const silent = {
    ...kept,
    look: () => Promise.reject(new Error('the accounts are down')),
    claim: (asked: string, holder: string) => (claims.push(holder), kept.claim(asked, holder)),
  };
  const sent: [number, string | undefined][] = [];
  const judging = new Keeper(
    silent,
    room,
    'node-gullwing-vale',
    (player, why) => sent.push([player, why]),
    () => Promise.resolve(),
  );
  judging.judgingArrivals(() => true);
  assert.equal(
    await judging.signIn(
      1,
      token,
      () => clock.now,
      () => true,
    ),
    false,
  );
  assert.deepEqual(claims, [], 'never taken from the room that plays it');
  assert.deepEqual(sent, [], 'it plays on unkept');
});

test("a kept player is named in the room by their account's username, and a guest is not", async () => {
  const { clock, database, kept, token } = await world();
  const room = roomOf();
  room.held.set(1, '{"starting":true}');
  const keeper = new Keeper(kept, room, 'node-overlook', () => undefined);
  const signIn = (player: number) =>
    keeper.signIn(
      player,
      token,
      () => clock.now,
      () => true,
    );
  assert.equal(await signIn(1), true);
  assert.equal(room.named.size, 0, 'a guest has no name');
  await keeper.leave(1);
  await database.prepare("UPDATE accounts SET username = 'Mariner'").run();
  room.held.set(2, '{"starting":true}');
  assert.equal(await signIn(2), true);
  assert.equal(room.named.get(2), 'Mariner');
});

test('a player who takes a username while they play is named anew by their token, and no one by another', async () => {
  const { clock, database, kept, token } = await world();
  const room = roomOf();
  room.held.set(1, '{"starting":true}');
  const keeper = new Keeper(kept, room, 'node-overlook', () => undefined);
  assert.equal(
    await keeper.signIn(
      1,
      token,
      () => clock.now,
      () => true,
    ),
    true,
  );
  await keeper.rename(1, '0'.repeat(64));
  await keeper.rename(2, token);
  assert.equal(room.named.size, 0, 'a token that is no session, and a player not kept, name no one');
  await database.prepare("UPDATE accounts SET username = 'Mariner'").run();
  await keeper.rename(1, token);
  assert.equal(room.named.get(1), 'Mariner');
});

test('a room whose gate shuts on an arrival judges before it claims, so the room playing the character keeps it', async () => {
  const { clock, kept, token } = await world();
  const plaza = roomOf();
  plaza.held.set(1, '{"level":1}');
  const lost: number[] = [];
  const first = new Keeper(kept, plaza, 'node-overlook-social', (player) => void lost.push(player));
  assert.equal(
    await first.signIn(
      1,
      token,
      () => clock.now,
      () => true,
    ),
    true,
  );
  first.changed(1);
  await first.due(clock.now + SAVE_AFTER_CHANGE_MS);
  const abyss = roomOf((body) => (body === '{"level":1}' ? 'Abyss seas open at level 20.' : ''));
  abyss.held.set(2, '{"starting":true}');
  const sent: [number, string | undefined][] = [];
  const gated = new Keeper(kept, abyss, 'sea--abyss', (player, why) => sent.push([player, why]));
  assert.equal(
    await gated.signIn(
      2,
      token,
      () => clock.now,
      () => true,
    ),
    false,
  );
  assert.deepEqual(sent, [[2, 'Abyss seas open at level 20.']], 'turned away, saying why');
  plaza.held.set(1, '{"level":2}');
  first.changed(1);
  await first.due(clock.now + 3_600_000);
  assert.deepEqual(lost, [], 'the plaza still holds the character: its next save is its own');
});

test("a character's body says it left by a dungeon's way out only when its room kept it so", () => {
  assert.equal(leftByWayOut(JSON.stringify({ left: { minute: 1, out: true } })), true, 'by its door or open portal');
  assert.equal(leftByWayOut(JSON.stringify({ left: { minute: 1, out: false } })), false, 'from within it');
  assert.equal(leftByWayOut(JSON.stringify({ left: { minute: 1 } })), false, 'kept before the word');
  assert.equal(leftByWayOut(JSON.stringify({ start: 1 })), false, 'no body left anywhere');
  assert.equal(leftByWayOut(null), false, 'no character');
  assert.equal(leftByWayOut('not json'), false, 'one the room cannot read');
});
