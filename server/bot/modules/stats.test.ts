import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUILD } from '../botForTests.ts';
import { standEngagement } from './engagementForTests.ts';
import { statsModule } from './stats.ts';

const COUNTER = '900000000000000081';

test('stat channels: renamed every ten minutes, and only when the name changed', async () => {
  const bot = await standEngagement({ stats: { counters: [{ channel: COUNTER, name: 'Members: {members}' }] } }, []);
  const renames = () => bot.world.state.calls.filter((call) => call.path === `/channels/${COUNTER}`);
  bot.clock.now = Date.UTC(2026, 10, 18, 12, 4);
  await statsModule.minute?.(bot.context);
  assert.equal(renames().length, 0, 'not this minute');
  bot.clock.now = Date.UTC(2026, 10, 18, 12, 3);
  await statsModule.minute?.(bot.context);
  assert.deepEqual(
    renames().map((call) => call.body),
    [{ name: 'Members: 3' }],
  );
});

test("stat channels: a text channel's name is compared as Discord keeps it, in lower case with dashes", async () => {
  const bot = await standEngagement({ stats: { counters: [{ channel: COUNTER, name: 'Members: {members}' }] } }, []);
  const renames = () => bot.world.state.calls.filter((call) => call.path === `/channels/${COUNTER}`);
  bot.clock.now = Date.UTC(2026, 10, 18, 12, 3);
  await bot.send('CHANNEL_UPDATE', { guild_id: GUILD, id: COUNTER, name: 'members-3', type: 0 });
  await statsModule.minute?.(bot.context);
  assert.equal(renames().length, 0, 'Discord keeps "Members: 3" on a text channel as members-3');
  await bot.send('CHANNEL_UPDATE', { guild_id: GUILD, id: COUNTER, name: 'members-3', type: 2 });
  await statsModule.minute?.(bot.context);
  assert.equal(renames().length, 1, 'a voice channel keeps its name as given');
  await bot.send('CHANNEL_UPDATE', { guild_id: GUILD, id: COUNTER, name: 'members-2', type: 0 });
  await statsModule.minute?.(bot.context);
  assert.equal(renames().length, 2, 'a number that changed is a new name');
});

test('stat channels: a name already showing the number is left alone', async () => {
  const bot = await standEngagement({ stats: { counters: [{ channel: COUNTER, name: 'channel-81' }] } }, []);
  bot.clock.now = Date.UTC(2026, 10, 18, 12, 13);
  await statsModule.minute?.(bot.context);
  assert.equal(bot.world.state.calls.length, 0);
});
