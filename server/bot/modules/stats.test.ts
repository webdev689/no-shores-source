import assert from 'node:assert/strict';
import { test } from 'node:test';
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

test('stat channels: a name already showing the number is left alone', async () => {
  const bot = await standEngagement({ stats: { counters: [{ channel: COUNTER, name: 'channel-81' }] } }, []);
  bot.clock.now = Date.UTC(2026, 10, 18, 12, 13);
  await statsModule.minute?.(bot.context);
  assert.equal(bot.world.state.calls.length, 0);
});
