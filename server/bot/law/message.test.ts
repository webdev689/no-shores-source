import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type Payload,
  BUTTON_SCHEMA,
  LIMITS,
  LINK_SLOTS,
  MESSAGE_SCHEMA,
  asEdit,
  avatarUrl,
  blankEmbed,
  emojiOf,
  escapeText,
  fillSlots,
  messageEmpty,
  messageField,
  messagePayload,
  messageSize,
  payloadEmpty,
  serverIconUrl,
  slotsUsed,
} from './message.ts';
import { messageFromJson, messageToJson } from './messageJson.ts';
import { type Schema, type Settings, defaults, salvage, validate } from './settings.ts';

const EMBED_FIELDS = (MESSAGE_SCHEMA.embeds as { of: { fields: Schema } }).of.fields;
const embed = (over: Settings = {}): Settings => ({ ...defaults(EMBED_FIELDS), ...over });
const words = (content: string) => ({ content, embeds: [] });
/** What Discord counts toward its 6000 in a built message. */
const sent = (payload: Payload) =>
  payload.embeds.reduce(
    (sum, part) =>
      sum +
      (part.title?.length ?? 0) +
      (part.description?.length ?? 0) +
      (part.author?.name.length ?? 0) +
      (part.footer?.text.length ?? 0) +
      (part.fields ?? []).reduce((inner, field) => inner + field.name.length + field.value.length, 0),
    0,
  );

test('message law: words and embeds as Discord takes them, placeholders filled, the time when asked', () => {
  const vars = { user: '<@1>', name: 'Ann', server: 'Harbour', avatar: 'https://cdn.discordapp.com/avatars/1/a.png' };
  const saved = {
    content: 'Welcome {user} to {server}!',
    embeds: [
      embed({
        color: '#336699',
        authorName: '{name}',
        authorUrl: 'https://noshores.online/',
        authorIcon: '{avatar}',
        title: 'Hello {name}',
        url: 'https://noshores.online/play/',
        description: 'Read the rules.',
        thumbnail: '{avatar}',
        image: 'https://example.com/banner.png',
        fields: [
          { name: 'Rules', value: '#rules', inline: true },
          { name: '', value: 'No name', inline: false },
          { name: '', value: '', inline: true },
        ],
        footer: 'Harbour',
        footerIcon: '{server_icon}',
        timestamp: true,
      }),
    ],
  };
  const payload = messagePayload(saved, vars, Date.UTC(2026, 10, 15));
  assert.equal(payload.content, 'Welcome <@1> to Harbour!');
  assert.deepEqual(
    payload.embeds,
    [
      {
        color: 0x336699,
        author: { name: 'Ann', url: 'https://noshores.online/', icon_url: vars.avatar },
        title: 'Hello Ann',
        url: 'https://noshores.online/play/',
        description: 'Read the rules.',
        thumbnail: { url: vars.avatar },
        image: { url: 'https://example.com/banner.png' },
        fields: [
          { name: 'Rules', value: '#rules', inline: true },
          { name: '​', value: 'No name', inline: false },
        ],
        footer: { text: 'Harbour' },
        timestamp: '2026-11-15T00:00:00.000Z',
      },
    ],
    'a field with neither part goes, an empty name is a zero-width space, and an unfilled icon is left out',
  );
});

test('message law: an empty embed is never sent, a link that is not https is left out, an unknown placeholder shows', () => {
  const payload = messagePayload({
    content: '',
    embeds: [embed(), embed({ title: 'x', url: 'http://plain.example', image: 'javascript:alert(1)' })],
  });
  assert.deepEqual(payload, { embeds: [{ color: 0x8a5a2b, title: 'x' }] });
  assert.equal(fillSlots('Hi {nmae}', { name: 'Ann' }), 'Hi {nmae}', 'a typo stays as written');
  assert.equal(messageEmpty({ content: '  ', embeds: [embed()] }), true);
  assert.equal(messageEmpty(words('Hello')), false);
  assert.equal(fillSlots('{constructor} {toString} {name}', { name: 'Ann' }), '{constructor} {toString} Ann');
});

