import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUILD, MOD, TARGET, countOf, guildWithRanks } from '../botForTests.ts';
import { recordOf } from '../law/settings.ts';
import { standEngagement } from './engagementForTests.ts';
import { tempVoiceModule } from './tempVoice.ts';

const HUB = '900000000000000080';
type Stood = Awaited<ReturnType<typeof standEngagement>>;

const voice = (bot: Stood, userId: string, channelId: string | null) =>
  bot.send('VOICE_STATE_UPDATE', {
    guild_id: GUILD,
    user_id: userId,
    channel_id: channelId,
    member: { user: { id: userId, username: `user${userId.slice(-2)}` }, roles: [] },
  });
const roomNow = (bot: Stood) => String(recordOf(bot.database.raw.prepare('SELECT * FROM temp_voice').get()).channel_id);
const rooms = (bot: Stood) => countOf(bot.database, 'SELECT COUNT(*) AS count FROM temp_voice');

test('voice rooms: joining the hub makes a room and moves the member in; the room goes when it empties', async () => {
  const bot = await standEngagement({ tempvoice: { hub: HUB, limit: 4 } }, [tempVoiceModule]);
  await voice(bot, TARGET, HUB);
  const room = roomNow(bot);
  assert.equal(bot.world.state.channels.get(room)?.name, "user12's room");
  assert.equal(bot.world.state.channels.get(room)?.user_limit, 4);
  const moved = bot.world.state.calls.some(
    (call) => call.method === 'PATCH' && recordOf(call.body).channel_id === room,
  );
  assert.ok(moved, 'moved in');
  await voice(bot, TARGET, room);
  await voice(bot, TARGET, null);
  assert.ok(bot.world.state.gone.includes(room));
  assert.equal(rooms(bot), 0);
});

test('voice rooms: a room no one could be moved into goes at once, and one left empty while the bot was away goes on its return', async () => {
  const bot = await standEngagement({ tempvoice: { hub: HUB } }, [tempVoiceModule]);
  bot.world.state.extra = [
    ['PATCH', /^\/guilds\/\d+\/members\/\d+$/, () => Response.json({ code: 50013 }, { status: 403 })],
  ];
  await voice(bot, TARGET, HUB);
  assert.equal(rooms(bot), 0, 'not moved: no room kept');
  assert.equal(bot.world.state.gone.length, 1);
  bot.world.state.extra = [];
  await voice(bot, MOD, HUB);
  const room = roomNow(bot);
  await voice(bot, MOD, room);
  // the bot is away; the member leaves; the server arrives again with no one in voice
  await bot.send('GUILD_CREATE', { ...guildWithRanks(), voice_states: [] });
  assert.ok(bot.world.state.gone.includes(room));
  assert.equal(rooms(bot), 0);
  assert.deepEqual(bot.cache.inVoice(GUILD), [], 'and the cache holds no one who left meanwhile');
});

test("voice rooms: a room is named with the member's name as written, held to Discord's 100 characters", async () => {
  const bot = await standEngagement({ tempvoice: { hub: HUB } }, [tempVoiceModule]);
  const member = (nick: string) => ({ user: { id: TARGET, username: 'jl' }, nick, roles: [] });
  await bot.send('VOICE_STATE_UPDATE', {
    guild_id: GUILD,
    user_id: TARGET,
    channel_id: HUB,
    member: member('Jean-Luc'),
  });
  assert.equal(bot.world.state.channels.get(roomNow(bot))?.name, "Jean-Luc's room");
  await voice(bot, TARGET, roomNow(bot));
  await voice(bot, TARGET, null);
  const long = '_'.repeat(120);
  await bot.send('VOICE_STATE_UPDATE', { guild_id: GUILD, user_id: TARGET, channel_id: HUB, member: member(long) });
  assert.equal(bot.world.state.channels.get(roomNow(bot))?.name, long.slice(0, 100));
});

test('voice rooms: a room stays while anyone is still in it', async () => {
  const bot = await standEngagement({ tempvoice: { hub: HUB } }, [tempVoiceModule]);
  await voice(bot, TARGET, HUB);
  const room = roomNow(bot);
  await voice(bot, TARGET, room);
  await voice(bot, MOD, room);
  await voice(bot, TARGET, null);
  assert.equal(bot.world.state.gone.includes(room), false, 'one member is still there');
  await voice(bot, MOD, null);
  assert.ok(bot.world.state.gone.includes(room));
});
