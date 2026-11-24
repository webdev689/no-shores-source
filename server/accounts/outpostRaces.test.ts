import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accounts, slowly } from './accountsForTests.ts';
import { characters } from './characters.ts';
import { guildOf } from './guilds.ts';
import { outpostRoom } from './outpostStores.ts';
import { outpostAsk } from './outposts.ts';

const SITE = 'gull-cove-outpost';
const HOUR = 3_600_000;

/** A guild of two, Ada its founder and Ben a member, its asks made as rounds trips when the test makes them slow. */
async function world() {
  const made = accounts();
  made.clock.now = Date.UTC(2026, 10, 21, 12);
  const tokens: Record<string, string> = {};
  for (const name of ['Ada', 'Ben']) {
    const token = (await made.ask('POST', '/v1/guest')).body['token'] as string;
    await made.ask('POST', '/v1/register', { username: name, password: 'long enough' }, token);
    tokens[name] = token;
  }
  const ask = (name: string, path: string, body: object = {}) =>
    made.ask('POST', `/v1/social/${path}`, body, tokens[name]);
  await ask('Ada', 'guild/found', { name: 'Salt Kings', tag: 'SALT' });
  await ask('Ada', 'guild/invite', { name: 'Ben' });
  await ask('Ben', 'guild/accept', { tag: 'SALT' });
  const kept = () =>
    characters(
      made.deps.database,
      () => made.clock.now,
      () => Promise.resolve(),
    );
  const accountOf = async (name: string) => (await kept().look(tokens[name] ?? ''))?.account ?? '';
  const guild = async () =>
    (await made.deps.database
      .prepare('SELECT id, treasury, xp FROM guilds')
      .first<{ id: string; treasury: number; xp: number }>())!;
  const standAt = async (name: string, site = SITE) =>
    kept().claim(tokens[name] ?? '', `${outpostRoom(site, (await guild()).id)}:${name}`);
  const fund = async (amount: number) =>
    kept().deposit(await accountOf('Ada'), amount, `fund-${amount}-${Math.random()}`);
  const count = async (sql: string) =>
    (await made.deps.database.prepare(`SELECT COUNT(*) AS count FROM ${sql}`).first<{ count: number }>())?.count;
  /** Raises the outpost and builds a Counting House (id 3) standing at tier 1. */
  const countingHouse = async () => {
    await ask('Ada', 'outpost/raise', { site: SITE, turn: 0 });
    await ask('Ada', 'outpost/place', { site: SITE, kind: 'counting', x: 0, y: 0, turn: 0 });
    const room = outpostRoom(SITE, (await guild()).id);
    const ada = await accountOf('Ada');
    await kept().deliver(ada, room, { id: 3, stuff: 'timber', amount: 40 });
    await kept().deliver(ada, room, { id: 3, stuff: 'iron', amount: 20 });
  };
  return { ...made, ask, kept, accountOf, guild, standAt, fund, count, countingHouse };
}

test('a structure taken down four times at once gives half its Aurem back once', async () => {
  const { ask, standAt, fund, guild, deps, count } = await world();
  await standAt('Ada');
  await fund(20_000);
  await ask('Ada', 'outpost/raise', { site: SITE, turn: 0 });
  await ask('Ada', 'outpost/place', { site: SITE, kind: 'counting', x: 0, y: 0, turn: 0 });
  const before = (await guild()).treasury;
  slowly(deps);
  await Promise.all([1, 2, 3, 4].map(() => ask('Ada', 'outpost/remove', { site: SITE, id: 3 })));
  assert.equal((await guild()).treasury - before, 1_500);
  assert.equal(await count("guild_ledger WHERE kind = 'take down counting'"), 1);
});

test('an outpost abandoned three times at once gives half its Aurem back once', async () => {
  const { ask, standAt, fund, guild, deps } = await world();
  await standAt('Ada');
  await fund(10_000);
  await ask('Ada', 'outpost/raise', { site: SITE, turn: 0 });
  const before = (await guild()).treasury;
  slowly(deps);
  await Promise.all([1, 2, 3].map(() => ask('Ada', 'outpost/abandon', { site: SITE })));
  assert.equal((await guild()).treasury - before, 2_500);
});

test('a strongbox emptied three times at once pays once', async () => {
  const { ask, standAt, fund, guild, deps, clock, countingHouse } = await world();
  await standAt('Ada');
  await fund(20_000);
  await countingHouse();
  clock.now += 48 * HOUR;
  await standAt('Ada');
  const before = (await guild()).treasury;
  slowly(deps);
  await Promise.all([1, 2, 3].map(() => ask('Ada', 'outpost/collect', { site: SITE })));
  assert.equal((await guild()).treasury - before, 48 * 30);
});