test('message law: ten embeds at most, and the 6000 across them held by cutting the last descriptions first', () => {
  const long = 'x'.repeat(4000);
  const saved = {
    content: '',
    embeds: Array.from({ length: 12 }, (_entry, i) => embed({ title: `E${i}`, description: long })),
  };
  const payload = messagePayload(saved);
  assert.equal(payload.embeds.length, LIMITS.embeds);
  assert.equal(sent(payload), LIMITS.total);
  assert.equal(payload.embeds[0]?.description?.length, 4000, 'the first is whole');
  assert.ok(
    payload.embeds.slice(2).every((part) => !part.description),
    'the last lost theirs first',
  );
});

test('message law: a message setting checks every part, refuses past 6000 on a save, and reads back leniently', () => {
  const schema: Schema = { welcome: messageField('Welcome', { vars: ['user', 'avatar'], content: 'Hi {user}' }) };
  assert.deepEqual(defaults(schema), { welcome: { content: 'Hi {user}', embeds: [], buttons: [] } });
  const pathsOf = (read: ReturnType<typeof validate>) => (read.ok ? [] : read.errors.map((error) => error.path));
  const badLink = validate(schema, { welcome: { content: '', embeds: [embed({ image: 'http://x' })] } });
  assert.deepEqual(pathsOf(badLink), ['welcome.embeds[0].image']);
  assert.equal(
    validate(schema, { welcome: { content: '', embeds: Array.from({ length: 11 }, () => embed()) } }).ok,
    false,
  );
  const big = {
    content: '',
    embeds: [embed({ description: 'x'.repeat(4000) }), embed({ description: 'y'.repeat(2500) })],
  };
  assert.equal(messageSize(big), 6500);
  const refused = validate(schema, { welcome: big });
  assert.match(refused.ok ? '' : (refused.errors[0]?.message ?? ''), /6000/);
  const back = salvage(schema, { welcome: big }).welcome as { embeds: unknown[] };
  assert.equal(back.embeds.length, 2, 'read back as it was, and cut when it is sent');
  assert.equal(
    validate(schema, { welcome: { content: 'Hi', embeds: [embed({ title: 'T', thumbnail: '{avatar}' })] } }).ok,
    true,
  );
  const cannot = validate(schema, {
    welcome: {
      content: '{nmae}',
      embeds: [embed({ image: '{welcome_card}' })],
      buttons: [{ label: 'x', emoji: '', url: '{server_icon}' }],
    },
  });
  assert.deepEqual(
    cannot.ok ? [] : cannot.errors.map((error) => [error.path, error.message]),
    [
      ['welcome.embeds[0].image', 'This message cannot fill {welcome_card}.'],
      ['welcome.buttons[0].url', 'This message cannot fill {server_icon}.'],
    ],
    'a link it cannot fill is refused where it was typed; words keep a typo as written',
  );
  const emoji = validate(schema, {
    welcome: { content: 'x', embeds: [], buttons: [{ label: 'x', emoji: ':sword:', url: 'https://x.example/' }] },
  });
  assert.deepEqual(pathsOf(emoji), ['welcome.buttons[0].emoji']);
});

test("message law: a button's emoji is one real emoji or one of a server's own, never a sign that only looks like one", () => {
  const button = (emoji: string) => validate(BUTTON_SCHEMA, { label: '', emoji, url: 'https://x.example/' }).ok;
  const real = ['\u{1F3AE}', '\u2764\uFE0F', '\u{1F44D}\u{1F3FD}', '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}'];
  real.push('\u{1F3F3}\uFE0F\u200D\u{1F308}', '\u{1F1EC}\u{1F1E7}', '#\uFE0F\u20E3', '1\u20E3', '\u00A9');
  real.push('\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}', '<:sail:900000000000000077>', '');
  for (const emoji of real) assert.equal(button(emoji), true, `${emoji} is taken`);
  const signs = ['\uFE0F', '\u200D', '\u20E3', '\u2500', '\u3000', '\u2190', 'a', '1', '\u{1F3AE}\u{1F3AE}'];
  signs.push('\u{1F1EC}', '\u{1F3FB}');
  for (const sign of signs) assert.equal(button(sign), false, `U+${sign.codePointAt(0)?.toString(16)} is refused`);
});

