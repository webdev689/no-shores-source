import assert from 'node:assert/strict';
import { test } from 'node:test';
import { weekOf } from '../../client/src/game/guild/guildLaw.ts';
import { STORES_TAKE_A_DAY, TREASURY_MOST, kindOf } from '../../client/src/game/guild/outpostLaw.ts';
import { accounts, slowly } from './accountsForTests.ts';
import { characters } from './characters.ts';
import type { Db, Statement } from './database.ts';
import { guildOf } from './guilds.ts';
import { outpostRoom } from './outpostStores.ts';

const SITE = 'gull-cove-outpost';
const HOUR = 3_600_000;

/** A guild of three, Ada its founder, Ben and Cyra its members, and ways to stand each at its outpost and ask of it. */
async function world(names = ['Ada', 'Ben', 'Cyra']) {
  const made = accounts();
  made.clock.now = Date.UTC(2026, 10, 21, 12);
  const tokens: Record<string, string> = {};
  for (const name of names) {
    const token = (await made.ask('POST', '/v1/guest')).body['token'] as string;
    await made.ask('POST', '/v1/register', { username: name, password: 'long enough' }, token);
    tokens[name] = token;
  }
  const ask = (name: string, path: string, body: object = {}) =>
    made.ask('POST', `/v1/social/${path}`, body, tokens[name]);
  await ask('Ada', 'guild/found', { name: 'Salt Kings', tag: 'SALT' });
  for (const name of names.slice(1)) {
    await ask('Ada', 'guild/invite', { name });
    await ask(name, 'guild/accept', { tag: 'SALT' });
  }
  const kept = () =>
    characters(
      made.deps.database,
      () => made.clock.now,
      () => Promise.resolve(),
    );
  const accountOf = async (name: string) => (await kept().look(tokens[name] ?? ''))?.account ?? '';
  const guild = async () =>
    (await made.deps.database
      .prepare("SELECT id, treasury, xp FROM guilds WHERE tag = 'SALT'")
      .first<{ id: string; treasury: number; xp: number }>())!;
  const room = async () => outpostRoom(SITE, (await guild()).id);
  const standAt = async (name: string) => kept().claim(tokens[name] ?? '', `${await room()}:${name}`);
  const fund = async (amount: number) =>
    kept().deposit(await accountOf('Ada'), amount, `${await room()}:fund-${amount}-${Math.random()}`);
  const get = async (name: string, path: string) => (await made.ask('GET', path, undefined, tokens[name])).body;
  const sql = (text: string, ...values: unknown[]) =>
    made.deps.database
      .prepare(text)
      .bind(...values)
      .run();
  return { ...made, tokens, ask, kept, accountOf, guild, room, standAt, fund, get, sql };
}

/** Runs `between` once, just before the first statement whose SQL starts so runs, alone or in a batch. */
function before(deps: { database: Db }, starts: string, between: () => Promise<unknown>) {
  const real = deps.database;
  let fired = false;
  const inner = new WeakMap<Statement, Statement>();
  const sqlOf = new WeakMap<Statement, string>();
  const fire = async (sql: string) => {
    if (fired || !sql.trimStart().startsWith(starts)) return;
    fired = true;
    Object.assign(deps, { database: real });
    await between();
  };
  const wrap = (statement: Statement, sql: string): Statement => {
    const made: Statement = {
      ...statement,
      bind: (...values) => wrap(statement.bind(...values), sql),
      run: async () => (await fire(sql), statement.run()),
      first: async <T>() => (await fire(sql), statement.first<T>()),
    };
    inner.set(made, statement);
    sqlOf.set(made, sql);
    return made;
  };
  const batch = async (statements: Statement[]) => {
    for (const each of statements) await fire(sqlOf.get(each) ?? '');
    return real.batch(statements.map((each) => inner.get(each) ?? each));
  };
  Object.assign(deps, { database: { prepare: (sql: string) => wrap(real.prepare(sql), sql), batch } });
}

test('a site the guild never raised reads as no outpost, one raised as its plot', async () => {
  const { get, room, standAt, fund, ask } = await world();
  assert.equal((await get('Ben', `/v1/outposts/${await room()}`))['outpost'], null);
  await standAt('Ada');
  await fund(6_000);
  assert.equal((await ask('Ada', 'outpost/raise', { site: SITE, turn: 0 })).status, 200);
  assert.notEqual((await get('Ben', `/v1/outposts/${await room()}`))['outpost'], null);
});

