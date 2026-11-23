import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUILD_BOUNTIES, bountiesOf, weekOf, weekStart } from '../../client/src/game/guild/guildLaw.ts';
import { accounts } from './accountsForTests.ts';
import { characters } from './characters.ts';
import { guildTold } from './guildWeeks.ts';

/** A world of named players, able to found and join a guild, and a room keeping each one's character. */
async function world(...names: string[]) {
  const made = accounts();
  made.clock.now = weekStart(2_916) + 3 * 86_400_000;
  const tokens: Record<string, string> = {};
  for (const name of names) {
    const token = (await made.ask('POST', '/v1/guest')).body['token'] as string;
    await made.ask('POST', '/v1/register', { username: name, password: 'long enough' }, token);
    tokens[name] = token;
  }
  const kept = characters(
    made.deps.database,
    () => made.clock.now,
    () => Promise.resolve(),
  );
  const accountOf = async (name: string) => (await kept.look(tokens[name] ?? ''))?.account ?? '';
  const ask = (name: string, path: string, body: object = {}) =>
    made.ask('POST', `/v1/social/${path}`, body, tokens[name]);
  /** Claims a player's character in a room and saves it with this guild record. */
  const save = async (name: string, record: object) => {
    const holder = `node-overlook:${name}`;
    await kept.claim(tokens[name] ?? '', holder);
    return kept.save(await accountOf(name), holder, JSON.stringify({ xp: 1, guild: record }));
  };
  const guild = async () => {
    const row = await made.deps.database.prepare('SELECT id, xp FROM guilds').first<{ id: string; xp: number }>();
    return row ?? { id: '', xp: 0 };
  };
  const tab = async (name: string) =>
    (await made.ask('GET', '/v1/guild', undefined, tokens[name])).body['guild'] as Record<string, unknown>;
  return { ...made, ask, save, guild, accountOf, tab };
}

const WEEK = 2_916;
const record = (given: number, counts = [0, 0, 0, 0], claimed = [false, false, false, false]) => ({
  week: WEEK,
  given,
  counts,
  claimed,
});

test("what a member's save adds goes to their guild once, however often the same record is saved", async () => {
  const { ask, save, guild } = await world('Ada');
  await ask('Ada', 'guild/found', { name: 'Salt Kings', tag: 'SALT' });
  assert.equal(await save('Ada', record(500)), true);
  assert.equal((await guild()).xp, 500);
  await save('Ada', record(500));
  assert.equal((await guild()).xp, 500, 'nothing new, nothing added');
  await save('Ada', record(1_250));
  assert.equal((await guild()).xp, 1_250);
});

test('what a player did before joining a guild never goes to it', async () => {
  const { ask, save, guild } = await world('Ada', 'Ben');
  await save('Ben', record(3_000));
  await ask('Ada', 'guild/found', { name: 'Salt Kings', tag: 'SALT' });
  await ask('Ada', 'guild/invite', { name: 'Ben' });
  await ask('Ben', 'guild/accept', { tag: 'SALT' });
  await save('Ben', record(3_200));
  assert.equal((await guild()).xp, 200);
});

test("members' counts add up toward the guild's bounty, which is done at its target and pays the guild once", async () => {
  const { ask, save, guild, deps } = await world('Ada', 'Ben');
  await ask('Ada', 'guild/found', { name: 'Salt Kings', tag: 'SALT' });
  await ask('Ada', 'guild/invite', { name: 'Ben' });
  await ask('Ben', 'guild/accept', { tag: 'SALT' });
  const target = GUILD_BOUNTIES[bountiesOf(WEEK)[0] ?? 0]?.target ?? 0;
  const half = Math.ceil(target / 2);
  await save('Ada', record(0, [half, 0, 0, 0]));
  const week = () =>
    deps.database.prepare('SELECT count0, done0 FROM guild_weeks').first<{ count0: number; done0: number }>();
  assert.equal((await week())?.done0, target === half ? 1 : 0);
  await save('Ben', record(0, [target - half, 0, 0, 0]));
  assert.deepEqual({ ...(await week()) }, { count0: target, done0: 1 });
  assert.equal((await guild()).xp, 2_500, "the bounty's XP");
  await save('Ben', record(0, [target, 0, 0, 0]));
  assert.equal((await guild()).xp, 2_500, 'paid once');
});

test('a room is told which bounties the guild has done and whether the member joined before the week turned', async () => {
  const { ask, save, accountOf, deps, clock } = await world('Ada');
  assert.equal(await guildTold(deps.database, await accountOf('Ada'), clock.now), null, 'in no guild');
  await ask('Ada', 'guild/found', { name: 'Salt Kings', tag: 'SALT' });
  const target = GUILD_BOUNTIES[bountiesOf(WEEK)[2] ?? 0]?.target ?? 0;
  await save('Ada', record(0, [0, 0, target, 0]));
  const told = await guildTold(deps.database, await accountOf('Ada'), clock.now);
  assert.deepEqual(told?.done, [false, false, true, false]);
  assert.equal(told?.beforeTheWeek, false, 'founded this week');
  clock.now += 7 * 86_400_000;
  assert.equal((await guildTold(deps.database, await accountOf('Ada'), clock.now))?.beforeTheWeek, true);
});

test("the Guild tab reads the week's four bounties with the guild's counts, its XP given, and the player's part", async () => {
  const { ask, save, tab, clock } = await world('Ada');
  await ask('Ada', 'guild/found', { name: 'Salt Kings', tag: 'SALT' });
  assert.equal(weekOf(clock.now), WEEK);
  await save('Ada', record(1_800, [3, 0, 0, 1], [false, false, false, true]));
  const read = await tab('Ada');
  const bounties = read['bounties'] as { name: string; count: number; claimed: boolean }[];
  assert.equal(bounties.length, 4);
  assert.deepEqual(
    bounties.map((bounty) => bounty.name),
    bountiesOf(WEEK).map((place) => GUILD_BOUNTIES[place]?.name),
  );
  assert.equal(bounties[0]?.count, 3);
  assert.equal(bounties[3]?.claimed, true);
  assert.equal(read['given'], 1_800, "the guild's XP this week");
  assert.equal(read['contribution'], 1_800, 'and the player’s own');
});
