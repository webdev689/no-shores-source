import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blankEmbed } from '../law/message.ts';
import { GUILD, TARGET, countOf } from '../botForTests.ts';
import { actorOf, standCommunity } from './communityForTests.ts';
import { cardWords } from './card.ts';
import { welcomeModule } from './welcome.ts';

const WELCOME = '900000000000000033';
const ROLE_A = '900000000000000041';
const ROLE_B = '900000000000000042';
const words = (content: string) => ({ content, embeds: [], buttons: [] });
const author = (id: string, extra: Record<string, unknown> = {}) => ({ id, username: `user${id.slice(-2)}`, ...extra });
type Bot = Awaited<ReturnType<typeof standCommunity>>;
const join = (bot: Bot, id: string, extra: Record<string, unknown> = {}) => {
  bot.world.members.set(id, { roles: [] });
  return bot.send('GUILD_MEMBER_ADD', { guild_id: GUILD, user: author(id), roles: [], ...extra });
};
const rolesOf = (bot: Bot, id: string) => bot.world.members.get(id)?.roles;

test('welcome: a join is greeted, pinging only the newcomer, told by DM, and given its roles', async () => {
  const settings = {
    joinChannel: WELCOME,
    leaveChannel: WELCOME,
    dmMessage: words('Read the rules, {name}.'),
    joinRoles: [ROLE_A],
    botRoles: [ROLE_B],
  };
  const bot = await standCommunity({ welcome: settings }, [welcomeModule]);
  await join(bot, TARGET);
  const [hello] = bot.posts(WELCOME);
  assert.equal(hello?.content, `Welcome <@${TARGET}> to Harbour! You are member 4.`);
  assert.deepEqual(hello?.allowed_mentions, { users: [TARGET] });
  assert.equal(bot.world.dms[0]?.content, 'Read the rules, user12.');
  assert.deepEqual(rolesOf(bot, TARGET), [ROLE_A]);
  const robot = '900000000000000150';
  await join(bot, robot, { user: author(robot, { bot: true }) });
  assert.deepEqual(rolesOf(bot, robot), [ROLE_B], "a bot gets the bots' roles");
  assert.equal(bot.world.dms.length, 1, 'a bot is sent no direct message');
  await bot.send('GUILD_MEMBER_REMOVE', { guild_id: GUILD, user: author(TARGET) });
  assert.equal(bot.posts(WELCOME).at(-1)?.content, 'user12 left the server.');
});

test("welcome: a card of embeds with the member's avatar; an empty message posts nothing; the panel's test", async () => {
  const card = blankEmbed({
    authorName: '{name}',
    authorIcon: '{avatar}',
    title: 'Welcome, {name}',
    thumbnail: '{avatar}',
    footer: '{server} - member {count}',
    timestamp: true,
  });
  const joinMessage = { content: '', embeds: [card, blankEmbed({ description: `Read <#${WELCOME}>.` })], buttons: [] };
  const settings = { joinChannel: WELCOME, leaveChannel: WELCOME, joinMessage, leaveMessage: words('') };
  const bot = await standCommunity({ welcome: settings }, [welcomeModule]);
  bot.clock.now = Date.UTC(2026, 10, 15, 12);
  bot.world.members.set(TARGET, { roles: [] });
  const user = author(TARGET, { username: 'sea_wolf*', avatar: 'abc123' });
  await bot.send('GUILD_MEMBER_ADD', { guild_id: GUILD, user, roles: [] });
  const [hello] = bot.posts(WELCOME);
  assert.equal(hello?.content, undefined, 'no words, only the cards');
  const avatar = `https://cdn.discordapp.com/avatars/${TARGET}/abc123.png?size=256`;
  const embeds = hello?.embeds as Array<Record<string, unknown>>;
  assert.deepEqual(embeds[0], {
    color: 0x8a5a2b,
    author: { name: 'sea_wolf*', icon_url: avatar },
    title: 'Welcome, sea\\_wolf\\*',
    thumbnail: { url: avatar },
    footer: { text: 'Harbour - member 4' },
    timestamp: '2026-11-15T12:00:00.000Z',
  });
  assert.equal(embeds[1]?.description, `Read <#${WELCOME}>.`);
  await bot.send('GUILD_MEMBER_REMOVE', { guild_id: GUILD, user: author(TARGET) });
  assert.equal(bot.posts(WELCOME).length, 1, 'an empty goodbye is not sent');
  const config = await bot.settingsOf('welcome');
  const test = welcomeModule.actions?.test;
  assert.ok(test);
  assert.deepEqual(await test(bot.context, GUILD, {}, actorOf(), config), {
    ok: true,
    message: 'A test welcome was posted.',
  });
  const thumbnail = (bot.posts(WELCOME).at(-1)?.embeds as Array<{ thumbnail: { url: string } }>)[0]?.thumbnail;
  assert.match(String(thumbnail?.url), /^https:\/\/cdn\.discordapp\.com\/embed\/avatars\/[0-5]\.png$/, 'no avatar');
  const before = bot.posts(WELCOME).length;
  const empty = { ...config, joinMessage: words(' ') };
  await welcomeModule.events?.GUILD_MEMBER_ADD?.(bot.context, { guild_id: GUILD, user: author(TARGET) }, empty);
  assert.equal(bot.posts(WELCOME).length, before, 'an empty welcome is not posted');
  assert.equal((await test(bot.context, GUILD, {}, actorOf(), empty)).message, 'The welcome message is empty.');
  bot.world.closed.add(WELCOME);
  assert.equal(
    (await test(bot.context, GUILD, {}, actorOf(), config)).message,
    'The bot could not post in that channel.',
  );
  const nowhere = { ...config, joinChannel: '' };
  assert.equal((await test(bot.context, GUILD, {}, actorOf(), nowhere)).message, 'Choose a welcome channel first.');
});

