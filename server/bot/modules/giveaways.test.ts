import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUILD, MOD, MOD_ROLE, OWNER, TARGET, TEXT_CHANNEL } from '../botForTests.ts';
import { recordOf } from '../law/settings.ts';
import { interactionFrom, standEngagement } from './engagementForTests.ts';
import { draw, endGiveaway, giveawaysModule, startGiveaway } from './giveaways.ts';

const OTHER = '900000000000000013';
type Stood = Awaited<ReturnType<typeof standEngagement>>;

const enter = async (bot: Stood, id: number, userId: string, roles: string[] = []) => {
  const press = interactionFrom(userId, { roles, customId: `bot:giveaways:enter:${id}` });
  const reply = await giveawaysModule.component?.(bot.context, press, ['enter', String(id)], {});
  return String(reply?.data?.content);
};
const gold = (bot: Stood) =>
  startGiveaway(bot.context, GUILD, {
    prize: 'Gold',
    durationS: 60,
    winners: 1,
    channelId: TEXT_CHANNEL,
    role: '',
    hostId: OWNER,
  });
const winnersNow = (bot: Stood): string[] =>
  JSON.parse(String(recordOf(bot.database.raw.prepare('SELECT winner_ids FROM giveaways').get()).winner_ids));

test('giveaways: a draw is the count asked for, with no one twice, from the pool alone', () => {
  const pool = ['a', 'b', 'c', 'd', 'e'];
  for (let round = 0; round < 50; round++) {
    const won = draw(pool, 3);
    assert.equal(new Set(won).size, 3);
    assert.ok(won.every((who) => pool.includes(who)));
  }
  assert.deepEqual(draw(['a'], 5), ['a'], 'never more winners than entries');
  assert.deepEqual(
    draw(pool, 2, () => 0),
    ['a', 'e'],
    'a picked entry is replaced by the last, so none repeats',
  );
});

test('giveaways: entering toggles, a role can be required, and the clock ends it with the winners told', async () => {
  const bot = await standEngagement({ giveaways: { channel: TEXT_CHANNEL } }, [giveawaysModule]);
  const started = await startGiveaway(bot.context, GUILD, {
    prize: 'A boat',
    durationS: 3600,
    winners: 1,
    channelId: TEXT_CHANNEL,
    role: MOD_ROLE,
    hostId: OWNER,
  });
  assert.match(started.message, /Giveaway 1 runs for 1 hour/);
  const card = recordOf(bot.world.posts(TEXT_CHANNEL)[0]);
  assert.equal(JSON.stringify(card.components).includes('"custom_id":"bot:giveaways:enter:1"'), true);
  assert.match(await enter(bot, 1, TARGET), /Only <@&/);
  assert.match(await enter(bot, 1, MOD, [MOD_ROLE]), /You are in/);
  assert.match(await enter(bot, 1, MOD, [MOD_ROLE]), /You left/);
  await enter(bot, 1, MOD, [MOD_ROLE]);
  await giveawaysModule.minute?.(bot.context);
  assert.equal(recordOf(bot.database.raw.prepare('SELECT ended FROM giveaways').get()).ended, 0, 'not yet');
  bot.clock.now += 3_601_000;
  await giveawaysModule.minute?.(bot.context);
  const told = recordOf(bot.world.posts(TEXT_CHANNEL).at(-1));
  assert.equal(told.content, `<@${MOD}> won **A boat**!`);
  assert.deepEqual(told.allowed_mentions, { users: [MOD] });
  assert.deepEqual(recordOf(bot.world.state.edits.at(-1)).components, [], 'the ended card has no button');
  assert.equal((await endGiveaway(bot.context, GUILD, 1, false)).ok, false, 'ended once');
  const listed = await giveawaysModule.views?.list?.(bot.context, GUILD, new URLSearchParams());
  assert.deepEqual(listed?.rows[0], { id: 1, prize: 'A boat', entries: 1, state: 'Ended', winners: MOD });
});

test('giveaways: a reroll leaves out the last winners when enough entered', async () => {
  const bot = await standEngagement({ giveaways: { channel: TEXT_CHANNEL } }, [giveawaysModule]);
  await gold(bot);
  await enter(bot, 1, TARGET);
  await enter(bot, 1, OTHER);
  assert.equal((await endGiveaway(bot.context, GUILD, 1, true)).ok, false, 'no reroll before the end');
  await endGiveaway(bot.context, GUILD, 1, false);
  const [first] = winnersNow(bot);
  await endGiveaway(bot.context, GUILD, 1, true);
  assert.notEqual(winnersNow(bot)[0], first);
});

test('giveaways: a start is refused without a prize, a fit duration or a channel, and off the panel too', async () => {
  const bot = await standEngagement({ giveaways: {} }, [giveawaysModule]);
  const ask = { prize: 'Gold', durationS: 60, winners: 1, channelId: TEXT_CHANNEL, role: '', hostId: OWNER };
  assert.match((await startGiveaway(bot.context, GUILD, { ...ask, prize: ' ' })).message, /Name the prize/);
  assert.match((await startGiveaway(bot.context, GUILD, { ...ask, durationS: 61 * 86_400 })).message, /60 days/);
  assert.match((await startGiveaway(bot.context, GUILD, { ...ask, channelId: '' })).message, /Name a channel/);
  const config = await bot.configOf('giveaways');
  const actor = { id: OWNER, name: 'Owner', roles: [], permissions: 0n, owner: true, mayGive: () => null };
  const input = { prize: 'Gold', duration: '2h', winners: 1, channel: '', role: '' };
  const done = await giveawaysModule.actions?.start?.(bot.context, GUILD, input, actor, config);
  assert.match(String(done?.message), /Name a channel/, 'no channel named and no default set');
  const refused = await giveawaysModule.command?.(bot.context, interactionFrom(TARGET, { name: 'giveaway' }), config);
  assert.match(String(refused?.data?.content), /Manage Server/);
});

test('giveaways: two draws at once draw once, and the winners are told once', async () => {
  const bot = await standEngagement({ giveaways: { channel: TEXT_CHANNEL } }, [giveawaysModule]);
  await gold(bot);
  await enter(bot, 1, TARGET);
  const both = await Promise.all([
    endGiveaway(bot.context, GUILD, 1, false),
    endGiveaway(bot.context, GUILD, 1, false),
  ]);
  assert.deepEqual(both.map((outcome) => outcome.ok).sort(), [false, true]);
  const told = bot.world.posts(TEXT_CHANNEL).filter((post) => /won/.test(String(post.content ?? '')));
  assert.equal(told.length, 1);
});

test("giveaways: the winners are named but not pinged where the server's setting says so", async () => {
  const bot = await standEngagement({ giveaways: { channel: TEXT_CHANNEL, pingWinners: false } }, [giveawaysModule]);
  await gold(bot);
  await enter(bot, 1, TARGET);
  await endGiveaway(bot.context, GUILD, 1, false);
  const told = recordOf(bot.world.posts(TEXT_CHANNEL).at(-1));
  assert.match(String(told.content), /won \*\*Gold\*\*/);
  assert.deepEqual(told.allowed_mentions, { users: [] });
});
