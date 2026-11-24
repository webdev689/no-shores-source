import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { resetStarts } from './auth.ts';
import {
  GUILD,
  MOD,
  OWNER,
  TARGET,
  TEXT_CHANNEL,
  type StoodWorker,
  bodyOf,
  countOf,
  fakeBucket,
  guildCreate,
  panelRequest,
  signInPanel,
  standGateway,
  standWorker,
} from './botForTests.ts';
import type { Route } from './discordForTests.ts';
import { MEDIA_FILES_MAX, kindOf } from './media.ts';
import type { ServerModule } from './modules/module.ts';
import { resetMembers } from './panel.ts';
import { TESTS_A_MINUTE } from './panelMessages.ts';
import { registryOf } from './registry.ts';
import { slotsFor } from './slots.ts';

beforeEach(() => {
  resetStarts();
  resetMembers();
});

const DM_CHANNEL = '700000000000000001';
const words = (content: string) => ({ content, embeds: [], buttons: [] });
/** A posting Discord: channel posts and DMs answer with an id; a channel in `closed` refuses. */
const posting = (closed: string[] = []): Record<string, Route> => ({
  'POST /api/v10/users/@me/channels': () => [200, { id: DM_CHANNEL }],
  [`POST /api/v10/channels/${DM_CHANNEL}/messages`]: () => [200, { id: '700000000000000002' }],
  [`POST /api/v10/channels/${TEXT_CHANNEL}/messages`]: () =>
    closed.includes(TEXT_CHANNEL) ? [403, { code: 50013 }] : [200, { id: '700000000000000003' }],
});
const postsTo = (bot: StoodWorker, channel: string) =>
  bot.discord.calls.filter((call) => call.method === 'POST' && call.path === `/api/v10/channels/${channel}/messages`);
const testSend = (bot: StoodWorker, token: string, body: object) =>
  bot.call(
    panelRequest(token, `/v1/panel/g/${GUILD}/test-message`, {
      method: 'POST',
      body: JSON.stringify({ module: 'welcome', ...body }),
    }),
  );

/** A small PNG: its signature, a header, a picture chunk and its end, which is all a picture needs to be read. */
const tinyPng = () => {
  const chunk = (kind: string, body: number[]) => {
    const out = Buffer.alloc(12 + body.length);
    out.writeUInt32BE(body.length, 0);
    out.write(kind, 4, 'ascii');
    Buffer.from(body).copy(out, 8);
    return out;
  };
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', [0, 0, 0, 4, 0, 0, 0, 4, 8, 6, 0, 0, 0]),
      chunk('IDAT', [1, 2, 3]),
      chunk('IEND', []),
    ]),
  );
};

test('test send: by DM or to a text channel of this server, filled with their name, pinging no one, audited, a few a minute', async () => {
  const bot = await standWorker({ routes: posting() });
  const owner = await signInPanel(bot, OWNER);
  const direct = await testSend(bot, owner, { message: words('Hello {name} of {server} @everyone'), to: 'me' });
  assert.deepEqual([direct.status, (await bodyOf(direct)).message], [200, 'A test was sent to you by direct message.']);
  const sent = JSON.parse(postsTo(bot, DM_CHANNEL)[0]?.body ?? '{}') as { content: string; allowed_mentions: unknown };
  assert.equal(sent.content, 'Hello Someone of Harbour @everyone');
  assert.deepEqual(sent.allowed_mentions, { parse: [] }, 'a test pings no one');
  const posted = await testSend(bot, owner, { message: words('In the channel'), to: TEXT_CHANNEL });
  assert.equal((await bodyOf(posted)).message, 'A test was posted in #general.');
  assert.equal(postsTo(bot, TEXT_CHANNEL).length, 1);
  const foreign = await testSend(bot, owner, { message: words('x'), to: '800000000000000001' });
  assert.equal(foreign.status, 403, "another server's channel is refused");
  assert.equal(
    (await testSend(bot, owner, { message: words('  '), to: 'me' })).status,
    400,
    'an empty one is not sent',
  );
  assert.equal((await testSend(bot, owner, { message: words('x'.repeat(2001)), to: 'me' })).status, 400);
  const audited = countOf(bot.database, "SELECT COUNT(*) AS count FROM audit_log WHERE action = 'message.test'");
  assert.equal(audited, 2);
  for (let i = audited; i < TESTS_A_MINUTE; i++) await testSend(bot, owner, { message: words('again'), to: 'me' });
  assert.equal((await testSend(bot, owner, { message: words('one too many'), to: 'me' })).status, 429);
  const moderator = await signInPanel(bot, MOD);
  const cannot = await testSend(bot, moderator, { message: words('x'), to: 'me' });
  assert.equal(cannot.status, 403, 'a moderator cannot change the welcome, so cannot test it');
});

