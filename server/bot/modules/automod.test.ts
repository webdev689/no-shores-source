import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUILD, LOG_CHANNEL, MOD, MOD_ROLE, TARGET, TEXT_CHANNEL } from '../botForTests.ts';
import type { Settings } from '../law/settings.ts';
import { RULE_PREFIX, breaks, syncRules, wantedRules } from './automod.ts';
import { ALERTS, settingsOf, standSafetyGateway } from './safetyForTests.ts';

const author = (id: string, extra: Settings = {}) => ({ id, username: `user${id.slice(-2)}`, ...extra });
const message = (id: string, content: string, extra: Settings = {}) => ({
  id,
  guild_id: GUILD,
  channel_id: TEXT_CHANNEL,
  author: author(TARGET),
  member: { roles: [] },
  content,
  attachments: [],
  ...extra,
});
const AUTOMOD_ON = {
  invites: 'warn',
  links: 'delete',
  allowedSites: ['noshores.online'],
  caps: 'delete',
  emoji: 'delete',
  flood: 'timeout',
  repeats: 'delete',
  alertChannel: ALERTS,
};
const modCases = (bot: Awaited<ReturnType<typeof standSafetyGateway>>) =>
  bot.database.raw.prepare('SELECT * FROM mod_cases').all() as Settings[];

test('auto-mod: each filter finds what it is for, and lets the rest through', () => {
  const config = settingsOf('automod', AUTOMOD_ON);
  const now = 1_000_000;
  assert.equal(breaks(config, 'join discord.gg/abcd now', [], now)?.filter, 'invites');
  assert.equal(breaks(config, 'see https://evil.example/x', [], now)?.filter, 'links');
  assert.equal(
    breaks(config, 'see https://play.noshores.online/x', [], now),
    null,
    'a subdomain of an allowed site passes',
  );
  assert.equal(breaks(config, 'WHY IS EVERYONE SHOUTING HERE', [], now)?.filter, 'caps');
  assert.equal(breaks(config, 'OK FINE', [], now), null, 'a short shout is not counted');
  assert.equal(breaks(config, '🎉'.repeat(10), [], now)?.filter, 'emoji');
  const flood = Array.from({ length: 6 }, (_entry, index) => ({ at: now - index * 500, words: `m${index}` }));
  assert.equal(breaks(config, 'one more', flood, now)?.filter, 'flood');
  const repeats = [1, 2, 3].map((index) => ({ at: now - index * 5000, words: 'buy gold' }));
  assert.equal(breaks(config, 'Buy gold', repeats, now)?.filter, 'repeats');
  assert.equal(breaks(config, 'an ordinary message', [], now), null);
  assert.equal(breaks(settingsOf('automod', {}), 'discord.gg/abcd WHY IS EVERYONE SHOUTING', [], now), null, 'all off');
});

test('auto-mod: a broken rule deletes the message, warns through moderation as a case, and says so in the alerts', async () => {
  const bot = await standSafetyGateway({ automod: AUTOMOD_ON, moderation: { logChannel: LOG_CHANNEL } });
  await bot.send('MESSAGE_CREATE', message('100000000000000001', 'free prizes at discord.gg/scam'));
  assert.deepEqual(bot.discord.state.deleted, ['100000000000000001']);
  const [row] = modCases(bot);
  assert.deepEqual(
    [row?.action, row?.user_id, row?.mod_name, row?.reason],
    ['warn', TARGET, 'Auto-mod', 'Auto-mod: an invite link'],
  );
  const [alert] = bot.discord.postsTo(ALERTS);
  assert.match((alert?.embeds as { description: string }[])[0]?.description ?? '', /an invite link/);
  const [log] = bot.discord.postsTo(LOG_CHANNEL);
  assert.equal((log?.embeds as { title: string }[])[0]?.title, 'Case 1 | Warning');
});

test('auto-mod: moderators, exempt roles, exempt channels and bots are left alone', async () => {
  const exempt = { ...AUTOMOD_ON, exemptRoles: ['900000000000000077'], exemptChannels: ['900000000000000078'] };
  const bot = await standSafetyGateway({ automod: exempt });
  const asMod = { author: author(MOD), member: { roles: [MOD_ROLE] } };
  await bot.send('MESSAGE_CREATE', message('100000000000000001', 'discord.gg/a', asMod));
  await bot.send(
    'MESSAGE_CREATE',
    message('100000000000000002', 'discord.gg/a', { member: { roles: ['900000000000000077'] } }),
  );
  await bot.send('MESSAGE_CREATE', message('100000000000000003', 'discord.gg/a', { channel_id: '900000000000000078' }));
  await bot.send(
    'MESSAGE_CREATE',
    message('100000000000000004', 'discord.gg/a', { author: author(TARGET, { bot: true }) }),
  );
  assert.deepEqual(bot.discord.state.deleted, []);
  await bot.send('MESSAGE_CREATE', message('100000000000000005', 'discord.gg/a'));
  assert.deepEqual(bot.discord.state.deleted, ['100000000000000005'], 'a plain member is not');
});

test('auto-mod: a flood times the member out through moderation', async () => {
  const bot = await standSafetyGateway({ automod: AUTOMOD_ON });
  for (let index = 0; index < 7; index++) {
    bot.clock.now += 300;
    await bot.send('MESSAGE_CREATE', message(`10000000000000001${index}`, `message ${index}`));
  }
  assert.ok(bot.discord.state.timeouts.has(TARGET));
  assert.deepEqual(
    modCases(bot).map((row) => row.action),
    ['timeout'],
  );
});

test("auto-mod: saving keeps the bot's own rules in step and leaves rules made by hand alone", async () => {
  const bot = await standSafetyGateway({});
  const rules = [
    { id: '1', name: `${RULE_PREFIX}Spam`, trigger_type: 3 },
    { id: '2', name: 'Hand-made rule', trigger_type: 1 },
  ];
  const asked: string[][] = [];
  bot.discord.state.extra = [
    ['GET', /\/auto-moderation\/rules$/, () => Response.json(rules)],
    [
      'POST',
      /\/auto-moderation\/rules$/,
      (_found, body) => (asked.push(['make', String(body.name)]), Response.json(body)),
    ],
    [
      'PATCH',
      /\/auto-moderation\/rules\/(\d+)$/,
      (_found, body) => (asked.push(['change', String(body.name)]), Response.json(body)),
    ],
    [
      'DELETE',
      /\/auto-moderation\/rules\/(\d+)$/,
      (found) => (asked.push(['delete', String(found[1])]), new Response(null, { status: 204 })),
    ],
  ];
  const given = {
    words: ['badword'],
    profanity: true,
    slurs: false,
    spam: false,
    mentionLimit: 5,
    alertChannel: ALERTS,
  };
  const config = settingsOf('automod', given);
  const note = await syncRules(bot.context, GUILD, config, true);
  assert.deepEqual(asked, [
    ['make', `${RULE_PREFIX}Blocked words`],
    ['make', `${RULE_PREFIX}Word lists`],
    ['make', `${RULE_PREFIX}Mentions`],
    ['delete', '1'],
  ]);
  assert.match(note, /3 of the bot's rules/);
  const mentions = wantedRules(config, true).get(`${RULE_PREFIX}Mentions`);
  assert.deepEqual(
    (mentions?.actions as { type: number }[]).map((action) => action.type),
    [1, 2, 3],
    'block, alert, time out',
  );
  assert.equal(wantedRules(config, false).size, 0, 'a module turned off asks for no rules');
});
