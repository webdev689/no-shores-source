import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accounts } from './accounts/accountsForTests.ts';
import { characters } from './accounts/characters.ts';
import { foundRun } from './accounts/finding.ts';
import { ACCOUNTS_TROUBLE, Keeper, SAVE_UNCHANGED_MS, SIGN_IN, SIGN_IN_FOR_RUN } from './keeping.ts';
import { roomOf, world } from './keepingForTests.ts';

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
});

test('a room that keeps characters sends away a player with no session, so none holds a place in it for good', async () => {
  const { clock, kept, token } = await world();
  const room = roomOf();
  for (const player of [1, 2, 3, 4, 5]) room.held.set(player, '{"starting":true}');
  const sent: unknown[][] = [];
  const told = (player: number, why?: string, rejoinable?: boolean) => void sent.push([player, why, rejoinable]);
  const keeper = new Keeper(kept, room, 'node-overlook-social', told, () => Promise.resolve());
  const [now, here] = [() => clock.now, () => true];
  await keeper.tokenDue(1, () => false, here);
  await keeper.tokenDue(2, () => true, here);
  await keeper.tokenDue(
    3,
    () => false,
    () => false,
  );
  assert.deepEqual(sent, [[1, SIGN_IN, false]], 'no token after the wait; a token on its way, or one gone, is not');
  assert.equal(await keeper.signIn(4, 'f'.repeat(64), now, here), false);
  assert.deepEqual(sent.slice(1), [[4, SIGN_IN, false]], 'a token that is no session');
  const down = { ...kept, claim: () => Promise.reject(new Error('the accounts are down')) };
  const cut = new Keeper(down, room, 'node-overlook-social', told, () => Promise.resolve());
  assert.equal(await cut.signIn(5, token, now, here), false);
  assert.equal(sent.length, 2, 'while the accounts do not answer, a player plays on unkept');
  const nothing = new Keeper(null, room, 'test-playtest', told, () => Promise.resolve());
  await nothing.tokenDue(1, () => false, here);
  assert.equal(sent.length, 2, 'a room that keeps nothing sends no one away');
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