test("what a member takes from the stores counts by the game's day, which turns at 09:00 UTC", async () => {
  const { standAt, fund, ask, guild, kept, accountOf, room, clock, sql, get } = await world();
  await standAt('Ada');
  await fund(6_000);
  await ask('Ada', 'outpost/raise', { site: SITE, turn: 0 });
  const { id } = await guild();
  await sql(
    "INSERT INTO outpost_structures (guild_id, site, id, kind, tier, x, y, turn) VALUES (?1, ?2, 9, 'camp', 1, 0, 0, 0)",
    id,
    SITE,
  );
  clock.now = Date.UTC(2026, 10, 22, 8);
  await sql(`UPDATE outposts SET stores = '{"island":60}', stores_at = ?1`, clock.now);
  const ada = await accountOf('Ada');
  assert.equal(await kept().takeStores(ada, await room(), 'island', 20), 20);
  clock.now = Date.UTC(2026, 10, 22, 10);
  await standAt('Ada');
  assert.deepEqual((await get('Ada', '/v1/outposts'))['taken'], {}, 'a new day since 09:00');
  assert.equal(await kept().takeStores(ada, await room(), 'island', 20), 20, 'the same UTC date, a new game day');
});

test('a full treasury still lets a structure, a piece and an outpost go, giving back what fits', async () => {
  const { standAt, fund, ask, guild, sql } = await world();
  await standAt('Ada');
  await fund(20_000);
  await ask('Ada', 'outpost/raise', { site: SITE, turn: 0 });
  await ask('Ada', 'outpost/place', { site: SITE, kind: 'counting', x: 0, y: 0, turn: 0 });
  await ask('Ada', 'outpost/decorate', { site: SITE, piece: 'bench', x: 3, y: 30.5, turn: 0 });
  await sql('UPDATE guilds SET treasury = ?1', TREASURY_MOST - 100);
  const removed = await ask('Ada', 'outpost/remove', { site: SITE, id: 3 });
  assert.equal(removed.status, 200, String(removed.body['error']));
  assert.equal(removed.body['back'], 100, 'only what fits came back');
  assert.equal((await guild()).treasury, TREASURY_MOST);
  const undecorated = await ask('Ada', 'outpost/undecorate', { site: SITE, id: 1 });
  assert.equal(undecorated.status, 200, String(undecorated.body['error']));
  assert.equal(undecorated.body['back'], 0);
  const abandoned = await ask('Ada', 'outpost/abandon', { site: SITE });
  assert.equal(abandoned.status, 200, String(abandoned.body['error']));
  assert.equal(abandoned.body['back'], 0);
  assert.equal((await guild()).treasury, TREASURY_MOST);
});

test("the Guild tab reads whether the guild's War Horn sounded this week", async () => {
  const { standAt, fund, ask, guild, kept, accountOf, room, sql, get } = await world();
  await standAt('Ada');
  await fund(6_000);
  await ask('Ada', 'outpost/raise', { site: SITE, turn: 0 });
  await sql(
    "INSERT INTO outpost_structures (guild_id, site, id, kind, tier, x, y, turn) VALUES (?1, ?2, 9, 'horn', 1, 0, 0, 0)",
    (await guild()).id,
    SITE,
  );
  assert.equal((await get('Ada', '/v1/outposts'))['hornSounded'], false);
  assert.equal(await kept().soundHorn(await accountOf('Ada'), await room()), 1);
  assert.equal((await get('Ada', '/v1/outposts'))['hornSounded'], true);
});

test('a member is told only the founder and admins change the outpost, and a player away where to do it', async () => {
  const { standAt, fund, ask } = await world();
  await standAt('Ada');
  await fund(6_000);
  await ask('Ada', 'outpost/raise', { site: SITE, turn: 0 });
  await standAt('Ben');
  assert.equal(
    (await ask('Ben', 'outpost/undecorate', { site: SITE, id: 1 })).body['error'],
    'Only the founder and admins can change the outpost.',
  );
  assert.equal(
    (await ask('Cyra', 'outpost/collect', { site: SITE })).body['error'],
    "Do that at your guild's outpost.",
  );
});