test('a tier risen twice at once is paid for once', async () => {
  const { ask, standAt, fund, guild, deps } = await world();
  await deps.database.prepare('UPDATE guilds SET xp = 40000').run();
  await standAt('Ada');
  await fund(40_000);
  await ask('Ada', 'outpost/raise', { site: SITE, turn: 0 });
  const before = (await guild()).treasury;
  slowly(deps);
  const answers = await Promise.all([1, 2].map(() => ask('Ada', 'outpost/rise', { site: SITE, id: 1 })));
  assert.equal(before - (await guild()).treasury, 15_000);
  assert.deepEqual(answers.map((answer) => answer.status).sort(), [200, 409]);
});

test('an admin demoted since their rank was read moves no Aurem and changes nothing', async () => {
  const { ask, standAt, fund, guild, deps, accountOf, clock, count } = await world();
  await standAt('Ada');
  await standAt('Ben');
  await ask('Ada', 'guild/promote', { name: 'Ben' });
  await fund(20_000);
  await ask('Ada', 'outpost/raise', { site: SITE, turn: 0 });
  await ask('Ben', 'outpost/place', { site: SITE, kind: 'counting', x: 0, y: 0, turn: 0 });
  const ben = await accountOf('Ben');
  const stale = (await guildOf(deps.database, ben))!;
  await ask('Ada', 'guild/demote', { name: 'Ben' });
  const before = (await guild()).treasury;
  const removed = await outpostAsk(deps.database, ben, stale, 'remove', { site: SITE, id: 3 }, clock.now);
  const decorated = await outpostAsk(
    deps.database,
    ben,
    stale,
    'decorate',
    { site: SITE, piece: 'well', x: 2, y: 50, turn: 0 },
    clock.now,
  );
  assert.deepEqual([removed.status, decorated.status], [409, 409]);
  assert.equal((await guild()).treasury, before);
  assert.equal(await count('outpost_structures WHERE id = 3'), 1);
  assert.equal(await count('outpost_decor'), 0);
});

test('the treasury stays within its bounds under deposits at once', async () => {
  const { kept, accountOf, guild, deps } = await world();
  const ada = await accountOf('Ada');
  await kept().deposit(ada, 990_000, 'big');
  slowly(deps);
  await Promise.all([1, 2, 3, 4, 5].map((each) => kept().deposit(ada, 5_000, `d${each}`)));
  assert.equal((await guild()).treasury, 1_000_000);
});

test('two admins raising at two sites at once hold no more outposts than the level allows', async () => {
  const { ask, standAt, fund, deps, count } = await world();
  await ask('Ada', 'guild/promote', { name: 'Ben' });
  await standAt('Ada');
  await standAt('Ben', 'other-outpost');
  await fund(20_000);
  slowly(deps);
  const answers = await Promise.all([
    ask('Ada', 'outpost/raise', { site: SITE, turn: 0 }),
    ask('Ben', 'outpost/raise', { site: 'other-outpost', turn: 0 }),
  ]);
  assert.equal(await count('outposts'), 1);
  assert.deepEqual(answers.map((answer) => answer.status).sort(), [200, 409]);
});

test('two pieces of decoration set at once take their own ids, never a fault', async () => {
  const { ask, standAt, fund, deps, count } = await world();
  await standAt('Ada');
  await fund(20_000);
  await ask('Ada', 'outpost/raise', { site: SITE, turn: 0 });
  slowly(deps);
  const answers = await Promise.all([
    ask('Ada', 'outpost/decorate', { site: SITE, piece: 'well', x: 3, y: 3, turn: 0 }),
    ask('Ada', 'outpost/decorate', { site: SITE, piece: 'well', x: 3, y: 50, turn: 0 }),
  ]);
  assert.deepEqual(
    answers.map((answer) => answer.status),
    [200, 200],
  );
  assert.equal(await count('outpost_decor'), 2);
});

test('two of a kind an outpost holds one of, placed at once, stand once', async () => {
  const { ask, standAt, fund, deps, count } = await world();
  await standAt('Ada');
  await fund(30_000);
  await ask('Ada', 'outpost/raise', { site: SITE, turn: 0 });
  slowly(deps);
  const answers = await Promise.all([
    ask('Ada', 'outpost/place', { site: SITE, kind: 'counting', x: 0, y: 0, turn: 0 }),
    ask('Ada', 'outpost/place', { site: SITE, kind: 'counting', x: 0, y: 12, turn: 0 }),
  ]);
  assert.equal(await count("outpost_structures WHERE kind = 'counting'"), 1);
  assert.deepEqual(answers.map((answer) => answer.status).sort(), [200, 409]);
});