test('test send: a channel that refuses the bot is said so; tests pressed together cannot pass the limit', async () => {
  const closed = await standWorker({ routes: posting([TEXT_CHANNEL]) });
  const owner = await signInPanel(closed, OWNER);
  const refused = await testSend(closed, owner, { message: words('x'), to: TEXT_CHANNEL });
  assert.deepEqual([refused.status, (await bodyOf(refused)).message], [502, 'The bot could not post in #general.']);
  const bot = await standWorker({ routes: posting() });
  const token = await signInPanel(bot, OWNER);
  const answers = await Promise.all(
    Array.from({ length: TESTS_A_MINUTE + 4 }, () => testSend(bot, token, { message: words('again'), to: 'me' })),
  );
  assert.equal(answers.filter((answer) => answer.status === 200).length, TESTS_A_MINUTE);
  const kept = bot.database.raw.prepare("SELECT detail FROM audit_log WHERE action = 'message.test'").all() as Array<{
    detail: string;
  }>;
  assert.ok(
    kept.every((row) => (JSON.parse(row.detail) as { ok: boolean }).ok),
    'each sent test is recorded as sent',
  );
});

test('pictures: a manager uploads a real picture, sniffed by its bytes; it is served with its own type to anyone, listed, and removed', async () => {
  const bucket = fakeBucket();
  const bot = await standWorker({ env: { BOT_MEDIA: bucket } });
  const owner = await signInPanel(bot, OWNER);
  const upload = (bytes: Uint8Array, who = owner) =>
    bot.call(
      panelRequest(who, `/v1/panel/g/${GUILD}/media`, {
        method: 'POST',
        body: bytes as Uint8Array<ArrayBuffer>,
        headers: { 'content-type': 'image/png' },
      }),
    );
  const png = tinyPng();
  const done = await upload(png);
  assert.equal(done.status, 200);
  const url = String((await bodyOf(done)).url);
  assert.match(url, /^https:\/\/bot\.example\.workers\.dev\/v1\/media\/[a-f0-9]{32}\.png$/);
  const path = new URL(url).pathname;
  const served = await bot.call(new Request(`https://bot.test${path}`));
  assert.equal(served.headers.get('content-type'), 'image/png');
  assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(new Uint8Array(await served.arrayBuffer()), png);
  const svg = await upload(new TextEncoder().encode('<svg onload=alert(1)></svg>'));
  assert.deepEqual([svg.status, (await bodyOf(svg)).message], [415, 'Only PNG, JPEG, GIF and WebP pictures are kept.']);
  assert.equal((await upload(new Uint8Array(8 * 1024 * 1024 + 1))).status, 413);
  const listed = await bodyOf(await bot.call(panelRequest(owner, `/v1/panel/g/${GUILD}/media`)));
  assert.deepEqual(
    (listed.files as Array<{ url: string }>).map((file) => file.url),
    [url],
  );
  const moderator = await signInPanel(bot, MOD);
  assert.equal((await upload(png, moderator)).status, 403, 'only managers upload');
  const id = /([a-f0-9]{32})/.exec(url)?.[1] ?? '';
  const remove = (who: string) => bot.call(panelRequest(who, `/v1/panel/g/${GUILD}/media/${id}`, { method: 'DELETE' }));
  assert.equal((await remove(moderator)).status, 403);
  assert.equal((await remove(owner)).status, 200);
  assert.equal((await bot.call(new Request(`https://bot.test${path}`))).status, 404);
  assert.equal(countOf(bot.database, "SELECT COUNT(*) AS count FROM audit_log WHERE action LIKE 'media.%'"), 2);
  assert.equal((await bot.call(new Request('https://bot.test/v1/media/../../etc.png'))).status, 404);
});

test('pictures: a server is held to its share, even pressed together; a file the bucket refuses leaves no row', async () => {
  const bucket = fakeBucket();
  const bot = await standWorker({ env: { BOT_MEDIA: bucket } });
  const owner = await signInPanel(bot, OWNER);
  const insert = bot.database.raw.prepare(
    "INSERT INTO media (id, guild_id, type, bytes, by_user, at) VALUES (?, ?, 'image/png', 10, ?, 1)",
  );
  for (let i = 0; i < MEDIA_FILES_MAX - 1; i++) insert.run(String(i).padStart(32, '0'), GUILD, OWNER);
  const upload = () =>
    bot.call(
      panelRequest(owner, `/v1/panel/g/${GUILD}/media`, { method: 'POST', body: tinyPng() as Uint8Array<ArrayBuffer> }),
    );
  const answers = await Promise.all([upload(), upload(), upload()]);
  assert.deepEqual(answers.map((answer) => answer.status).sort(), [200, 409, 409]);
  assert.equal(countOf(bot.database, 'SELECT COUNT(*) AS count FROM media'), MEDIA_FILES_MAX);
  bot.database.raw.prepare("DELETE FROM media WHERE id LIKE '0%'").run();
  bucket.put = async () => {
    throw new Error('bucket down');
  };
  const before = countOf(bot.database, 'SELECT COUNT(*) AS count FROM media');
  assert.equal((await upload()).status, 503);
  assert.equal(countOf(bot.database, 'SELECT COUNT(*) AS count FROM media'), before, 'the row taken back');
  const bare = await standWorker();
  const token = await signInPanel(bare, OWNER);
  assert.equal((await bare.call(panelRequest(token, `/v1/panel/g/${GUILD}/media`))).status, 503, 'not set up');
  assert.equal(kindOf(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))?.ext, 'jpg');
  assert.equal(kindOf(new TextEncoder().encode('RIFF1234WEBPVP8 '))?.ext, 'webp');
  assert.equal(kindOf(new TextEncoder().encode('GIF89a000000'))?.ext, 'gif');
  assert.equal(kindOf(new Uint8Array(4)), null);
});