test("a room is told the week its guild's word was read for", async () => {
  const { kept, accountOf, clock } = await world();
  assert.equal((await kept().guild(await accountOf('Ben')))?.week, weekOf(clock.now));
});

test('a founder handing the founding to an admin as that admin leaves keeps the guild one founder', async () => {
  const { ask, deps, guild } = await world();
  await ask('Ada', 'guild/promote', { name: 'Ben' });
  before(deps, 'DELETE FROM guild_members', async () => {
    assert.equal((await ask('Ada', 'guild/founder', { name: 'Ben' })).status, 200);
  });
  assert.equal((await ask('Ben', 'guild/leave')).status, 409);
  const { results } = await deps.database
    .prepare('SELECT rank FROM guild_members WHERE guild_id = ?1')
    .bind((await guild()).id)
    .all<{ rank: number }>();
  assert.equal(results.filter((row) => row.rank === 0).length, 1);
});

test('a deposit whose ledger line is pruned in its own write answers as moved, as the treasury took it', async () => {
  const { kept, accountOf, room, guild, sql, clock } = await world();
  const { id } = await guild();
  // Two hundred lines newer than the deposit's, so the prune in its write takes its own line at once.
  for (let each = 0; each < 200; each++)
    await sql(
      "INSERT INTO guild_ledger (guild_id, rid, mark, kind, amount, balance, at) VALUES (?1, ?2, 'm', 'deposit', 0, 0, ?3)",
      id,
      `later-${each}`,
      clock.now + HOUR,
    );
  const answer = await kept().deposit(await accountOf('Ada'), 1_000, `${await room()}:x`);
  assert.equal((await guild()).treasury, 1_000);
  assert.equal(answer, 'moved', 'the room keeps what the treasury kept');
});

test('a delivery asked twice at once under one id answers both times what it used', async () => {
  const { standAt, fund, ask, kept, accountOf, room, deps } = await world();
  await standAt('Ada');
  await fund(20_000);
  await ask('Ada', 'outpost/raise', { site: SITE, turn: 0 });
  await ask('Ada', 'outpost/place', { site: SITE, kind: 'counting', x: 0, y: 0, turn: 0 });
  const [ada, here] = [await accountOf('Ada'), await room()];
  slowly(deps);
  const answers = await Promise.all(
    [1, 2].map(() => kept().deliver(ada, here, { id: 3, stuff: 'timber', amount: 10 }, 'same-rid')),
  );
  assert.deepEqual(answers, [10, 10]);
});

test('the War Horn stays silent for an admin demoted between its read and its write', async () => {
  const { standAt, fund, ask, guild, kept, accountOf, room, sql, deps } = await world();
  await ask('Ada', 'guild/promote', { name: 'Ben' });
  await standAt('Ada');
  await fund(6_000);
  await ask('Ada', 'outpost/raise', { site: SITE, turn: 0 });
  await sql(
    "INSERT INTO outpost_structures (guild_id, site, id, kind, tier, x, y, turn) VALUES (?1, ?2, 9, 'horn', 1, 0, 0, 0)",
    (await guild()).id,
    SITE,
  );
  const ben = await accountOf('Ben');
  before(deps, 'UPDATE guilds SET horn_week', async () => {
    assert.equal((await ask('Ada', 'guild/demote', { name: 'Ben' })).status, 200);
  });
  assert.equal(await kept().soundHorn(ben, await room(), 'r1'), -1);
  assert.equal((await guildOf(deps.database, ben))?.rank, 2);
});

test("a room's deposit goes to the outpost's guild, refused for one the player has left", async () => {
  const { ask, kept, accountOf, room, get, guild } = await world(['Ada', 'Ben', 'Dan']);
  const salt = await room();
  await ask('Dan', 'guild/leave');
  await ask('Dan', 'guild/found', { name: 'Other Lot', tag: 'OTHR' });
  await ask('Ben', 'guild/leave');
  await ask('Dan', 'guild/invite', { name: 'Ben' });
  await ask('Ben', 'guild/accept', { tag: 'OTHR' });
  assert.equal(await kept().deposit(await accountOf('Ben'), 700, `${salt}:1:2:3`), 'refused');
  assert.equal((await guild()).treasury, 0);
  assert.equal(((await get('Ben', '/v1/outposts'))['treasury'] as number) ?? 0, 0);
});

