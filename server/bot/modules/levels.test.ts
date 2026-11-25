import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUILD, TARGET, TEXT_CHANNEL, countOf, standWorker } from '../botForTests.ts';
import { writeConfig } from '../store.ts';
import { actorOf, interactionFrom, standCommunity } from './communityForTests.ts';
import { levelOf, levelsModule, publicBoard, rewardRoles, xpToNext } from './levels.ts';

const ROLE_A = '900000000000000041';
const ROLE_B = '900000000000000042';
const ROLE_C = '900000000000000043';
const QUIET = '900000000000000079';
const LEVELS_ON = {
  xpMin: 60,
  xpMax: 60,
  cooldownSeconds: 60,
  rewards: [{ level: 1, role: ROLE_A }],
  announce: 'same',
};
type Bot = Awaited<ReturnType<typeof standCommunity>>;
const author = { id: TARGET, username: 'user12' };
const chat = (bot: Bot, id: string, channel = TEXT_CHANNEL) =>
  bot.send('MESSAGE_CREATE', {
    id,
    guild_id: GUILD,
    channel_id: channel,
    author,
    member: { roles: [] },
    content: 'hi',
  });
const rowOf = (bot: Bot, columns: string) => ({
  ...(bot.database.raw.prepare(`SELECT ${columns} FROM levels`).get() as Record<string, number>),
});

test('levels: the curve, the level a total reaches, and which rewards are held', () => {
  assert.deepEqual([0, 1, 2, 10].map(xpToNext), [100, 155, 220, 1100]);
  assert.deepEqual(levelOf(0), { level: 0, into: 0, need: 100 });
  assert.deepEqual(levelOf(255), { level: 2, into: 0, need: 220 });
  const rewards = [
    { level: 5, role: ROLE_A },
    { level: 10, role: ROLE_B },
    { level: 20, role: ROLE_C },
  ];
  assert.deepEqual(rewardRoles(rewards, 12, true), { hold: [ROLE_A, ROLE_B], take: [ROLE_C] });
  assert.deepEqual(rewardRoles(rewards, 12, false), { hold: [ROLE_B], take: [ROLE_A, ROLE_C] });
  assert.deepEqual(rewardRoles(rewards, 1, true), { hold: [], take: [ROLE_A, ROLE_B, ROLE_C] });
});

test('levels: a message earns once a cooldown; a level-up is said where it happened and rewarded', async () => {
  const bot = await standCommunity({ levels: LEVELS_ON }, [levelsModule]);
  await chat(bot, '100000000000000001');
  await chat(bot, '100000000000000002');
  assert.equal(rowOf(bot, 'xp').xp, 60, 'the second message was inside the cooldown');
  bot.clock.now += 61_000;
  await chat(bot, '100000000000000003');
  assert.deepEqual(rowOf(bot, 'xp, level, messages'), { xp: 120, level: 1, messages: 2 });
  const said = bot.posts(TEXT_CHANNEL).at(-1);
  assert.equal(said?.content, `<@${TARGET}> reached level 1!`);
  assert.deepEqual(said?.allowed_mentions, { users: [TARGET] });
  assert.deepEqual(bot.world.members.get(TARGET)?.roles, [ROLE_A]);
});

test('levels: with mentions off, a level-up names the member and pings no one; set to DM, it is sent there', async () => {
  const bot = await standCommunity({ levels: { ...LEVELS_ON, levelUpPing: false } }, [levelsModule]);
  await chat(bot, '100000000000000001');
  bot.clock.now += 61_000;
  await chat(bot, '100000000000000002');
  const said = bot.posts(TEXT_CHANNEL).at(-1);
  assert.equal(said?.content, `<@${TARGET}> reached level 1!`);
  assert.deepEqual(said?.allowed_mentions, { users: [] });
  const told = await standCommunity({ levels: { ...LEVELS_ON, announce: 'dm' } }, [levelsModule]);
  await chat(told, '100000000000000001');
  told.clock.now += 61_000;
  await chat(told, '100000000000000002');
  assert.equal(told.posts(TEXT_CHANNEL).length, 0);
  assert.equal(told.world.dms[0]?.content, `<@${TARGET}> reached level 1!`);
});

test('levels: voice earns by the minute up to a cap; a no-experience channel earns nothing', async () => {
  const bot = await standCommunity({ levels: { ...LEVELS_ON, voiceXp: 5, noXpChannels: [QUIET] } }, [levelsModule]);
  await chat(bot, '100000000000000001', QUIET);
  assert.equal(countOf(bot.database, 'SELECT COUNT(*) AS count FROM levels'), 0);
  const voice = (channel: string | null) =>
    bot.send('VOICE_STATE_UPDATE', {
      guild_id: GUILD,
      user_id: TARGET,
      channel_id: channel,
      member: { user: author, roles: [] },
    });
  await voice('900000000000000060');
  bot.clock.now += 10 * 60_000 + 5_000;
  await voice(null);
  assert.deepEqual(rowOf(bot, 'xp, voice_minutes'), { xp: 50, voice_minutes: 10 });
});

