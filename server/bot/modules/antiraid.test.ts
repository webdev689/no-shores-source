import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUILD, countOf } from '../botForTests.ts';
import { pruneMemory } from '../kit.ts';
import type { Actor } from './module.ts';
import { antiraidModule, startRaid } from './antiraid.ts';
import { ALERTS, standSafetyGateway } from './safetyForTests.ts';

const author = (id: string) => ({ id, username: `user${id.slice(-2)}` });
const raids = (bot: Awaited<ReturnType<typeof standSafetyGateway>>) =>
  countOf(bot.database, 'SELECT COUNT(*) AS count FROM raid_mode');
const titles = (bot: Awaited<ReturnType<typeof standSafetyGateway>>) =>
  bot.discord.postsTo(ALERTS).map((post) => (post.embeds as { title: string }[])[0]?.title);
const owner = { name: 'Owner' } as Actor;

test('raid guard: a wave of joins starts raid mode, raises verification, deals with the joiners, and the clock ends it', async () => {
  const settings = { joinCount: 3, joinSeconds: 30, raidMinutes: 10, raidAction: 'kick', alertChannel: ALERTS };
  const bot = await standSafetyGateway({ antiraid: settings });
  const join = async (id: string) => {
    bot.discord.state.members.set(id, []);
    bot.clock.now += 1000;
    await bot.send('GUILD_MEMBER_ADD', { guild_id: GUILD, user: author(id), roles: [] });
  };
  await join('900000000000000101');
  await join('900000000000000102');
  assert.equal(raids(bot), 0);
  await join('900000000000000103');
  assert.equal(bot.discord.state.level, 3, 'verification raised');
  assert.equal(bot.discord.state.members.has('900000000000000103'), false, 'the joiner who made it a raid is kicked');
  await join('900000000000000104');
  assert.equal(bot.discord.state.members.has('900000000000000104'), false);
  assert.equal(titles(bot)[0], 'Raid mode on');
  bot.clock.now += 11 * 60_000;
  await antiraidModule.minute?.(bot.context);
  assert.equal(bot.discord.state.level, 1, 'verification given back');
  assert.equal(raids(bot), 0);
  assert.equal(titles(bot).at(-1), 'Raid mode off');
});

test('raid guard: joins spread wider than the window never start raid mode', async () => {
  const bot = await standSafetyGateway({ antiraid: { joinCount: 3, joinSeconds: 10, alertChannel: ALERTS } });
  for (const id of ['900000000000000101', '900000000000000102', '900000000000000103']) {
    bot.clock.now += 6000;
    await bot.send('GUILD_MEMBER_ADD', { guild_id: GUILD, user: author(id), roles: [] });
  }
  assert.equal(raids(bot), 0);
});

test('raid guard: a very new account is dealt with as set; the panel starts and ends raid mode', async () => {
  const settings = { minAccountDays: 7, youngAction: 'timeout', raiseVerification: false, alertChannel: ALERTS };
  const bot = await standSafetyGateway({ antiraid: settings });
  const newId = String(BigInt(Date.now() - 1420070400000 - 3_600_000) << 22n);
  bot.discord.state.members.set(newId, []);
  await bot.send('GUILD_MEMBER_ADD', { guild_id: GUILD, user: author(newId), roles: [] });
  assert.ok(bot.discord.state.timeouts.has(newId));
  const [alert] = bot.discord.postsTo(ALERTS);
  assert.match((alert?.embeds as { description: string }[])[0]?.description ?? '', /1 hour old/);
  const config = (await bot.context.config(GUILD, 'antiraid'))?.config ?? {};
  const started = await antiraidModule.actions?.start?.(bot.context, GUILD, { minutes: 5 }, owner, config);
  assert.match(started?.message ?? '', /on for 5 minutes/);
  const ended = await antiraidModule.actions?.end?.(bot.context, GUILD, {}, owner, config);
  assert.equal(ended?.message, 'Raid mode is off.');
  assert.equal(bot.discord.state.level, 1, 'left alone when the setting is off');
});

test('raid guard: two starts at once, a press beside a burst of joins, start raid mode once and fail neither', async () => {
  const bot = await standSafetyGateway({ antiraid: { raiseVerification: true, alertChannel: ALERTS } });
  const config = (await bot.context.config(GUILD, 'antiraid'))?.config ?? {};
  const both = await Promise.all([
    startRaid(bot.context, GUILD, config, 10, 'One.'),
    startRaid(bot.context, GUILD, config, 20, 'Two.'),
  ]);
  assert.deepEqual(
    both.map((started) => started.ok),
    [true, true],
  );
  assert.equal(raids(bot), 1);
  assert.equal(bot.discord.postsTo(ALERTS).length, 1, 'said once');
  const raised = bot.discord.state.calls.filter((call) => call.method === 'PATCH' && call.path === `/guilds/${GUILD}`);
  assert.ok(raised.length <= 1, 'the verification level raised at most once');
});

test("raid guard: the joins counted toward a raid outlive the Gateway memory's pruning", async () => {
  const bot = await standSafetyGateway({ antiraid: { joinCount: 3, joinSeconds: 60, alertChannel: ALERTS } });
  for (const id of ['900000000000000101', '900000000000000102']) {
    bot.clock.now += 1000;
    await bot.send('GUILD_MEMBER_ADD', { guild_id: GUILD, user: author(id), roles: [] });
  }
  if (bot.context.memory) pruneMemory(bot.context.memory, bot.clock.now);
  await bot.send('GUILD_MEMBER_ADD', { guild_id: GUILD, user: author('900000000000000103'), roles: [] });
  assert.equal(raids(bot), 1);
});
