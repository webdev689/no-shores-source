import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUILD, OWNER } from '../botForTests.ts';
import { PERMISSION } from '../law/access.ts';
import { BOT_MODULES, moduleOf } from '../law/modules.ts';
import { type Settings, defaults, recordOf, validate } from '../law/settings.ts';
import { readConfig, readSnapshot, writeConfig } from '../store.ts';
import { LAYOUT_BY, build, planRows } from './build.ts';
import { BOT, FIRST_INVITE, OWNER_ACTOR, standLayout } from './guildForTests.ts';
import { RULES, guideMessage, openingNews, firstPatchNotes, rulesMessage, tags } from './messages.ts';
import { modulePlans } from './moduleSettings.ts';
import { BOT_PERMISSIONS, CHANNELS, ROLES, WELCOME_SCREEN } from './noShores.ts';

type Stood = Awaited<ReturnType<typeof standLayout>>;
const run = (stood: Stood) => build(stood.context, GUILD, OWNER_ACTOR, stood.picture);
const embedsOf = (message: Settings | undefined) =>
  Array.isArray(message?.embeds) ? message.embeds.map(recordOf) : [];
const checklistOf = (stood: Stood) => {
  const posts = stood.server.postsIn('staff');
  assert.equal(posts.length, 1, 'one checklist in #staff');
  return embedsOf(posts[0])[0] ?? {};
};
const fieldNames = (card: Settings) =>
  Array.isArray(card.fields) ? card.fields.map((field) => recordOf(field).name) : [];

test('layout: a first build makes every role and channel in order, sets the modules, posts, and leaves a checklist', async () => {
  const stood = await standLayout();
  const done = await run(stood);
  assert.equal(done.ok, true);
  const { state } = stood.server;
  // every role, the house and ping roles below the staff, and none of them able to ping everyone
  assert.deepEqual(
    state.roles
      .filter((role) => !role.managed && role.id !== GUILD)
      .sort((a, b) => Number(b.position) - Number(a.position))
      .map((role) => role.name),
    ROLES.map((role) => role.name),
  );
  const moderator = stood.server.roleNamed('Moderator');
  assert.equal(BigInt(String(moderator?.permissions)) & PERMISSION.MANAGE_THREADS, PERMISSION.MANAGE_THREADS);
  assert.equal(stood.server.roleNamed('Stormcallers')?.permissions, '0');
  // every channel in the layout's order, each under its category
  assert.deepEqual(
    state.channels.map((channel) => channel.name),
    CHANNELS.map((channel) => channel.name),
  );
  const parentOf = (name: string) =>
    state.channels.find((channel) => channel.id === stood.server.channelNamed(name)?.parent_id)?.name;
  assert.equal(parentOf('mod-log'), 'Staff');
  assert.equal(parentOf('Make a room'), 'Voice');
  // before Community, the news channels are text channels, and the forum keeps its tags
  assert.equal(stood.server.channelNamed('announcements')?.type, 0);
  assert.equal(stood.server.channelNamed('bug-reports')?.type, 15);
  const tagNames = (stood.server.channelNamed('bug-reports')?.available_tags as Settings[]).map((tag) => tag.name);
  assert.ok(tagNames.includes('Fixed') && tagNames.includes('Crash'));
  // the staff area is hidden from everyone and open to the moderators and the bot
  const staff = stood.server.channelNamed('Staff');
  const over = staff?.permission_overwrites as Array<{ id: string; type: number; allow: string; deny: string }>;
  const everyone = over.find((each) => each.id === GUILD);
  assert.equal(BigInt(String(everyone?.deny)) & PERMISSION.VIEW_CHANNEL, PERMISSION.VIEW_CHANNEL);
  assert.ok(
    over.some((each) => each.id === String(moderator?.id) && (BigInt(each.allow) & PERMISSION.VIEW_CHANNEL) !== 0n),
  );
  assert.ok(over.some((each) => each.id === BOT && each.type === 1));
  // the server's own settings
  assert.equal(state.guild.verification_level, 2);
  assert.equal(state.guild.default_message_notifications, 1);
  assert.equal(state.guild.explicit_content_filter, 2);
  assert.equal(state.guild.system_channel_id, stood.server.channelNamed('general')?.id);
  assert.equal(state.guild.icon, 'data:image/png;base64,iVBORw0KGgo=');
  assert.equal(BigInt(String(stood.server.roleNamed('@everyone')?.permissions)) & PERMISSION.MENTION_EVERYONE, 0n);
  // the modules: on, saved by the layout, and each setting valid by its module's law
  for (const plan of modulePlans({ channel: () => '', role: () => '' })) {
    const kept = await readConfig(stood.database, GUILD, plan.id);
    assert.equal(kept?.updatedBy, LAYOUT_BY, plan.id);
    assert.equal(kept?.enabled, plan.enabled, plan.id);
  }
  const tickets = await readConfig(stood.database, GUILD, 'tickets');
  assert.equal(tickets?.config.panelChannel, stood.server.channelNamed('support')?.id);
  assert.equal(tickets?.config.category, stood.server.channelNamed('Tickets')?.id);
  const game = await readConfig(stood.database, GUILD, 'game');
  assert.deepEqual(
    (game?.config.houses as Settings[]).map((house) => house.faction),
    ['Stormcallers', 'Lamplighters', 'The Veiled'],
  );
  assert.ok(stood.forgotten.includes('automod'), "the Gateway is told each module's settings changed");
  // the posts: the guide and the ping buttons in #welcome, the rules, and the ticket button
  assert.equal(embedsOf(stood.server.postsIn('welcome')[0])[0]?.title, 'Welcome to No Shores');
  assert.equal(stood.server.postsIn('welcome').length, 2, 'the guide, then the ping buttons');
  assert.equal(embedsOf(stood.server.postsIn('rules')[0])[0]?.title, 'Code of conduct');
  assert.equal(stood.server.postsIn('support').length, 1);
  assert.equal(stood.server.postsIn('announcements').length, 0, 'news waits for the owner to send it');
  // the owner holds Founder, and the checklist asks for Community
  assert.ok(state.members.get(OWNER)?.includes(String(stood.server.roleNamed('Founder')?.id)));
  assert.deepEqual(fieldNames(checklistOf(stood)), ['Turn on Community']);
  assert.match(done.message, /^Made 8 roles and 22 channels, set 16 modules, posted 4 messages\. 1 thing is left/);
});

