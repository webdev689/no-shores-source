import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUILD, MOD, OWNER, TARGET, TEXT_CHANNEL, countOf } from '../botForTests.ts';
import { recordOf } from '../law/settings.ts';
import { standEngagement } from './engagementForTests.ts';
import { starboardModule } from './starboard.ts';

const STARS = '900000000000000070';
const OTHER = '900000000000000013';
const STARRED = '100000000000000001';

test("starboard: shown at the threshold without the author's own star, kept counted, and taken down below it", async () => {
  const bot = await standEngagement({ starboard: { channel: STARS, threshold: 2 } }, [starboardModule]);
  let count = 2;
  let users = [{ id: TARGET }, { id: MOD }];
  const message = () => ({
    id: STARRED,
    channel_id: TEXT_CHANNEL,
    author: { id: TARGET, username: 'user12' },
    content: 'a fine screenshot',
    timestamp: new Date().toISOString(),
    reactions: [{ emoji: { name: '⭐' }, count }],
  });
  bot.world.state.extra = [
    ['GET', new RegExp(`^/channels/\\d+/messages/${STARRED}$`), () => Response.json(message())],
    ['GET', /\/reactions\//, () => Response.json(users)],
  ];
  const react = (type = 'MESSAGE_REACTION_ADD') =>
    bot.send(type, {
      guild_id: GUILD,
      channel_id: TEXT_CHANNEL,
      message_id: STARRED,
      user_id: MOD,
      emoji: { name: '⭐' },
    });
  await react();
  assert.equal(bot.world.posts(STARS).length, 0, "two stars, one the author's own, is one");
  count = 3;
  users = [{ id: TARGET }, { id: MOD }, { id: OTHER }];
  await react();
  assert.match(String(bot.world.posts(STARS)[0]?.content), /\*\*2\*\*/);
  count = 4;
  users.push({ id: OWNER });
  await react();
  assert.match(String(recordOf(bot.world.state.edits.at(-1)).content), /\*\*3\*\*/);
  assert.equal(bot.world.posts(STARS).length, 1, 'the same post is edited');
  count = 1;
  users = [{ id: OTHER }];
  await react('MESSAGE_REACTION_REMOVE');
  assert.equal(countOf(bot.database, 'SELECT COUNT(*) AS count FROM starboard_posts'), 0);
  assert.ok(
    bot.world.state.calls.some((call) => call.method === 'DELETE' && call.path.startsWith(`/channels/${STARS}/`)),
  );
});

test('starboard: another emoji, an ignored channel and the board itself are never counted', async () => {
  const bot = await standEngagement({ starboard: { channel: STARS, threshold: 1, ignoreChannels: [TEXT_CHANNEL] } }, [
    starboardModule,
  ]);
  await bot.send('MESSAGE_REACTION_ADD', {
    guild_id: GUILD,
    channel_id: TEXT_CHANNEL,
    message_id: STARRED,
    emoji: { name: '⭐' },
  });
  await bot.send('MESSAGE_REACTION_ADD', {
    guild_id: GUILD,
    channel_id: STARS,
    message_id: STARRED,
    emoji: { name: '⭐' },
  });
  await bot.send('MESSAGE_REACTION_ADD', {
    guild_id: GUILD,
    channel_id: OTHER,
    message_id: STARRED,
    emoji: { name: '🔥' },
  });
  assert.equal(bot.world.state.calls.length, 0, 'Discord is never asked');
});