test("emoji: a button may show only this server's own; another's is refused on save and in a test; a lost one is dropped when read", async () => {
  const bot = await standWorker({ routes: posting() });
  await bot.dispatcher.dispatch('GUILD_CREATE', guildCreate({ emojis: [{ id: '900000000000000077', name: 'sail' }] }));
  const token = await signInPanel(bot, OWNER);
  const got = await bodyOf(await bot.call(panelRequest(token, `/v1/panel/g/${GUILD}/m/welcome`)));
  const joinMessage = (id: string) => ({
    content: 'Hi',
    embeds: [],
    buttons: [{ label: 'Play', emoji: `<:sail:${id}>`, url: 'https://noshores.online/' }],
  });
  const withEmoji = (id: string) => ({ ...(got.config as object), joinMessage: joinMessage(id) });
  const save = (config: object) =>
    bot.call(
      panelRequest(token, `/v1/panel/g/${GUILD}/m/welcome`, {
        method: 'PUT',
        body: JSON.stringify({ config, rev: got.rev, enabled: true }),
      }),
    );
  const foreign = await save(withEmoji('800000000000000077'));
  assert.deepEqual([foreign.status, (await bodyOf(foreign)).error], [403, 'emoji']);
  assert.equal((await save(withEmoji('900000000000000077'))).status, 200);
  const tested = await testSend(bot, token, { message: joinMessage('800000000000000077'), to: 'me' });
  assert.equal(tested.status, 403);
  await bot.dispatcher.dispatch('GUILD_EMOJIS_UPDATE', { guild_id: GUILD, emojis: [] });
  const read = await bodyOf(await bot.call(panelRequest(token, `/v1/panel/g/${GUILD}/m/welcome`)));
  const buttons = (read.config as { joinMessage: { buttons: unknown[] } }).joinMessage.buttons;
  assert.deepEqual(buttons[0], { label: 'Play', emoji: '', url: 'https://noshores.online/' }, 'the button stays');
});

/** A welcome module that fills {welcome_card} with an address naming its card's accent. */
const carding = (asked: string[] = []): ServerModule => ({
  id: 'welcome',
  slots: {
    names: ['welcome_card'],
    fill: async (context, guildId, user, _vars, fresh) => {
      asked.push(String(user.id));
      const card = (fresh ?? (await context.config(guildId, 'welcome'))?.config ?? {}).card as { accent?: string };
      return { welcome_card: `https://card.test/${String(user.id)}?c=${encodeURIComponent(card.accent ?? '')}` };
    },
  },
});

test("placeholders: the member's and the server's are filled; a module's own is asked only when a message names it", async () => {
  const asked: string[] = [];
  const bot = await standGateway({ welcome: {} });
  const registry = registryOf([carding(asked)]);
  const user = { id: TARGET, username: 'ann', avatar: 'abc' };
  const plain = await slotsFor(bot.context, GUILD, user, words('Hi {name}'), {}, {}, registry);
  assert.deepEqual(plain, {
    user: `<@${TARGET}>`,
    name: 'ann',
    server: 'Harbour',
    count: '3',
    avatar: `https://cdn.discordapp.com/avatars/${TARGET}/abc.png?size=256`,
    server_icon: '',
  });
  assert.deepEqual(asked, [], 'not asked when unused');
  const card = await slotsFor(bot.context, GUILD, user, words('{welcome_card}'), { level: '4' }, {}, registry);
  assert.deepEqual([card.welcome_card, card.level], [`https://card.test/${TARGET}?c=%23d9a33c`, '4']);
  assert.deepEqual(asked, [TARGET]);
});

test('previews: a module page hands back its card drawn in the settings just saved, not those the isolate held', async () => {
  const bot = await standWorker({ modules: [carding()] });
  const token = await signInPanel(bot, OWNER);
  const got = await bodyOf(await bot.call(panelRequest(token, `/v1/panel/g/${GUILD}/m/welcome`)));
  assert.equal((got.preview as { cardUrl: string }).cardUrl, `https://card.test/${OWNER}?c=%23d9a33c`);
  const config = got.config as { card: object };
  const changed = { ...config, card: { ...config.card, accent: '#336699' } };
  const saved = await bot.call(
    panelRequest(token, `/v1/panel/g/${GUILD}/m/welcome`, {
      method: 'PUT',
      body: JSON.stringify({ config: changed, rev: got.rev, enabled: true }),
    }),
  );
  assert.equal(
    ((await bodyOf(saved)).preview as { cardUrl: string }).cardUrl,
    `https://card.test/${OWNER}?c=%23336699`,
  );
  const none = await bodyOf(await bot.call(panelRequest(token, `/v1/panel/g/${GUILD}/m/core`)));
  assert.deepEqual(none.preview, {}, 'a module whose messages name no card has no preview');
});