test('message law: names escaped where Discord reads markdown, kept as typed where it does not', () => {
  const vars = {
    user: '<@1>',
    name: 'dark_elf*',
    server: 'Harbour (EU)',
    avatar: 'https://cdn.discordapp.com/a_b.png',
  };
  const saved = {
    content: '{user} is {name}',
    embeds: [
      blankEmbed({
        authorName: '{name}',
        title: '{server}',
        fields: [{ name: '{name}', value: '{server}', inline: false }],
        footer: '{name}',
        thumbnail: '{avatar}',
      }),
    ],
  };
  const payload = messagePayload(saved, vars, 0);
  const [first] = payload.embeds;
  assert.equal(payload.content, '<@1> is dark\\_elf\\*');
  assert.equal(first?.title, 'Harbour \\(EU\\)');
  assert.deepEqual(first?.fields, [{ name: 'dark\\_elf\\*', value: 'Harbour \\(EU\\)', inline: false }]);
  assert.equal(first?.author?.name, 'dark_elf*');
  assert.equal(first?.footer?.text, 'dark_elf*');
  assert.equal(first?.thumbnail?.url, vars.avatar);
  assert.equal(escapeText('a_b'), 'a\\_b');
});

test("message law: avatar and icon addresses, Discord's default avatar when a member has none, nothing for a bad id", () => {
  const id = '900000000000000012';
  assert.equal(avatarUrl({ id, avatar: 'abc' }), `https://cdn.discordapp.com/avatars/${id}/abc.png?size=256`);
  assert.equal(avatarUrl({ id }), `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(id) >> 22n) % 6n)}.png`);
  assert.equal(avatarUrl({ id, discriminator: '0007' }), 'https://cdn.discordapp.com/embed/avatars/2.png');
  assert.equal(avatarUrl({ id: '../x' }), '');
  assert.equal(avatarUrl(null), '');
  assert.equal(serverIconUrl(id, 'ic'), `https://cdn.discordapp.com/icons/${id}/ic.png?size=256`);
  assert.equal(serverIconUrl(id, null), '');
  assert.equal(serverIconUrl('x', 'ic'), '');
});

test('message law: a message setting can start as a card, and one that cannot be read back takes that default', () => {
  const field = messageField('Birthday', { content: 'Hi {user}', embeds: [{ color: '#d9a33c', description: 'Hi' }] });
  assert.deepEqual(field.default.embeds, [blankEmbed({ color: '#d9a33c', description: 'Hi' })]);
  assert.notEqual(blankEmbed().fields, blankEmbed().fields, 'each embed has its own list');
  const schema: Schema = { welcome: field };
  for (const broken of ['Welcome {user}', null, 7, [], [words('x')]]) {
    assert.deepEqual(salvage(schema, { welcome: broken }).welcome, field.default, `${JSON.stringify(broken)}`);
    assert.equal(validate(schema, { welcome: broken }).ok, false, 'and a save of it is refused');
  }
  const read = salvage(schema, { welcome: null }).welcome as { embeds: Array<{ description: string }> };
  const [first] = read.embeds;
  if (first) first.description = 'changed';
  assert.equal(field.default.embeds[0]?.description, 'Hi', 'the default handed back is a copy');
  assert.deepEqual(salvage(schema, {}).welcome, field.default);
});

test('message law: filled names past 6000 cut descriptions, then fields, then embeds, never leaving an empty one', () => {
  const name = '_'.repeat(32);
  const fieldsOnly = {
    content: '',
    embeds: [
      embed({
        title: 'A',
        fields: Array.from({ length: 25 }, () => ({ name: 'F', value: '{name}'.repeat(30), inline: true })),
      }),
      embed({ fields: [{ name: 'Only', value: '{name}', inline: false }] }),
    ],
  };
  assert.ok(messageSize(fieldsOnly) <= LIMITS.total, 'the save was within 6000');
  const payload = messagePayload(fieldsOnly, { name }, 0);
  assert.ok(sent(payload) <= LIMITS.total, `held to 6000, was ${sent(payload)}`);
  assert.equal(payload.embeds.length, 1, 'the second, left with no parts, is not sent');
  const kept = payload.embeds[0]?.fields?.length ?? 0;
  assert.ok(kept < 25 && kept > 0, 'the last fields went');
  const footers = {
    content: '',
    embeds: Array.from({ length: 10 }, (_entry, i) => embed({ title: `E${i}`, footer: '{name}'.repeat(340) })),
  };
  const two = messagePayload(footers, { name: 'x'.repeat(6) }, 0);
  assert.deepEqual(
    two.embeds.map((part) => part.title),
    ['E0', 'E1'],
    'two 2042-character embeds fit',
  );
  const long = embed({ description: '{name}'.repeat(600) });
  const mixed = {
    content: '',
    embeds: [
      embed({ title: 'T', description: 'd'.repeat(100), fields: [{ name: 'N', value: 'v', inline: true }] }),
      long,
      long,
    ],
  };
  const cut = messagePayload(mixed, { name: '*'.repeat(8) }, 0);
  assert.equal(sent(cut), LIMITS.total, 'cut exactly to the bound');
  assert.deepEqual(cut.embeds[0]?.fields, [{ name: 'N', value: 'v', inline: true }], 'a description goes first');
  assert.deepEqual(
    cut.embeds.map((part) => part.description?.length),
    [100, 4000, 6000 - 103 - 4000],
  );
});