test('layout: a second build makes nothing again and updates its posts in place', async () => {
  const stood = await standLayout();
  await run(stood);
  const before = stood.server.changes().filter((call) => call.method === 'POST').length;
  const again = await run(stood);
  assert.equal(again.ok, true);
  assert.match(again.message, /^Made 0 roles and 0 channels/);
  const posts = stood.server.changes().filter((call) => call.method === 'POST').length;
  assert.equal(posts, before, 'no role, channel or message is made twice');
  assert.equal(stood.server.postsIn('welcome').length, 2);
  assert.equal(stood.server.postsIn('staff').length, 1, 'the checklist is edited, not posted again');
});

test('layout: a part renamed by hand is kept, one deleted by hand is left out, and panel saves are left alone', async () => {
  const stood = await standLayout();
  await run(stood);
  const { state } = stood.server;
  const general = stood.server.channelNamed('general');
  if (general) general.name = 'tavern';
  state.channels = state.channels.filter((channel) => channel.name !== 'screenshots');
  const kept = await readConfig(stood.database, GUILD, 'levels');
  await writeConfig(stood.database, {
    guildId: GUILD,
    moduleId: 'levels',
    config: { ...(kept?.config ?? {}), announce: 'same' },
    enabled: true,
    rev: kept?.rev ?? 0,
    by: OWNER,
    nowS: 2,
  });
  const again = await run(stood);
  assert.ok(!state.channels.some((channel) => channel.name === 'general'), 'the renamed channel is not made again');
  assert.ok(!state.channels.some((channel) => channel.name === 'screenshots'), 'the deleted channel stays deleted');
  const row = (name: string) => again.rows.find((each) => each.name === name)?.state;
  assert.equal(row('#screenshots'), 'Deleted by hand, left out');
  assert.equal(row('#general'), 'There');
  assert.equal(row('Levels'), 'Changed in the panel, left as it is');
  assert.equal((await readConfig(stood.database, GUILD, 'levels'))?.config.announce, 'same');
});

