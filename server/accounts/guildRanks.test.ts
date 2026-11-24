import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accounts, slowly } from './accountsForTests.ts';
import type { Db, Statement } from './database.ts';

/** Players by name, each signed in, and a way to ask of the Roster as each. */
async function people(names: readonly string[]) {
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
  const rankOf = async (name: string) =>
    made.deps.database
      .prepare(
        `SELECT guilds.tag, guild_members.rank FROM guild_members JOIN guilds ON guilds.id = guild_id
         JOIN accounts ON accounts.id = account_id WHERE accounts.username = ?1`,
      )
      .bind(name)
      .first<{ tag: string; rank: number }>();
  return { ...made, ask, rankOf };
}

/** Runs `between` once, just before the first write whose SQL starts so is made, as if it came a round trip later. */
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
  return () => Object.assign(deps, { database: real });
}

test("a member promoted as they leave for another guild is made no one's admin", async () => {
  const { ask, deps, rankOf } = await people(['Ada', 'Ben', 'Cyra']);
  await ask('Ada', 'guild/found', { name: 'Salt Kings', tag: 'SALT' });
  await ask('Cyra', 'guild/found', { name: 'Other Lot', tag: 'OTHR' });
  await ask('Ada', 'guild/invite', { name: 'Ben' });
  await ask('Ben', 'guild/accept', { tag: 'SALT' });
  const done = before(deps, 'UPDATE guild_members SET rank', async () => {
    await ask('Ben', 'guild/leave');
    await ask('Cyra', 'guild/invite', { name: 'Ben' });
    await ask('Ben', 'guild/accept', { tag: 'OTHR' });
  });
  const promoted = await ask('Ada', 'guild/promote', { name: 'Ben' });
  done();
  assert.equal(promoted.status, 403);
  assert.deepEqual({ ...(await rankOf('Ben')) }, { tag: 'OTHR', rank: 2 });
});

test('a member removed as they leave for another guild stays in the other guild', async () => {
  const { ask, deps, rankOf } = await people(['Ada', 'Ben', 'Cyra']);
  await ask('Ada', 'guild/found', { name: 'Salt Kings', tag: 'SALT' });
  await ask('Cyra', 'guild/found', { name: 'Other Lot', tag: 'OTHR' });
  await ask('Ada', 'guild/invite', { name: 'Ben' });
  await ask('Ben', 'guild/accept', { tag: 'SALT' });
  const done = before(deps, 'DELETE FROM guild_members', async () => {
    await ask('Ben', 'guild/leave');
    await ask('Cyra', 'guild/invite', { name: 'Ben' });
    await ask('Ben', 'guild/accept', { tag: 'OTHR' });
  });
  await ask('Ada', 'guild/remove', { name: 'Ben' });
  done();
  assert.deepEqual({ ...(await rankOf('Ben')) }, { tag: 'OTHR', rank: 2 });
});

test('an admin demoted since their rank was read sets no motto and invites no one', async () => {
  const { ask, deps, rankOf } = await people(['Ada', 'Ben', 'Cyra']);
  await ask('Ada', 'guild/found', { name: 'Salt Kings', tag: 'SALT' });
  await ask('Ada', 'guild/invite', { name: 'Ben' });
  await ask('Ben', 'guild/accept', { tag: 'SALT' });
  await ask('Ada', 'guild/promote', { name: 'Ben' });
  const demote = () => ask('Ada', 'guild/demote', { name: 'Ben' });
  let done = before(deps, 'UPDATE guilds SET motto', demote);
  assert.equal((await ask('Ben', 'guild/motto', { motto: 'Ours now.' })).status, 403);
  done();
  const motto = await deps.database.prepare('SELECT motto FROM guilds').first<{ motto: string }>();
  assert.equal(motto?.motto, '');
  await ask('Ada', 'guild/promote', { name: 'Ben' });
  done = before(deps, 'INSERT INTO guild_invites', demote);
  assert.equal((await ask('Ben', 'guild/invite', { name: 'Cyra' })).status, 403);
  done();
  const invites = await deps.database.prepare('SELECT COUNT(*) AS count FROM guild_invites').first<{ count: number }>();
  assert.equal(invites?.count, 0);
  assert.equal((await rankOf('Ben'))?.rank, 2);
});

test('a founder who hands over the founding as they demote the same admin leaves the guild one founder', async () => {
  for (const first of ['founder', 'demote'] as const) {
    const { ask, deps } = await people(['Ada', 'Ben']);
    await ask('Ada', 'guild/found', { name: 'Salt Kings', tag: 'SALT' });
    await ask('Ada', 'guild/invite', { name: 'Ben' });
    await ask('Ben', 'guild/accept', { tag: 'SALT' });
    await ask('Ada', 'guild/promote', { name: 'Ben' });
    slowly(deps);
    const asks = {
      founder: () => ask('Ada', 'guild/founder', { name: 'Ben' }),
      demote: () => ask('Ada', 'guild/demote', { name: 'Ben' }),
    };
    await Promise.all(first === 'founder' ? [asks.founder(), asks.demote()] : [asks.demote(), asks.founder()]);
    const founders = await deps.database
      .prepare('SELECT COUNT(*) AS count FROM guild_members WHERE rank = 0')
      .first<{ count: number }>();
    assert.equal(founders?.count, 1, first);
  }
});