test('levels: /rank and /leaderboard answer; the public board carries no user id and can be closed', async () => {
  const bot = await standCommunity({ levels: LEVELS_ON }, [levelsModule]);
  await chat(bot, '100000000000000001');
  const config = await bot.settingsOf('levels');
  const command = levelsModule.command;
  assert.ok(command);
  const rank = await command(bot.context, interactionFrom(TARGET, { name: 'rank' }), config);
  const card = (rank.data?.embeds as Array<{ title: string; fields: Array<{ value: string }> }>)[0];
  assert.equal(card?.title, 'user12: level 0');
  assert.equal(card?.fields[0]?.value, '#1');
  const board = await command(bot.context, interactionFrom(TARGET, { name: 'leaderboard' }), config);
  const lines = (board.data?.embeds as Array<{ description: string }>)[0]?.description;
  assert.match(String(lines), /\*\*1\.\*\* user12: level 0 \(60 xp\)/);
  const open = await publicBoard(bot.context, GUILD, 0);
  assert.deepEqual(Object.keys(open?.rows[0] ?? {}).sort(), ['level', 'name', 'rank', 'xp']);
  assert.ok(!JSON.stringify(open).includes(TARGET));
  for (const offset of [Infinity, -5, 1.5, NaN, 1e300])
    assert.equal((await publicBoard(bot.context, GUILD, offset))?.rows[0]?.rank, 1, String(offset));
  assert.deepEqual((await publicBoard(bot.context, GUILD, 5))?.rows, [], 'past the last row, nothing');
  const closed = await standCommunity({ levels: { ...LEVELS_ON, publicBoard: false } }, [levelsModule]);
  assert.equal(await publicBoard(closed.context, GUILD, 0), null);
});

test('levels: the panel gives and takes, a reward role only by someone who could give it, and resets', async () => {
  const bot = await standCommunity({ levels: LEVELS_ON }, [levelsModule]);
  await chat(bot, '100000000000000001');
  const config = await bot.settingsOf('levels');
  const { give, reset } = levelsModule.actions ?? {};
  assert.ok(give);
  assert.ok(reset);
  await give(bot.context, GUILD, { user: TARGET, amount: -1000 }, actorOf(), config);
  assert.equal(rowOf(bot, 'xp').xp, 0, 'taking stops at nothing');
  const rewarded = { ...config, rewards: [{ level: 2, role: '900000000000000077' }] };
  const asked: Array<readonly string[]> = [];
  const refuse = (ids: readonly string[]) => (asked.push(ids), { role: String(ids[0]), why: 'above' });
  const shut = await give(bot.context, GUILD, { user: TARGET, amount: 500 }, actorOf(refuse), rewarded);
  assert.equal(shut.ok, false);
  assert.match(shut.message, /only roles below your highest role/);
  assert.deepEqual(asked, [['900000000000000077']]);
  assert.equal(rowOf(bot, 'xp').xp, 0, 'nothing given');
  await give(bot.context, GUILD, { user: TARGET, amount: 500 }, actorOf(), config);
  assert.equal(rowOf(bot, 'level').level, 3, '500 is past 100 + 155 + 220');
  const said = bot.posts(TEXT_CHANNEL).filter((post) => /level 3/.test(String(post.content ?? '')));
  assert.equal(said.length, 0, 'a panel grant is not announced');
  assert.deepEqual(bot.world.members.get(TARGET)?.roles, [ROLE_A]);
  assert.equal((await reset(bot.context, GUILD, { user: TARGET }, actorOf(), config)).ok, true);
  assert.equal(countOf(bot.database, 'SELECT COUNT(*) AS count FROM levels'), 0);
  assert.deepEqual(bot.world.members.get(TARGET)?.roles, [], 'the rewards are taken back');
  const view = await levelsModule.views?.board?.(bot.context, GUILD, new URLSearchParams());
  assert.deepEqual(view?.rows, []);
});

test('levels: a member known only by id keeps their stored name, and the public board never shows the id', async () => {
  const bot = await standCommunity({ levels: LEVELS_ON }, [levelsModule]);
  await chat(bot, '100000000000000001');
  const config = await bot.settingsOf('levels');
  const stranger = '900000000000000177';
  await levelsModule.actions?.give?.(bot.context, GUILD, { user: stranger, amount: 50 }, actorOf(), config);
  await levelsModule.actions?.give?.(bot.context, GUILD, { user: TARGET, amount: 5 }, actorOf(), config);
  const names = bot.database.raw.prepare('SELECT user_id, name FROM levels ORDER BY user_id').all();
  assert.deepEqual(
    names.map((row) => ({ ...row })),
    [
      { user_id: TARGET, name: 'user12' },
      { user_id: stranger, name: 'user77' },
    ],
  );
  bot.database.raw.prepare("UPDATE levels SET name = '' WHERE user_id = ?").run(stranger);
  const board = await publicBoard(bot.context, GUILD, 0);
  assert.ok(!JSON.stringify(board).includes(stranger));
  assert.deepEqual(
    board?.rows.map((row) => row.name),
    ['user12', 'Member'],
  );
});

test('levels: the website reads the public board from the Worker, and a closed one answers 404', async () => {
  const bot = await standWorker({ modules: [levelsModule] });
  const write = { guildId: GUILD, moduleId: 'levels', enabled: true, rev: 0, by: TARGET, nowS: 1 };
  await writeConfig(bot.database, { ...write, config: { publicBoard: true } });
  bot.database.raw
    .prepare("INSERT INTO levels (guild_id, user_id, xp, name) VALUES (?, ?, 300, 'Ann')")
    .run(GUILD, TARGET);
  const answer = await bot.call(new Request(`https://bot.test/v1/public/levels/${GUILD}`));
  assert.equal(answer.status, 200);
  assert.match(String(answer.headers.get('cache-control')), /max-age=60/);
  const body = (await answer.json()) as { guild: { name: string }; rows: unknown[] };
  assert.deepEqual(body.rows, [{ rank: 1, name: 'Ann', level: 2, xp: 300 }]);
  assert.equal(body.guild.name, 'Harbour');
  const other = await standWorker({ modules: [levelsModule] });
  await writeConfig(other.database, { ...write, config: { publicBoard: false } });
  const shut = await other.call(new Request(`https://bot.test/v1/public/levels/${GUILD}`));
  assert.equal(shut.status, 404);
});