test("layout: on Discord's own new server, its #general and voice room are adopted and moved, and its categories go", async () => {
  const stood = await standLayout();
  const { state } = stood.server;
  state.roles.push({ id: '920000000000000001', name: 'Moderator', position: 3, permissions: '8192', managed: false });
  state.channels.push(
    { id: '920000000000000010', name: 'Text Channels', type: 4, parent_id: null },
    { id: '920000000000000011', name: 'general', type: 0, parent_id: '920000000000000010', topic: 'Ours' },
    { id: '920000000000000012', name: 'Voice Channels', type: 4, parent_id: null },
    { id: '920000000000000013', name: 'General', type: 2, parent_id: '920000000000000012' },
  );
  const done = await run(stood);
  assert.equal(state.roles.filter((role) => role.name === 'Moderator').length, 1);
  assert.equal(stood.server.roleNamed('Moderator')?.permissions, '8192', 'its permissions are left as they were');
  const general = state.channels.filter((channel) => channel.name === 'general');
  assert.equal(general.length, 1, 'no second #general');
  assert.equal(general[0]?.id, '920000000000000011', 'the same channel, its messages kept');
  assert.equal(general[0]?.parent_id, stood.server.channelNamed('Community')?.id, 'moved into Community');
  assert.equal(general[0]?.topic, 'Ours', 'its topic left as it was');
  assert.equal(stood.server.channelNamed('General')?.parent_id, stood.server.channelNamed('Voice')?.id);
  assert.equal(stood.server.channelNamed('Lounge'), undefined, "Discord's voice room is the lounge");
  assert.equal(stood.server.channelNamed('Text Channels'), undefined, 'its empty categories are removed');
  assert.equal(stood.server.channelNamed('Voice Channels'), undefined);
  assert.match(done.message, /^Made 7 roles and 20 channels/, 'one role and two channels fewer, as they were adopted');
  const tickets = await readConfig(stood.database, GUILD, 'tickets');
  assert.deepEqual(tickets?.config.staffRoles, ['920000000000000001'], 'the adopted role is the one named');
});

test('layout: two builds at once, as from two tabs, make each part once: the second is turned away', async () => {
  const stood = await standLayout();
  const [first, second] = await Promise.all([run(stood), run(stood)]);
  assert.deepEqual([first.ok, second.ok].sort(), [false, true]);
  assert.match((first.ok ? second : first).message, /already running/);
  assert.equal(stood.server.state.roles.filter((role) => role.name === 'Moderator').length, 1);
  assert.equal(stood.server.state.channels.filter((channel) => channel.name === 'general').length, 1);
  const again = await run(stood);
  assert.equal(again.ok, true, 'the claim is let go once a build ends');
});

test("layout: Discord's own empty categories are removed by the first build alone, never one made by hand later", async () => {
  const stood = await standLayout();
  const { state } = stood.server;
  state.channels.push({ id: '920000000000000010', name: 'Text Channels', type: 4, parent_id: null });
  await run(stood);
  assert.equal(stood.server.channelNamed('Text Channels'), undefined);
  state.channels.push({ id: '920000000000000020', name: 'Text Channels', type: 4, parent_id: null });
  await run(stood);
  assert.ok(stood.server.channelNamed('Text Channels'), 'one the owner made afterwards is theirs');
});

test("layout: the snapshot it leaves is Discord's after the build, so the panel never reads @everyone as able to ping", async () => {
  const stood = await standLayout();
  await run(stood);
  const snapshot = await readSnapshot(stood.database, GUILD);
  const everyone = snapshot?.roles.find((role) => role.id === GUILD);
  assert.equal(BigInt(String(everyone?.permissions)) & PERMISSION.MENTION_EVERYONE, 0n);
  assert.ok(snapshot?.channels.some((channel) => channel.name === 'mod-log'));
});

test('layout: in each category the bot keeps every permission the category takes from everyone, so it may set its channels', () => {
  // Discord lets a bot set on a channel only what it holds in the channel's category.
  for (const category of CHANNELS.filter((channel) => channel.kind === 'category')) {
    const denied = (category.overwrites ?? []).find((each) => each.who === 'everyone')?.deny ?? [];
    const kept = (category.overwrites ?? []).find((each) => each.who === 'bot')?.allow ?? [];
    const children = CHANNELS.filter((channel) => channel.parent === category.key);
    const setBelow = children.flatMap((child) =>
      (child.overwrites ?? []).flatMap((each) => [...(each.allow ?? []), ...(each.deny ?? [])]),
    );
    for (const name of [...denied, ...setBelow].filter((each) => denied.includes(each)))
      assert.ok(kept.includes(name), `${category.name}: the bot gives up ${name}`);
  }
});