test("a dock built where a camp already fills gives its first day's stores a day after it stood", async () => {
  const { standAt, fund, ask, kept, accountOf, room, clock, sql } = await world();
  await sql('UPDATE guilds SET xp = 40000');
  await standAt('Ada');
  await fund(30_000);
  await ask('Ada', 'outpost/raise', { site: SITE, turn: 0 });
  const [ada, here] = [await accountOf('Ada'), await room()];
  await ask('Ada', 'outpost/place', { site: SITE, kind: 'camp', x: 0, y: 0, turn: 0 });
  await kept().deliver(ada, here, { id: 3, stuff: 'timber', amount: 40 });
  await kept().deliver(ada, here, { id: 3, stuff: 'canvas', amount: 20 });
  clock.now += 23 * HOUR;
  await standAt('Ada');
  await ask('Ada', 'outpost/place', { site: SITE, kind: 'dock', x: 0, y: 4, turn: 0 });
  await kept().deliver(ada, here, { id: 4, stuff: 'timber', amount: 60 });
  await kept().deliver(ada, here, { id: 4, stuff: 'canvas', amount: 50 });
  await kept().deliver(ada, here, { id: 4, stuff: 'iron', amount: 20 });
  clock.now += 1 * HOUR;
  assert.equal(await kept().takeStores(ada, here, 'timber', 20), 0, 'an hour after the dock stood');
  clock.now += 23 * HOUR;
  assert.equal(await kept().takeStores(ada, here, 'timber', 20), 8, 'a day after');
});

test("a room's errands count in the account's outpost limit and are refused past it", async () => {
  const { ask, kept, accountOf, room } = await world();
  let asked = 0;
  while ((await ask('Ada', 'outpost/collect', { site: SITE })).status !== 429 && asked < 1_000) asked++;
  assert.equal(await kept().deposit(await accountOf('Ada'), 5, `${await room()}:late`), 'limited');
  assert.equal(await kept().soundHorn(await accountOf('Ada'), await room()), -3, 'the horn past the limit');
});

test('a raise turned other than a quarter at a time is refused before anything is written', async () => {
  const { standAt, fund, ask, guild, get } = await world();
  await standAt('Ada');
  await fund(6_000);
  for (const turn of ['north', 5, 1.5, -1]) {
    const raised = await ask('Ada', 'outpost/raise', { site: SITE, turn });
    assert.equal(raised.status, 400, String(turn));
    assert.equal(raised.body['error'], 'Turn it a quarter at a time.');
  }
  assert.equal((await guild()).treasury, 6_000);
  assert.deepEqual((await get('Ada', '/v1/outposts'))['outposts'], []);
});

test("a Counting House risen part way through an hour pays that part at its old tier, the new tier's hours from then", async () => {
  const { standAt, fund, ask, kept, accountOf, room, clock, sql, get } = await world();
  await sql('UPDATE guilds SET xp = 40000');
  await standAt('Ada');
  await fund(100_000);
  await ask('Ada', 'outpost/raise', { site: SITE, turn: 0 });
  await sql("UPDATE outpost_structures SET tier = 2 WHERE kind = 'hall'");
  await ask('Ada', 'outpost/place', { site: SITE, kind: 'counting', x: 0, y: 0, turn: 0 });
  const [ada, here] = [await accountOf('Ada'), await room()];
  await kept().deliver(ada, here, { id: 3, stuff: 'timber', amount: 40 });
  await kept().deliver(ada, here, { id: 3, stuff: 'iron', amount: 20 });
  clock.now += 1.5 * HOUR;
  await standAt('Ada');
  assert.equal((await ask('Ada', 'outpost/rise', { site: SITE, id: 3 })).status, 200);
  for (const stuff of ['timber', 'iron', 'island'] as const)
    await kept().deliver(ada, here, { id: 3, stuff, amount: 200 });
  clock.now += 0.5 * HOUR;
  await standAt('Ada');
  const box = async () => ((await get('Ada', '/v1/outposts'))['outposts'] as { strongbox: number }[])[0]?.strongbox;
  assert.equal(await box(), 30 + 15, 'an hour and a half at tier 1, none yet at tier 2');
  clock.now += 0.5 * HOUR;
  assert.equal(await box(), 30 + 15 + 60);
});

