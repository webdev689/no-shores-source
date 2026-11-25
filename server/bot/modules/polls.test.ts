import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUILD, MEMBER, MOD, OWNER, TARGET, TEXT_CHANNEL } from '../botForTests.ts';
import { recordOf } from '../law/settings.ts';
import { interactionFrom, standEngagement } from './engagementForTests.ts';
import { pollsModule, postPoll, suggestModule } from './polls.ts';

test("polls: Discord's own poll, two to ten answers, Manage Messages to start one", async () => {
  const bot = await standEngagement({ polls: {} }, [pollsModule]);
  const ask = { question: 'Best harbour?', answers: 'North', hours: 2, many: false };
  assert.equal((await postPoll(bot.context, TEXT_CHANNEL, ask)).ok, false, 'one answer is not a poll');
  const done = await postPoll(bot.context, TEXT_CHANNEL, { ...ask, answers: 'North; South | East', many: true });
  assert.equal(done.ok, true);
  const poll = recordOf(recordOf(bot.world.posts(TEXT_CHANNEL)[0]).poll);
  const answers = (poll.answers as Array<{ poll_media: { text: string } }>).map((answer) => answer.poll_media.text);
  assert.deepEqual(answers, ['North', 'South', 'East']);
  assert.deepEqual([poll.duration, poll.allow_multiselect], [2, true]);
  const refused = await pollsModule.command?.(bot.context, interactionFrom(MEMBER, { name: 'poll' }), {});
  assert.match(String(refused?.data?.content), /Manage Messages/);
  const actor = { id: OWNER, name: 'Owner', roles: [], permissions: 0n, owner: true, mayGive: () => null };
  const panel = await pollsModule.actions?.start?.(bot.context, GUILD, { ...ask, channel: '' }, actor, {});
  assert.match(String(panel?.message), /Choose a channel/);
});

test('suggestions: a card with two votes; only staff mark it, and the card says who did', async () => {
  const bot = await standEngagement({ suggest: { channel: TEXT_CHANNEL } }, [suggestModule]);
  const config = await bot.configOf('suggest');
  const idea = interactionFrom(TARGET, { name: 'suggest', options: [{ type: 3, name: 'idea', value: 'More boats' }] });
  await suggestModule.command?.(bot.context, idea, config);
  const card = recordOf(bot.world.posts(TEXT_CHANNEL)[0]);
  assert.equal(recordOf((card.embeds as unknown[])[0]).description, 'More boats');
  assert.deepEqual(bot.world.state.reactions, ['👍', '👎']);
  const press = (userId: string, perms: string) => ({
    ...interactionFrom(userId, { perms, customId: 'bot:suggest:taken' }),
    message: { embeds: [{ title: 'Suggestion', description: 'More boats' }] },
  });
  const refused = await suggestModule.component?.(bot.context, press(TARGET, '0'), ['taken'], config);
  assert.match(String(refused?.data?.content), /Only staff/);
  const marked = await suggestModule.component?.(bot.context, press(MOD, String(1n << 13n)), ['taken'], config);
  assert.equal(marked?.type, 7);
  const shown = recordOf((marked?.data?.embeds as unknown[])[0]);
  assert.deepEqual(shown.fields, [{ name: 'Status', value: 'Taken by user10.' }]);
  assert.equal(shown.description, 'More boats');
});

test('suggestions: with no channel chosen, the member is told so and nothing is posted', async () => {
  const bot = await standEngagement({ suggest: {} }, [suggestModule]);
  const idea = interactionFrom(TARGET, { name: 'suggest', options: [{ type: 3, name: 'idea', value: 'Rafts' }] });
  const reply = await suggestModule.command?.(bot.context, idea, await bot.configOf('suggest'));
  assert.match(String(reply?.data?.content), /no channel yet/);
  assert.equal(bot.world.state.posts.size, 0);
});