test("message law: the panel's total and the bot's trim count by one rule", () => {
  const saved = {
    content: 'not counted',
    embeds: [
      embed({
        title: 'T',
        description: 'D',
        authorName: 'A',
        footer: 'F',
        fields: [{ name: 'N', value: 'V', inline: true }],
      }),
      embed({ title: 'x'.repeat(256) }),
    ],
  };
  assert.equal(messageSize(saved), sent(messagePayload(saved, {}, 0)));
  assert.equal(messageSize(saved), 6 + 256);
  assert.equal(messageSize({ embeds: [{ fields: [{}], title: 5 }] }), 1, 'a damaged part counts as its text');
});

test('message law: link buttons go in rows of five, each with an https link and words or an emoji', () => {
  const buttons = [
    { label: 'Play {name}', emoji: '', url: 'https://noshores.online/' },
    { label: '', emoji: '<:sail:900000000000000077>', url: '{avatar}' },
    { label: 'No link', emoji: '', url: '' },
    { label: '', emoji: '', url: 'https://x.example/' },
    { label: 'Plain http', emoji: '🎮', url: 'http://x.example/' },
    ...Array.from({ length: 6 }, (_entry, i) => ({ label: `B${i}`, emoji: '🎮', url: 'https://x.example/' })),
  ];
  const vars = { name: 'Ann_', avatar: 'https://cdn.discordapp.com/a.png' };
  const payload = messagePayload({ content: 'Hi', embeds: [], buttons }, vars, 0);
  assert.equal(payload.components?.length, 2);
  assert.deepEqual(payload.components?.[0]?.components.slice(0, 2), [
    { type: 2, style: 5, url: 'https://noshores.online/', label: 'Play Ann_' },
    { type: 2, style: 5, url: vars.avatar, emoji: { id: '900000000000000077', name: 'sail', animated: false } },
  ]);
  assert.deepEqual(
    payload.components?.map((row) => row.components.length),
    [5, 3],
  );
  assert.equal(payloadEmpty(messagePayload({ content: '', embeds: [], buttons: buttons.slice(0, 1) })), false);
  assert.equal('components' in messagePayload({ content: 'x', embeds: [], buttons: [] }), false);
  assert.deepEqual(asEdit({ embeds: [] }), { content: '', components: [], embeds: [] }, 'an edit clears the rest');
  assert.deepEqual(emojiOf('<a:spin:900000000000000078>'), { id: '900000000000000078', name: 'spin', animated: true });
  assert.equal(emojiOf('  '), null);
});

test('message law: the placeholders a message names are found in its words, embeds and buttons', () => {
  const saved = {
    content: 'Hi {user}',
    embeds: [embed({ image: '{welcome_card}', fields: [{ name: '{level}', value: 'x', inline: true }] })],
    buttons: [{ label: '{name}', emoji: '', url: 'https://x' }],
  };
  assert.deepEqual([...slotsUsed(saved)].sort(), ['level', 'name', 'user', 'welcome_card']);
  assert.equal(slotsUsed(words('plain')).size, 0);
});

