import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accounts } from './accountsForTests.ts';
import { companyRunOf, keepRun, launchedFor } from './companies.ts';
import { BREACH_RELAUNCH_MS, foundRun } from './finding.ts';

const BASE = 'node-gullwing-vale--breach-normal';
const RUN = `${BASE}--run-aaaaaaaa`;

/** Players signed in by name, and a way for a leader to take one into their company. */
async function world(names: readonly string[]) {
  const made = accounts();
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  for (const name of names) {
    const token = (await made.ask('POST', '/v1/guest')).body['token'] as string;
    await made.ask('POST', '/v1/register', { username: name, password: 'long enough' }, token);
    tokens[name] = token;
    ids[name] = ((await made.ask('GET', '/v1/me', undefined, token)).body['account'] as { id: string }).id;
  }
  const join = async (leader: string, member: string) => {
    await made.ask('POST', '/v1/social/company/invite', { name: member }, tokens[leader]);
    return (await made.ask('POST', '/v1/social/company/accept', { name: leader }, tokens[member])).status;
  };
  const leave = (name: string) => made.ask('POST', '/v1/social/company/leave', {}, tokens[name]);
  const reset = (name: string) => made.ask('POST', '/v1/social/company/reset', { base: BASE }, tokens[name]);
  const runOf = (name: string) =>
    companyRunOf(made.deps.database, ids[name] ?? '', BASE, made.clock.now, BREACH_RELAUNCH_MS);
  const found = (run: string, ...names: string[]) =>
    foundRun(
      made.deps.database,
      run,
      names.map((name) => ids[name] ?? ''),
      made.clock.now,
    );
  const admits = (name: string) => launchedFor(made.deps.database, ids[name] ?? '', RUN, made.clock.now);
  return { made, join, leave, reset, runOf, found, admits };
}

test('a member who leaves and resets alone leaves the company its run', async () => {
  const { join, leave, reset, runOf, found, admits } = await world(['Ada', 'Ben', 'Cal']);
  assert.equal(await join('Ada', 'Ben'), 200);
  assert.equal(await join('Ada', 'Cal'), 200);
  await found(RUN, 'Ada', 'Ben');
  assert.equal((await reset('Ben')).status, 403, 'not the leader');
  await leave('Ben');
  assert.equal((await reset('Ben')).status, 200, 'alone, their own');
  assert.equal(await runOf('Ada'), RUN);
  assert.equal(await admits('Cal'), true);
});

test('a run stays with its company when the one it was launched for leaves, and goes with no one to another', async () => {
  const { made, join, leave, runOf, found, admits } = await world(['Ada', 'Ben', 'Dee']);
  assert.equal(await join('Ada', 'Ben'), 200);
  await found(RUN, 'Ben');
  made.clock.now += 5 * 60 * 60_000;
  await leave('Ben');
  assert.equal(await join('Dee', 'Ben'), 200);
  assert.equal(await runOf('Dee'), null, "Ben's new company is not let in");
  assert.equal(await admits('Dee'), false);
  assert.equal(await runOf('Ada'), RUN, 'the company it was launched for keeps it');
});

test("a leader's reset forgets their own company's runs alone", async () => {
  const { join, leave, reset, runOf, found } = await world(['Ada', 'Ben', 'Cal', 'Dee']);
  assert.equal(await join('Ada', 'Ben'), 200);
  assert.equal(await join('Ada', 'Cal'), 200);
  await found(RUN, 'Ada', 'Ben');
  await leave('Ben');
  assert.equal(await join('Dee', 'Ben'), 200);
  assert.equal((await reset('Dee')).status, 200);
  assert.equal(await runOf('Ada'), RUN);
});

test("one who joins a company brings no run of their own over the company's", async () => {
  const { made, join, runOf, found } = await world(['Ada', 'Ben', 'Sol']);
  assert.equal(await join('Ada', 'Ben'), 200);
  await found(RUN, 'Ada');
  made.clock.now += 60_000;
  await found(`${BASE}--run-solosolo`, 'Sol');
  assert.equal(await join('Ada', 'Sol'), 200);
  assert.equal(await runOf('Ada'), RUN);
});

test('a run its gate opened is kept a day from then, so its company launches back into it all its gate’s day', async () => {
  const { made, runOf, found } = await world(['Ada']);
  await found(RUN, 'Ada');
  made.clock.now += 20 * 60 * 60_000;
  assert.equal(await keepRun(made.deps.database, RUN, made.clock.now), true);
  made.clock.now += 20 * 60 * 60_000;
  assert.equal(await runOf('Ada'), RUN, 'a day and more from its Launch, within its gate’s day');
});