test('layout: once Community is on, a build makes the news channels announcement ones and sets the welcome screen', async () => {
  const stood = await standLayout();
  await run(stood);
  (stood.server.state.guild.features as string[]).push('COMMUNITY');
  await run(stood);
  assert.equal(stood.server.channelNamed('announcements')?.type, 5);
  assert.equal(stood.server.channelNamed('patch-notes')?.type, 5);
  const screen = stood.server.state.welcomeScreen;
  assert.equal((screen?.welcome_channels as unknown[]).length, WELCOME_SCREEN.length);
  assert.equal(stood.server.state.guild.rules_channel_id, stood.server.channelNamed('rules')?.id);
  assert.equal(stood.server.state.guild.public_updates_channel_id, stood.server.channelNamed('staff')?.id);
  const card = checklistOf(stood);
  assert.deepEqual(fieldNames(card), ['Turn on rules screening']);
  const how = String(recordOf((card.fields as unknown[])[0]).value);
  assert.ok(how.includes(`1. ${RULES[0]?.[0]}`), 'the rules to paste are in it');
  (stood.server.state.guild.features as string[]).push('MEMBER_VERIFICATION_GATE_ENABLED');
  await run(stood);
  assert.equal(checklistOf(stood).title, 'The server is finished');
});

test('layout: the bot gives only what it holds, and the checklist links the invite that grants the rest', async () => {
  const stood = await standLayout(FIRST_INVITE);
  await run(stood);
  const moderator = BigInt(String(stood.server.roleNamed('Moderator')?.permissions));
  assert.equal(moderator & PERMISSION.MANAGE_THREADS, 0n, 'the bot cannot give what it lacks');
  assert.equal(moderator & PERMISSION.BAN_MEMBERS, PERMISSION.BAN_MEMBERS);
  const card = checklistOf(stood);
  assert.equal(fieldNames(card)[0], 'Give the bot what it lacks');
  const how = String(recordOf((card.fields as unknown[])[0]).value);
  const bits = BOT_PERMISSIONS.reduce((sum, name) => sum | PERMISSION[name], 0n);
  assert.ok(how.includes(`client_id=900000000000000099`) && how.includes(`permissions=${bits}`));
  assert.ok(how.includes(`guild_id=${GUILD}`) && how.includes('manage threads'));
});

test('layout: the plan changes nothing and says what a build would do', async () => {
  const stood = await standLayout();
  const plan = await planRows(stood.context, GUILD);
  assert.deepEqual(stood.server.changes(), [], 'nothing changed in Discord');
  assert.equal(plan.rows.find((row) => row.name === 'Moderator')?.state, 'Will be made');
  assert.equal(plan.rows.find((row) => row.name === '#announcements')?.state, 'Will be made, as text until Community');
  assert.equal(plan.rows.find((row) => row.name === 'Tickets' && row.part === 'Module')?.state, 'Will be set, on');
  assert.equal(plan.rows.find((row) => row.name === 'Giveaways')?.state, 'Off, one switch away');
  assert.ok(plan.rows.some((row) => row.part === 'For you' && row.name === 'Turn on Community'));
  assert.equal((await readConfig(stood.database, GUILD, 'tickets'))?.rev, 0, 'nothing saved');
});

test("layout: every setting it writes passes its module's law, and it is the panel's, built only by the owner", () => {
  const ids = {
    channel: (key: string) => `9${key.length}0000000000000001`,
    role: (key: string) => `8${key.length}0000000000000001`,
  };
  for (const plan of modulePlans(ids)) {
    const shape = moduleOf(plan.id);
    assert.ok(shape, plan.id);
    const checked = validate(shape.schema, { ...defaults(shape.schema), ...plan.config });
    assert.ok(checked.ok, `${plan.id}: ${checked.ok ? '' : JSON.stringify(checked.errors)}`);
  }
  const layout = BOT_MODULES.find((shape) => shape.id === 'layout');
  assert.equal(layout?.actions?.[0]?.level, 'owner');
  assert.ok(layout?.actions?.[0]?.confirm);
});

test('layout: its words are plain, with no dash between clauses, no ellipsis, and within Discord limits', () => {
  const ids = { channel: () => '900000000000000001', role: () => '900000000000000002' };
  const words = JSON.stringify([
    guideMessage(ids),
    rulesMessage(ids),
    openingNews(ids),
    firstPatchNotes(),
    tags(ids),
    CHANNELS.map((channel) => channel.topic ?? ''),
    WELCOME_SCREEN,
  ]);
  assert.doesNotMatch(words, /[–—]|\.\.\.|…| - /);
  for (const channel of CHANNELS) assert.ok((channel.topic ?? '').length <= 1024, channel.key);
  for (const entry of WELCOME_SCREEN) assert.ok(entry.description.length <= 42, entry.channel);
  assert.equal(
    CHANNELS.filter((channel) => channel.tags).every((channel) => (channel.tags?.length ?? 0) <= 20),
    true,
  );
});