const LINKS: Schema = { message: messageField('Message', { vars: [...LINK_SLOTS] }) };
const FULL = {
  content: 'Hello {user}',
  embeds: [
    blankEmbed({
      color: '#336699',
      authorName: '{name}',
      authorUrl: 'https://noshores.online/',
      authorIcon: '{avatar}',
      title: 'Title',
      url: 'https://noshores.online/play/',
      description: 'Words',
      thumbnail: '{avatar}',
      image: '{welcome_card}',
      fields: [
        { name: 'A', value: 'B', inline: true },
        { name: 'C', value: 'D', inline: false },
      ],
      footer: 'Foot',
      footerIcon: '{server_icon}',
      timestamp: true,
    }),
    blankEmbed({ description: 'Second' }),
  ],
  buttons: [
    { label: 'Play', emoji: '<:sail:900000000000000077>', url: 'https://noshores.online/' },
    { label: '', emoji: '🎮', url: 'https://x.example/' },
  ],
};

test('message JSON: out and back in, a message is the same, placeholders and all', () => {
  const out = messageToJson(FULL, Date.UTC(2026, 10, 15)) as {
    embeds: Array<Record<string, unknown>>;
    components: Array<{ components: unknown[] }>;
  };
  assert.equal(out.embeds[0]?.color, 0x336699);
  assert.equal(out.embeds[0]?.timestamp, '2026-11-15T00:00:00.000Z');
  assert.deepEqual(out.embeds[0]?.image, { url: '{welcome_card}' });
  assert.deepEqual(out.components[0]?.components[0], {
    type: 2,
    style: 5,
    label: 'Play',
    url: 'https://noshores.online/',
    emoji: { id: '900000000000000077', name: 'sail', animated: false },
  });
  assert.equal('author' in (out.embeds[1] ?? {}), false, 'an empty part is left out');
  const back = messageFromJson(JSON.stringify(out));
  assert.deepEqual(back?.left, []);
  assert.deepEqual(back?.message, FULL);
  assert.equal(validate(LINKS, { message: back?.message }).ok, true);
});

test("message JSON: another tool's backup, a list of embeds and one embed are each read; what cannot be held is named", () => {
  const backup = {
    version: 'd2',
    messages: [
      {
        data: {
          content: 'From a backup',
          embeds: [{ title: 'T', color: 5814783, fields: [{ name: 'n', value: 'v' }] }],
          attachments: [{ id: 1 }],
        },
      },
    ],
  };
  const read = messageFromJson(JSON.stringify(backup));
  const first = read?.message.embeds[0] as { color: string; fields: Array<{ inline: boolean }> } | undefined;
  assert.equal(read?.message.content, 'From a backup');
  assert.equal(first?.color, '#58b9ff');
  assert.equal(first?.fields[0]?.inline, false, "Discord's own default for a field is not beside");
  assert.deepEqual(read?.left, ['attached files']);
  assert.equal(messageFromJson(JSON.stringify([{ title: 'One' }, { title: 'Two' }]))?.message.embeds.length, 2);
  const alone = messageFromJson(JSON.stringify({ title: 'Alone', description: 'x' }));
  assert.equal(alone?.message.embeds[0]?.title, 'Alone');
  const many = {
    content: '',
    embeds: Array.from({ length: 12 }, () => ({ title: 'x' })),
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 1, custom_id: 'a', label: 'Press' },
          { type: 3, custom_id: 'pick' },
        ],
      },
    ],
  };
  assert.deepEqual(messageFromJson(JSON.stringify(many))?.left, [
    '2 embeds past ten',
    '2 parts that are not link buttons',
  ]);
  for (const bad of ['not json', '"words"', '7', 'null', '{"other":1}']) assert.equal(messageFromJson(bad), null, bad);
});

test('message JSON: what comes in is held to the settings as any saved message is', () => {
  const read = messageFromJson(
    JSON.stringify({
      content: 'x'.repeat(3000),
      embeds: [{ title: 't'.repeat(400), image: { url: 'http://plain.example/a.png' } }],
    }),
  );
  const held = salvage(LINKS, { message: read?.message }).message as {
    content: string;
    embeds: Array<{ title: string; image: string }>;
  };
  assert.equal(held.content.length, 2000);
  assert.equal(held.embeds[0]?.title.length, 256);
  assert.equal(held.embeds[0]?.image, '', 'a link that is not https is not kept');
});