test('a deposit asked again under its id after its player left the guild answers as it did', async () => {
  const { ask, kept, accountOf, room, guild } = await world();
  const [ben, rid] = [await accountOf('Ben'), `${await room()}:1795262400000:7:3`];
  assert.equal(await kept().deposit(ben, 1_000, rid), 'moved');
  assert.equal((await ask('Ben', 'guild/leave')).status, 200);
  assert.equal(await kept().deposit(ben, 1_000, rid), 'already', 'the room gives nothing back');
  assert.equal((await guild()).treasury, 1_000);
});

test('a deposit asked again after its ledger line was pruned by newer ones moves nothing more', async () => {
  const { kept, accountOf, room, guild } = await world();
  const [ada, cyra, here] = [await accountOf('Ada'), await accountOf('Cyra'), await room()];
  assert.equal(await kept().deposit(ada, 5_000, `${here}:1:7:4`), 'moved');
  for (let each = 0; each < 200; each++) await kept().deposit(cyra, 1, `${here}:other:${each}`);
  assert.equal(await kept().deposit(ada, 5_000, `${here}:1:7:4`), 'already');
  assert.equal((await guild()).treasury, 5_200);
});

test('an errand asked again a month later answers as it did and does nothing twice', async () => {
  const { standAt, fund, ask, kept, accountOf, room, clock, guild, sql } = await world();
  await sql('UPDATE guilds SET xp = 40000');
  await standAt('Ada');
  await fund(30_000);
  await ask('Ada', 'outpost/raise', { site: SITE, turn: 0 });
  await ask('Ada', 'outpost/place', { site: SITE, kind: 'camp', x: 0, y: 0, turn: 0 });
  const [ada, here] = [await accountOf('Ada'), await room()];
  assert.equal(await kept().deliver(ada, here, { id: 3, stuff: 'timber', amount: 10 }, 'deliver-once'), 10);
  assert.equal(await kept().deposit(ada, 300, `${here}:1:1:1`), 'moved');
  const treasury = (await guild()).treasury;
  clock.now += 30 * 24 * HOUR;
  await standAt('Ada');
  // Another errand's write comes first, as it would in a month.
  assert.equal(await kept().deliver(ada, here, { id: 3, stuff: 'timber', amount: 5 }, 'deliver-later'), 5);
  assert.equal(await kept().deliver(ada, here, { id: 3, stuff: 'timber', amount: 10 }, 'deliver-once'), 10);
  assert.equal(await kept().deposit(ada, 300, `${here}:1:1:1`), 'already');
  assert.equal((await guild()).treasury, treasury, 'nothing moved again');
  assert.equal(await kept().deliver(ada, here, { id: 3, stuff: 'timber', amount: 30 }), 25, 'fifteen of forty used');
});

test("two takes at once at two of a guild's outposts give no more than a day's take", async () => {
  const { fund, ask, kept, accountOf, clock, sql, guild, deps, tokens } = await world();
  await sql('UPDATE guilds SET xp = 800000');
  await fund(100_000);
  const ada = await accountOf('Ada');
  const sites = ['gull-cove-outpost', 'salt-reach-outpost'];
  const roomOf = async (site: string) => outpostRoom(site, (await guild()).id);
  for (const site of sites) {
    await kept().claim(tokens['Ada'] ?? '', `${await roomOf(site)}:Ada`);
    assert.equal((await ask('Ada', 'outpost/raise', { site, turn: 0 })).status, 200);
    assert.equal((await ask('Ada', 'outpost/place', { site, kind: 'dock', x: 0, y: 0, turn: 0 })).status, 200);
    for (const [stuff, amount] of Object.entries(kindOf('dock')?.tiers[0]?.materials ?? {}))
      await kept().deliver(ada, await roomOf(site), { id: 3, stuff: stuff as 'timber', amount: amount ?? 0 });
  }
  clock.now += 72 * HOUR;
  slowly(deps);
  const given = await Promise.all(
    sites.map(async (site) => kept().takeStores(ada, await roomOf(site), 'timber', STORES_TAKE_A_DAY)),
  );
  assert.equal(given[0]! + given[1]!, STORES_TAKE_A_DAY, `given ${given.join(' and ')}`);
});

