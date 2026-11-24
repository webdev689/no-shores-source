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

test('auto-mod: a link is judged by the host a browser opens, and an allowed site matches only whole names', () => {
  const config = settingsOf('automod', AUTOMOD_ON);
  const linkTo = (content: string) => breaks(config, content, [], 1_000_000)?.why ?? 'allowed';
  for (const bypass of [
    'https://evil.example?.noshores.online',
    'https://evil.example#.noshores.online',
    'https://noshores.online.evil.example',
    'https://user@evil.example',
    'https://noshores.online@evil.example',
    'https://evil.example\\noshores.online',
    'https://EVIL.example/?site=noshores.online',
    'https://evilnoshores.online',
  ])
    assert.match(
      linkTo(bypass),
      /^a link to (evil\.example|noshores\.online\.evil\.example|evilnoshores\.online)$/,
      bypass,
    );
  for (const fine of [
    'https://NoShores.Online/x',
    'https://play.noshores.online:8443/x',
    'https://evil.example@noshores.online',
    'see [the site](https://noshores.online).',
    '**https://noshores.online**',
    '||https://noshores.online||',
  ])
    assert.equal(linkTo(fine), 'allowed', fine);
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

test('auto-mod: one flood is one warning, its later messages deleted without another; a flood after the window is new', async () => {
  const steps = [{ warnings: 3, action: 'ban', minutes: 0 }];
  const bot = await standSafetyGateway({
    automod: { ...AUTOMOD_ON, flood: 'warn' },
    moderation: { steps, logChannel: LOG_CHANNEL },
  });
  const burst = async (first: number) => {
    for (let index = first; index < first + 10; index++) {
      bot.clock.now += 300;
      await bot.send('MESSAGE_CREATE', message(String(100000000000000100n + BigInt(index)), `message ${index}`));
    }
  };
  await burst(0);
  assert.equal(bot.discord.state.deleted.length, 4, 'every message past the sixth is deleted');
  assert.deepEqual(
    modCases(bot).map((row) => row.action),
    ['warn'],
  );
  assert.equal(bot.discord.postsTo(ALERTS).length, 1, 'said once');
  bot.clock.now += 2 * 60_000;
  await burst(10);
  assert.deepEqual(
    modCases(bot).map((row) => row.action),
    ['warn', 'warn'],
  );
  assert.equal(bot.discord.state.bans.has(TARGET), false, 'two floods are two warnings, short of the step');
});

test('auto-mod: an edit is checked as a message is; an update that leaves the words alone is not', async () => {
  const bot = await standSafetyGateway({ automod: AUTOMOD_ON });
  // a preview added to a message from before auto-mod was on, then a pin long after its last edit: the words are as
  // they were, so it is not read again
  const preview = { edited_timestamp: null, embeds: [{ type: 'link' }] };
  await bot.send('MESSAGE_UPDATE', message('100000000000000002', 'join discord.gg/older', preview));
  const editedLongAgo = { edited_timestamp: new Date(bot.clock.now - 30 * 86_400_000).toISOString(), pinned: true };
  await bot.send('MESSAGE_UPDATE', message('100000000000000002', 'join discord.gg/older', editedLongAgo));
  await bot.send('MESSAGE_CREATE', message('100000000000000001', 'hello there'));
  const edited = { edited_timestamp: new Date(bot.clock.now).toISOString() };
  for (let index = 0; index < 7; index++) {
    bot.clock.now += 300;
    await bot.send('MESSAGE_UPDATE', message('100000000000000001', `hello there ${index}`, edited));
  }
  assert.deepEqual(bot.discord.state.deleted, [], 'edits are no flood');
  await bot.send('MESSAGE_UPDATE', message('100000000000000001', 'now join discord.gg/scam', edited));
  assert.deepEqual(bot.discord.state.deleted, ['100000000000000001']);
  assert.deepEqual(
    modCases(bot).map((row) => [row.action, row.reason]),
    [['warn', 'Auto-mod: an invite link']],
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