test('welcome: roles wait for the rules screening, or for the delay, then the clock gives them', async () => {
  const bot = await standCommunity({ welcome: { joinRoles: [ROLE_A], delayMinutes: 10 } }, [welcomeModule]);
  await join(bot, TARGET, { pending: true });
  assert.deepEqual(rolesOf(bot, TARGET), []);
  await bot.send('GUILD_MEMBER_UPDATE', { guild_id: GUILD, user: author(TARGET), roles: [], pending: false });
  await welcomeModule.minute?.(bot.context);
  assert.deepEqual(rolesOf(bot, TARGET), [], 'the delay starts when the screening is passed');
  bot.clock.now += 11 * 60_000;
  await welcomeModule.minute?.(bot.context);
  assert.deepEqual(rolesOf(bot, TARGET), [ROLE_A]);
  assert.equal(countOf(bot.database, 'SELECT COUNT(*) AS count FROM welcome_pending'), 0);
});

test('welcome: with no delay, roles wait only for the screening; a member who leaves is forgotten', async () => {
  const bot = await standCommunity({ welcome: { joinRoles: [ROLE_A] } }, [welcomeModule]);
  await join(bot, TARGET, { pending: true });
  assert.equal(countOf(bot.database, 'SELECT COUNT(*) AS count FROM welcome_pending WHERE due_at = -1'), 1);
  await bot.send('GUILD_MEMBER_UPDATE', { guild_id: GUILD, user: author(TARGET), roles: [], pending: false });
  assert.deepEqual(rolesOf(bot, TARGET), [ROLE_A], 'given as soon as the screening is passed');
  await join(bot, '900000000000000151', { pending: true });
  await bot.send('GUILD_MEMBER_REMOVE', { guild_id: GUILD, user: author('900000000000000151') });
  assert.equal(countOf(bot.database, 'SELECT COUNT(*) AS count FROM welcome_pending'), 0);
});

test("welcome: {welcome_card} becomes a signed card address of this member, in the server's card settings", async () => {
  const card = { title: 'Hail', subtitle: 'Number {count}', accent: '#336699', background: '#000000' };
  const joinMessage = { content: '', embeds: [blankEmbed({ title: 'Welcome', image: '{welcome_card}' })], buttons: [] };
  const bot = await standCommunity({ welcome: { joinChannel: WELCOME, joinMessage, card } }, [welcomeModule]);
  bot.world.members.set(TARGET, { roles: [] });
  await bot.send('GUILD_MEMBER_ADD', { guild_id: GUILD, user: { id: TARGET, username: 'ann', avatar: 'abc' } });
  const image = (bot.posts(WELCOME)[0]?.embeds as Array<{ image: { url: string } }>)[0]?.image;
  const url = new URL(String(image?.url));
  assert.equal(url.origin + url.pathname, 'https://bot.example.workers.dev/v1/card/welcome.png');
  const read = await cardWords(bot.context.vars, url.searchParams.get('p') ?? '', url.searchParams.get('s') ?? '');
  assert.deepEqual(read, {
    title: 'Hail',
    name: 'ann',
    under: 'Number 4',
    avatar: `https://cdn.discordapp.com/avatars/${TARGET}/abc.png?size=256`,
    accent: '#336699',
    background: '#000000',
  });
});