test('past the outpost limit every errand answers so, and plot reads count apart', async () => {
  const { ask, kept, accountOf, room, get } = await world();
  const [ada, here] = [await accountOf('Ada'), await room()];
  for (let read = 0; read < 700; read++) await get('Ada', `/v1/outposts/${here}`);
  assert.equal(await kept().deposit(ada, 5, `${here}:read-past`), 'moved', 'reads leave the errands their limit');
  let asked = 0;
  while ((await ask('Ada', 'outpost/collect', { site: SITE })).status !== 429 && asked < 1_000) asked++;
  assert.equal(await kept().deposit(ada, 5, `${here}:late`), 'limited');
  assert.equal(await kept().deliver(ada, here, { id: 3, stuff: 'timber', amount: 5 }), -3);
  assert.equal(await kept().takeStores(ada, here, 'timber', 5), -3);
  assert.equal(await kept().soundHorn(ada, here), -3);
});

test('a named take-down or abandonment a full treasury gave nothing for is lined, and answers as it did when sent again', async () => {
  const { standAt, fund, ask, sql, deps } = await world();
  await standAt('Ada');
  await fund(20_000);
  await ask('Ada', 'outpost/raise', { site: SITE, turn: 0 });
  await ask('Ada', 'outpost/place', { site: SITE, kind: 'counting', x: 0, y: 0, turn: 0 });
  await sql('UPDATE guilds SET treasury = ?1', TREASURY_MOST);
  const lines = async () =>
    (await deps.database.prepare('SELECT kind FROM guild_ledger ORDER BY rowid DESC').all<{ kind: string }>()).results
      .map((line) => line.kind)
      .filter((kind) => kind.startsWith('take down') || kind === 'abandon');
  const first = await ask('Ada', 'outpost/remove', { site: SITE, id: 3, rid: 'take-3' });
  assert.deepEqual([first.status, first.body['back']], [200, 0]);
  assert.deepEqual(await lines(), ['take down counting'], 'the ledger shows it, for nothing');
  const again = await ask('Ada', 'outpost/remove', { site: SITE, id: 3, rid: 'take-3' });
  assert.deepEqual([again.status, again.body['back']], [200, 0], 'answered as it was');
  const standard = await ask('Ada', 'outpost/remove', { site: SITE, id: 2, rid: 'take-2' });
  assert.deepEqual([standard.status, standard.body['back']], [200, 0], String(standard.body['error']));
  assert.deepEqual(await lines(), ['take down counting'], 'the free standard costs nothing, and is no line');
  const left = await ask('Ada', 'outpost/abandon', { site: SITE, rid: 'leave-1' });
  assert.deepEqual([left.status, left.body['back']], [200, 0]);
  const leftAgain = await ask('Ada', 'outpost/abandon', { site: SITE, rid: 'leave-1' });
  assert.deepEqual([leftAgain.status, leftAgain.body['back']], [200, 0], 'not "no outpost there"');
  assert.deepEqual(await lines(), ['abandon', 'take down counting']);
});

test('an errand refused under its id is refused again under it, though another room asks after the cause is gone', async () => {
  const { ask, kept, accountOf, room, guild, sql } = await world();
  const [ben, here] = [await accountOf('Ben'), await room()];
  await sql('UPDATE guilds SET treasury = ?1', TREASURY_MOST);
  assert.equal(await kept().deposit(ben, 500, `${here}:1:2:3`), 'refused', 'the treasury full: the room gives back');
  await sql('UPDATE guilds SET treasury = 0');
  assert.equal(await kept().deposit(ben, 500, `${here}:1:2:3`), 'refused', 'a claim elsewhere asking again');
  assert.equal((await guild()).treasury, 0, 'never moved after it was given back');
  let asked = 0;
  while ((await ask('Ben', 'outpost/collect', { site: SITE })).status !== 429 && asked < 1_000) asked++;
  assert.equal(await kept().deliver(ben, here, { id: 3, stuff: 'timber', amount: 5 }, 'past-limit'), -3);
  assert.equal(await kept().deposit(ben, 5, `${here}:limited`), 'limited');
  assert.equal(await kept().deposit(ben, 5, `${here}:limited`), 'limited', 'answered alike');
});
