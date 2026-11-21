import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handle } from './accounts/accounts.ts';
import { accounts } from './accounts/accountsForTests.ts';
import { characters } from './accounts/characters.ts';
import { foundRun } from './accounts/finding.ts';
import { sqliteForTests } from './accounts/sqliteForTests.ts';
import {
  ACCOUNTS_TROUBLE,
  Keeper,
  type KeptRoom,
  SAVE_AFTER_CHANGE_MS,
  SAVE_UNCHANGED_MS,
  SIGN_IN_FOR_RUN,
} from './keeping.ts';

/** A room on land whose players' characters are plain strings; `{` starts one it can read. Its gate shuts as `gate`
 *  says, open to all unless told. */
function roomOf(gate: (kept: string | null) => string = () => ''): KeptRoom & { readonly held: Map<number, string> } {
  const held = new Map<number, string>();
  return {
    held,
    character: (player) => held.get(player) ?? null,
    restoreCharacter: (player, kept) => kept.startsWith('{') && held.has(player) && Boolean(held.set(player, kept)),
    own: (player) => held.has(player),
    shut: (_player, kept) => gate(kept),
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

test('a run its gate shuts judges before it claims, so the room playing the character keeps it', async () => {
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
  await first.due(clock.now + 3_600_000);
  const run = roomOf((body) => (body === '{"level":1}' ? 'Abyss seas open at level 20.' : ''));
  run.held.set(2, '{"starting":true}');
  const sent: [number, string | undefined][] = [];
  const gated = new Keeper(kept, run, 'node-tidewall--abyss--run-k3j4h5g6', (player, why) => sent.push([player, why]));
  gated.forCompany();
  assert.equal(
    await gated.signIn(
      2,
      token,
      () => clock.now,
      () => true,
    ),
    false,
  );
  assert.deepEqual(sent, [[2, 'Abyss seas open at level 20.']], 'turned away with the reason');
  plaza.held.set(1, '{"level":2}');
  first.changed(1);
  await first.due(clock.now + 7_200_000);
  assert.deepEqual(lost, [], 'the plaza still holds the character: its next save is its own');
});

test('a run’s room keeps to the company of those it let in, though they all left a while', async () => {
  const made = accounts();
  const tokens: Record<string, string> = {};
  for (const name of ['Ada', 'Ben', 'Cal']) {
    tokens[name] = (await made.ask('POST', '/v1/guest')).body['token'] as string;
    await made.ask('POST', '/v1/register', { username: name, password: 'long enough' }, tokens[name]);
  }
  await made.ask('POST', '/v1/social/company/invite', { name: 'Ben' }, tokens['Ada']);
  await made.ask('POST', '/v1/social/company/accept', { name: 'Ada' }, tokens['Ben']);
  const kept = characters(
    made.deps.database,
    () => made.clock.now,
    () => Promise.resolve(),
  );
  const room = roomOf();
  for (const player of [1, 2, 3, 4]) room.held.set(player, '{"starting":true}');
  const sent: [number, string | undefined][] = [];
  const name = 'node-krakens-grotto--run-k3j4h5g6';
  const keeper = new Keeper(kept, room, name, (player, why) => sent.push([player, why])).forCompany();
  const [now, here] = [() => made.clock.now, () => true];
  assert.equal(await keeper.signIn(1, tokens['Ada'] ?? '', now, here), true, 'the first comes in');
  assert.equal(await keeper.signIn(2, tokens['Cal'] ?? '', now, here), false);
  assert.deepEqual(sent, [[2, "This run is another company's."]]);
  assert.equal(room.held.get(2), '{"starting":true}', 'never given the kept character');
  assert.equal(await keeper.signIn(3, tokens['Ben'] ?? '', now, here), true, 'in Ada’s company');
  await keeper.leave(1);
  await keeper.leave(3);
  assert.equal(await keeper.signIn(4, tokens['Cal'] ?? '', now, here), false, 'none kept, and still theirs');
  assert.equal(await keeper.signIn(1, tokens['Ada'] ?? '', now, here), true, 'Ada back in her run');
  await made.ask('POST', '/v1/social/company/leave', {}, tokens['Ben']);
  assert.equal(await keeper.signIn(3, tokens['Ben'] ?? '', now, here), true, 'let in before, though out of it now');
});

test('a run keeps no one unkept: a token that is no session, none in time, or no answer sends them away', async () => {
  const { clock, kept, token } = await world();
  const room = roomOf();
  for (const player of [1, 2, 3, 4, 5]) room.held.set(player, '{"starting":true}');
  const sent: unknown[][] = [];
  const told = (player: number, why?: string, rejoinable?: boolean) => void sent.push([player, why, rejoinable]);
  const run = 'node-krakens-grotto--run-k3j4h5g6';
  const keeper = new Keeper(kept, room, run, told, () => Promise.resolve()).forCompany();
  const [now, here] = [() => clock.now, () => true];
  assert.equal(await keeper.signIn(1, 'f'.repeat(64), now, here), false);
  assert.deepEqual(sent, [[1, SIGN_IN_FOR_RUN, false]], 'not a session: sign in, and joining again will not help');
  await keeper.tokenDue(2, () => false, here);
  await keeper.tokenDue(3, () => true, here);
  assert.deepEqual(sent.slice(1), [[2, SIGN_IN_FOR_RUN, false]], 'no token after the wait; a token on its way is not');
  const down = { ...kept, claim: () => Promise.reject(new Error('the accounts are down')) };
  const cut = new Keeper(down, room, run, told, () => Promise.resolve()).forCompany();
  assert.equal(await cut.signIn(4, token, now, here), false);
  assert.deepEqual(sent.slice(2), [[4, ACCOUNTS_TROUBLE, true]], 'joining again may find the accounts back');
  assert.ok(keeper.waiting(5) && keeper.waiting(2), 'none plays a run until kept');
  assert.equal(await keeper.signIn(5, token, now, here), true, 'a player kept is let in');
  assert.equal(keeper.waiting(5), false, 'and plays from then on');
  const open = new Keeper(kept, room, 'node-saltgrass-downs', told, () => Promise.resolve());
  assert.equal(open.waiting(2), false, 'any other room lets a player play while they sign in');
  await open.tokenDue(2, () => false, here);
  assert.equal(await open.signIn(2, 'f'.repeat(64), now, here), false);
  assert.equal(sent.length, 3, 'any other room still lets a player play unkept');
});

test('a run asks again for a player’s company the accounts did not give, then sends them to try again', async () => {
  const { clock, kept, token } = await world();
  const room = roomOf();
  for (const player of [1, 2]) room.held.set(player, '{"starting":true}');
  const sent: unknown[][] = [];
  const told = (player: number, why?: string, rejoinable?: boolean) => void sent.push([player, why, rejoinable]);
  const [now, here, run] = [() => clock.now, () => true, 'node-krakens-grotto--run-k3j4h5g6'];
  let failures = 2;
  const shaky = {
    ...kept,
    companions: (account: string, room: string) =>
      failures-- > 0 ? Promise.reject(new Error('the accounts are down')) : kept.companions(account, room),
  };
  const keeper = new Keeper(shaky, room, run, told, () => Promise.resolve()).forCompany();
  assert.equal(await keeper.signIn(1, token, now, here), true, 'answered on the third ask');
  await keeper.leave(1);
  const down = { ...kept, companions: () => Promise.reject(new Error('the accounts are down')) };
  const cut = new Keeper(down, room, run, told, () => Promise.resolve()).forCompany();
  assert.equal(await cut.signIn(2, token, now, here), false);
  assert.deepEqual(sent, [[2, 'Something went wrong. Try again.', true]], 'not another company’s: joining again');
});

test('a run found for strangers lets in each one found for it, and none of them into another run', async () => {
  const made = accounts();
  const tokens: Record<string, string> = {};
  for (const name of ['Ada', 'Ben', 'Cal']) {
    tokens[name] = (await made.ask('POST', '/v1/guest')).body['token'] as string;
    await made.ask('POST', '/v1/register', { username: name, password: 'long enough' }, tokens[name]);
  }
  const kept = characters(
    made.deps.database,
    () => made.clock.now,
    () => Promise.resolve(),
  );
  const idOf = async (name: string) => {
    const claimed = await kept.claim(tokens[name] ?? '', `probe:${name}`);
    await kept.release(claimed?.account ?? '', `probe:${name}`, null);
    return claimed?.account ?? '';
  };
  const [ada, ben] = [await idOf('Ada'), await idOf('Ben')];
  assert.equal(
    await foundRun(made.deps.database, 'node-krakens-grotto--run-k3j4h5g6', [ada, ben], made.clock.now),
    true,
  );
  const sent: [number, string | undefined][] = [];
  const [now, here] = [() => made.clock.now, () => true];
  const room = roomOf();
  for (const player of [1, 2, 3]) room.held.set(player, '{"starting":true}');
  const told = (player: number, why?: string) => void sent.push([player, why]);
  const run = new Keeper(kept, room, 'node-krakens-grotto--run-k3j4h5g6', told).forCompany();
  assert.equal(await run.signIn(1, tokens['Ada'] ?? '', now, here), true);
  assert.equal(await run.signIn(2, tokens['Ben'] ?? '', now, here), true, 'found with Ada');
  assert.equal(await run.signIn(3, tokens['Cal'] ?? '', now, here), false);
  await run.leave(2);
  const elsewhere = roomOf();
  for (const player of [4, 5]) elsewhere.held.set(player, '{"starting":true}');
  const other = new Keeper(kept, elsewhere, 'node-krakens-grotto--run-a1b2c3d4', told).forCompany();
  assert.equal(await other.signIn(4, tokens['Cal'] ?? '', now, here), true, 'none let in yet: whoever has the name');
  assert.equal(await other.signIn(5, tokens['Ben'] ?? '', now, here), false, 'found with Ada for another run');
  assert.deepEqual(sent, [
    [3, "This run is another company's."],
    [5, "This run is another company's."],
  ]);
});

test('one account is one player in a room: a second socket signed in sends the first away and is kept', async () => {
  const { clock, kept, token } = await world();
  const room = roomOf();
  room.held.set(1, '{}');
  room.held.set(2, '{}');
  const sent: [number, string | undefined][] = [];
  const keeper = new Keeper(kept, room, 'node-a', (player, why) => sent.push([player, why]));
  const [now, here] = [() => clock.now, () => true];
  assert.equal(await keeper.signIn(1, token, now, here), true);
  assert.equal(await keeper.signIn(2, token, now, here), true, 'the newer socket is kept');
  assert.deepEqual(sent, [[1, undefined]], 'the older is sent away as played elsewhere');
  await keeper.due(clock.now + SAVE_UNCHANGED_MS);
  assert.deepEqual(sent, [[1, undefined]], 'and the newer keeps its hold');
});

test('a run is full by its four accounts: a member signing in again is kept, a fifth account refused', async () => {
  const made = accounts();
  const tokens: Record<string, string> = {};
  for (const name of ['Ada', 'Ben', 'Cal', 'Dee', 'Eve']) {
    tokens[name] = (await made.ask('POST', '/v1/guest')).body['token'] as string;
    await made.ask('POST', '/v1/register', { username: name, password: 'long enough' }, tokens[name]);
  }
  for (const name of ['Ben', 'Cal', 'Dee']) {
    await made.ask('POST', '/v1/social/company/invite', { name }, tokens['Ada']);
    await made.ask('POST', '/v1/social/company/accept', { name: 'Ada' }, tokens[name]);
  }
  const kept = characters(
    made.deps.database,
    () => made.clock.now,
    () => Promise.resolve(),
  );
  const room = roomOf();
  for (const player of [1, 2, 3, 4, 5, 6]) room.held.set(player, '{"starting":true}');
  const sent: [number, string | undefined][] = [];
  const keeper = new Keeper(kept, room, 'node-krakens-grotto--run-k3j4h5g6', (player, why) => {
    sent.push([player, why]);
  }).forCompany();
  const [now, here] = [() => made.clock.now, () => true];
  for (const [player, name] of [
    [1, 'Ada'],
    [2, 'Ben'],
    [3, 'Cal'],
    [4, 'Dee'],
  ] as const)
    assert.equal(await keeper.signIn(player, tokens[name] ?? '', now, here), true, name);
  assert.equal(await keeper.signIn(5, tokens['Ada'] ?? '', now, here), true, 'Ada again, her old socket still open');
  assert.deepEqual(sent, [[1, undefined]], 'the old one sent away');
  assert.equal(await keeper.signIn(6, tokens['Eve'] ?? '', now, here), false);
  assert.deepEqual(sent.at(-1), [6, 'This run is full.']);
});

test('a run sends away a player whose kept body it cannot read, since it keeps no one unkept', async () => {
  const { clock, kept, token } = await world();
  const account = (await kept.claim(token, 'node-a:1'))?.account ?? '';
  await kept.release(account, 'node-a:1', 'not readable');
  const room = roomOf();
  room.held.set(1, '{"starting":true}');
  const sent: [number, string | undefined, boolean | undefined][] = [];
  const run = new Keeper(kept, room, 'node-krakens-grotto--run-k3j4h5g6', (player, why, rejoinable) => {
    sent.push([player, why, rejoinable]);
  }).forCompany();
  assert.equal(
    await run.signIn(
      1,
      token,
      () => clock.now,
      () => true,
    ),
    false,
  );
  assert.deepEqual(sent, [[1, ACCOUNTS_TROUBLE, false]]);
  assert.equal((await kept.claim(token, 'node-b:1'))?.body, 'not readable', 'let go untouched');
});
