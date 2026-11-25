import assert from 'node:assert/strict';
import { test } from 'node:test';
import { messagePayload } from '../../../server/bot/law/message.ts';
import { type BotModule, moduleOf } from '../../../server/bot/law/modules.ts';
import {
  type GroupField,
  type ListField,
  type MessageField,
  defaults,
  validate,
} from '../../../server/bot/law/settings.ts';
import type { FormContext } from './context.ts';
import { FakeElement, boxFor, buttonsNamed, fake, selectNamed, settle, withDocument } from './domForTests.ts';
import { bindForm } from './form.ts';
import type { PanelApi } from './panelApi.ts';
import { picturesSection, sizeWords } from './pictures.ts';
import { markdownInto, previewNode, stampWords } from './preview.ts';
import { templatesFor } from './templates.ts';

const CONTEXT: FormContext = {
  channels: [
    { id: '900000000000000050', name: 'Text', type: 4, parentId: null, position: 0 },
    { id: '900000000000000030', name: 'general', type: 0, parentId: '900000000000000050', position: 1 },
  ],
  roles: [{ id: '900000000000000020', name: 'Moderators', color: 0, position: 2, managed: false }],
  emojis: [{ id: '900000000000000077', name: 'bell', animated: false }],
  disabled: false,
  preview: { guildName: 'Saltmere', memberCount: 1287, me: { name: 'Mara', avatar: '' } },
};
const shapeOf = (id: string): BotModule => moduleOf(id) ?? assert.fail(`no module ${id}`);
const WELCOME = shapeOf('welcome');
const ANNOUNCE_MESSAGE = ((shapeOf('announce').schema.messages as ListField).of as GroupField).fields
  .message as MessageField;
const JOIN = WELCOME.schema.joinMessage as MessageField;
type Join = { content: string; embeds: Array<Record<string, unknown>>; buttons: unknown[] };
const joinOf = (form: ReturnType<typeof bindForm>): Join => form.read().joinMessage as Join;

/** The nodes of `text` as Discord's markdown, in a fresh box. */
function drawn(text: string, options?: { blocks?: boolean }): FakeElement {
  const box = new FakeElement('div');
  markdownInto(box as unknown as HTMLElement, text, CONTEXT, options);
  return box;
}
const tags = (box: FakeElement): string[] =>
  [...box.walk()].map((node) => node.tagName).filter((tag) => tag !== '#TEXT');
const texts = (box: FakeElement, className: string): string[] =>
  box.querySelectorAll(`.${className}`).map((node) => node.textContent);
const statusOf = (root: FakeElement): string => root.find((node) => node.attrs.role === 'status')?.textContent ?? '';

test('preview markdown: headings, subtext, quotes, nested lists and code blocks, as Discord lays them out', () =>
  withDocument(() => {
    const box = drawn(
      '# Big\n## Middle\n### Small\n-# fine print\n> quoted **bold**\n> second\nplain\n- one\n  - inner\n- two\n3. three\n```js\nconst x = 1;\n```\nafter',
    );
    assert.deepEqual(texts(box, 'dmd-h1'), ['Big']);
    assert.deepEqual(texts(box, 'dmd-h2'), ['Middle']);
    assert.deepEqual(texts(box, 'dmd-h3'), ['Small']);
    assert.deepEqual(texts(box, 'dmd-sub'), ['fine print']);
    const [quote] = box.querySelectorAll('.dmd-quote');
    assert.equal(quote?.textContent, 'quoted boldsecond');
    assert.ok(quote?.find((node) => node.tagName === 'STRONG'));
    const lists = box.findAll((node) => node.tagName === 'UL' || node.tagName === 'OL');
    assert.deepEqual(
      lists.map((node) => node.tagName),
      ['UL', 'UL', 'OL'],
      'the inner list sits in its item; a numbered run starts its own',
    );
    assert.equal(lists[2]?.attrs.start, '3');
    assert.equal(box.find((node) => node.tagName === 'PRE')?.textContent, 'const x = 1;');
    assert.ok(texts(box, 'dmd-p').includes('after'));
    const rest = drawn('>>> all\nof this\n> is quoted');
    assert.deepEqual(texts(rest, 'dmd-quote'), ['allof this> is quoted'], 'a quote holds no quote');
    assert.deepEqual(tags(drawn('# not a heading', { blocks: false })), [], 'a title reads inline marks alone');
  }));

test('preview markdown: inline marks, spoilers, links only when https, mentions, server emoji, live times and escapes', () =>
  withDocument(() => {
    const box = drawn(
      '**b** __u__ ~~s~~ *i* _e_ `c` ||secret|| [site](https://a.example) [bad](http://b.example) <https://c.example> https://d.example/x. <@0> <@&900000000000000020> <#900000000000000030> <:bell:900000000000000077> @everyone \\*not\\* snake_case_name',
    );
    assert.deepEqual(
      tags(box)
        .filter((tag) => tag !== 'DIV')
        .slice(0, 6),
      ['STRONG', 'U', 'S', 'EM', 'EM', 'CODE'],
    );
    const [spoiler] = box.querySelectorAll('.dspoiler');
    assert.equal(spoiler?.classList.contains('shown'), false);
    spoiler?.click();
    assert.equal(spoiler?.classList.contains('shown'), true, 'a spoiler shows when pressed');
    assert.deepEqual(
      box.findAll((node) => node.tagName === 'A').map((node) => node.attrs.href),
      ['https://a.example', 'https://c.example', 'https://d.example/x'],
    );
    assert.ok(box.textContent.includes('bad'), 'an http link keeps its words, with no link');
    assert.deepEqual(texts(box, 'dmention'), ['@Mara', '@Moderators', '#general', '@everyone']);
    const [emoji] = box.querySelectorAll('.demoji');
    assert.equal(emoji?.attrs.src, 'https://cdn.discordapp.com/emojis/900000000000000077.webp?size=48');
    assert.equal(emoji?.attrs.referrerpolicy, 'no-referrer');
    assert.ok(
      box.textContent.includes('*not*') && box.textContent.includes('snake_case_name'),
      'escapes stay as typed',
    );
    const now = Date.UTC(2026, 10, 15, 12);
    assert.equal(stampWords(now / 1000 + 7200, 'R', now), 'in 2 hours');
    assert.equal(stampWords(now / 1000 - 86400 * 3, 'R', now), '3 days ago');
    assert.equal(drawn('<t:1763208000:D>').querySelectorAll('.dts').length, 1);
  }));

test('preview: link buttons drawn in their rows, under the embeds, and the bot signs as itself', () =>
  withDocument(() => {
    const buttons = Array.from({ length: 6 }, (_unused, i) => ({
      label: `B${i}`,
      emoji: i ? '' : '<:bell:900000000000000077>',
      url: 'https://noshores.online/',
    }));
    const node = fake(previewNode(messagePayload({ content: 'Hi', embeds: [], buttons }), CONTEXT));
    assert.deepEqual(
      node.querySelectorAll('.dbutton-row').map((row) => row.querySelectorAll('.dbutton').length),
      [5, 1],
    );
    const [first] = node.querySelectorAll('.dbutton');
    assert.equal(first?.attrs.href, 'https://noshores.online/');
    assert.equal(first?.attrs.rel, 'noopener noreferrer');
    assert.deepEqual(texts(node, 'dmsg-name'), ['No Shores bot']);
    assert.match(texts(node, 'dmsg-time')[0] ?? '', /^Today at /);
    assert.doesNotMatch(node.textContent, /DFO/);
  }));

test('the pickers put a mention, a server emoji and a live time where the person was typing', () =>
  withDocument(() => {
    const form = bindForm(WELCOME.schema, defaults(WELCOME.schema), CONTEXT);
    const root = fake(form.element);
    const words = boxFor(root, 'Message');
    words?.type('');
    words?.focus();
    selectNamed(root, 'Mention a channel')?.choose('900000000000000030');
    selectNamed(root, 'Mention a role')?.choose('900000000000000020');
    selectNamed(root, 'Server emoji')?.choose('<:bell:900000000000000077>');
    const when = root.find((node) => node.tagName === 'INPUT' && node.attrs.type === 'datetime-local');
    assert.ok(when);
    when.value = '2026-11-20T18:00';
    selectNamed(root, 'Time style')?.choose('F');
    buttonsNamed(root, 'Insert time')[0]?.click();
    const unix = Math.floor(new Date('2026-11-20T18:00').getTime() / 1000);
    assert.equal(
      joinOf(form).content,
      `<#900000000000000030><@&900000000000000020><:bell:900000000000000077><t:${unix}:F>`,
    );
    assert.equal(selectNamed(root, 'Mention a channel')?.value, '', 'a picker goes back to its prompt');
    const channelWords = selectNamed(root, 'Mention a channel')?.children.map((option) => option.textContent);
    assert.ok(!channelWords?.includes('#Text'), 'a category is no channel to mention');
  }));

test('undo and redo walk back typing a burst at a time, and every add, move and remove', () =>
  withDocument(() => {
    const empty = { ...defaults(WELCOME.schema), joinMessage: { content: '', embeds: [], buttons: [] } };
    const form = bindForm(WELCOME.schema, empty, CONTEXT);
    const root = fake(form.element);
    const undo = (): void => buttonsNamed(root, 'Undo')[0]?.click();
    const redo = (): void => buttonsNamed(root, 'Redo')[0]?.click();
    assert.equal(buttonsNamed(root, 'Undo')[0]?.disabled, true);
    boxFor(root, 'Message')?.type('H');
    boxFor(root, 'Message')?.type('Hi');
    buttonsNamed(root, 'Add embed')[0]?.click();
    buttonsNamed(root, 'Add button')[0]?.click();
    assert.equal(joinOf(form).buttons.length, 1);
    undo();
    assert.equal(joinOf(form).buttons.length, 0);
    undo();
    assert.equal(joinOf(form).embeds.length, 0);
    undo();
    assert.equal(joinOf(form).content, '', 'one burst of typing is one step');
    assert.equal(buttonsNamed(root, 'Undo')[0]?.disabled, true);
    redo();
    redo();
    assert.equal(joinOf(form).content, 'Hi');
    assert.equal(joinOf(form).embeds.length, 1);
    assert.equal(boxFor(root, 'Message')?.value, 'Hi', 'the boxes are drawn again from the message');
    boxFor(root, 'Message')?.type('Hi!');
    assert.equal(buttonsNamed(root, 'Redo')[0]?.disabled, true, 'a new change ends the steps forward');
  }));

test('a template the setting can fill replaces the message, and undo brings back what was there', () =>
  withDocument(() => {
    const ids = templatesFor(ANNOUNCE_MESSAGE.vars).map((template) => template.id);
    assert.deepEqual(ids, ['rules', 'patch', 'event'], 'an announcement has no member to name');
    const forWelcome = templatesFor(JOIN.vars);
    assert.ok(forWelcome.some((template) => template.id === 'welcome-card'));
    for (const template of forWelcome) {
      const settings = { ...defaults(WELCOME.schema), joinMessage: template.message };
      assert.equal(validate(WELCOME.schema, settings).ok, true, template.id);
    }
    const form = bindForm(WELCOME.schema, defaults(WELCOME.schema), CONTEXT);
    const root = fake(form.element);
    const before = joinOf(form);
    selectNamed(root, 'Start from a template')?.choose('rules');
    assert.equal(joinOf(form).embeds[0]?.title, 'The rules of {server}');
    assert.match(statusOf(root), /Undo/);
    buttonsNamed(root, 'Undo')[0]?.click();
    assert.deepEqual(joinOf(form), before);
  }));

test('Discord JSON is copied out with its placeholders, and brought in held to the settings', () =>
  withDocument(() => {
    const form = bindForm(WELCOME.schema, defaults(WELCOME.schema), CONTEXT);
    const root = fake(form.element);
    const json = root.find((node) => node.tagName === 'TEXTAREA' && node.attrs.spellcheck === 'false');
    assert.ok(json);
    buttonsNamed(root, 'Copy out')[0]?.click();
    assert.equal(JSON.parse(json.value).content, 'Welcome {user} to {server}! You are member {count}.');
    const pasted = {
      content: 'x'.repeat(2500),
      embeds: [{ title: 'From Discohook', image: { url: 'http://no.example/a.png' } }],
      components: [{ type: 1, components: [{ type: 2, style: 1, custom_id: 'a', label: 'Press' }] }],
    };
    json.value = JSON.stringify({ messages: [{ data: pasted }] });
    buttonsNamed(root, 'Bring in')[0]?.click();
    const read = joinOf(form);
    assert.equal(read.content.length, 2000);
    assert.equal(read.embeds[0]?.title, 'From Discohook');
    assert.equal(read.embeds[0]?.image, '');
    assert.match(statusOf(root), /Left out: /);
    json.value = 'nonsense';
    buttonsNamed(root, 'Bring in')[0]?.click();
    assert.match(statusOf(root), /not a message/);
    assert.equal(joinOf(form).embeds[0]?.title, 'From Discohook', 'a bad paste changes nothing');
  }));

test("a test goes through the page's tools with the message as drawn; an upload fills the picture's link", () =>
  withDocument(async () => {
    const sent: Array<{ message: unknown; to: string }> = [];
    const tools = {
      sendTest: async (message: unknown, to: string) => {
        sent.push({ message, to });
        return { ok: true, message: 'A test was sent to you.' };
      },
      upload: async (file: Blob) =>
        file.size > 10
          ? { ok: true, url: 'https://bot.example/v1/media/abc.png' }
          : { ok: false, message: 'Too small.' },
    };
    const form = bindForm(WELCOME.schema, defaults(WELCOME.schema), { ...CONTEXT, tools });
    const root = fake(form.element);
    selectNamed(root, 'Where the test goes')?.choose('900000000000000030');
    buttonsNamed(root, 'Send a test')[0]?.click();
    await settle();
    assert.deepEqual(sent, [{ message: joinOf(form), to: '900000000000000030' }]);
    assert.equal(statusOf(root), 'A test was sent to you.');
    buttonsNamed(root, 'Add embed')[0]?.click();
    const file = root.find((node) => node.tagName === 'INPUT' && node.attrs.type === 'file');
    assert.ok(file);
    file.files = [new Blob(['x'.repeat(100)], { type: 'image/png' })];
    file.dispatchEvent({ type: 'change' });
    await settle();
    assert.equal(
      joinOf(form).embeds[0]?.authorIcon,
      'https://bot.example/v1/media/abc.png',
      'the first link is the icon',
    );
    const viewer = fake(
      bindForm(WELCOME.schema, defaults(WELCOME.schema), { ...CONTEXT, tools, disabled: true }).element,
    );
    buttonsNamed(viewer, 'Add embed')[0]?.click();
    const viewerFile = viewer.find((node) => node.tagName === 'INPUT' && node.attrs.type === 'file');
    assert.equal(viewerFile, undefined, 'a viewer uploads nothing');
  }));

test("the pictures section lists a server's pictures; a manager uploads and removes, a viewer only copies", () =>
  withDocument(async () => {
    const calls: Array<[string, string]> = [];
    let files = [{ id: 'a'.repeat(32), url: 'https://bot.example/v1/media/aaa.png', bytes: 2048, at: 1_763_200_000 }];
    const api = {
      async call(method: string, path: string) {
        calls.push([method, path]);
        if (method === 'GET')
          return { ok: true, status: 200, body: { files, filesMax: 100, bytesMax: 200 * 1024 * 1024 } };
        if (method === 'DELETE') files = [];
        const bigger = { id: 'b'.repeat(32), url: 'https://bot.example/v1/media/bbb.png', bytes: 5_000_000, at: 1 };
        if (method === 'POST') files = [...files, bigger];
        return { ok: true, status: 200, body: { message: method === 'DELETE' ? 'Removed.' : 'Uploaded.' } };
      },
    } as unknown as PanelApi;
    const section = fake(picturesSection(api, '900000000000000001', true));
    await settle();
    assert.equal(section.find((node) => node.tagName === 'IMG')?.attrs.src, 'https://bot.example/v1/media/aaa.png');
    assert.match(section.textContent, /1 of 100 pictures, 2 KB of 200\.0 MB\./);
    const file = section.find((node) => node.tagName === 'INPUT' && node.attrs.type === 'file');
    assert.ok(file);
    file.files = [new Blob(['x'], { type: 'image/png' })];
    file.dispatchEvent({ type: 'change' });
    await settle();
    assert.deepEqual(calls.find(([method]) => method === 'POST')?.[1], '/v1/panel/g/900000000000000001/media');
    assert.equal(section.findAll((node) => node.tagName === 'IMG').length, 2);
    buttonsNamed(section, 'Remove')[0]?.click();
    await settle();
    assert.match(section.textContent, /No pictures yet\./);
    files = [{ id: 'c'.repeat(32), url: 'https://bot.example/v1/media/ccc.png', bytes: 1, at: 1 }];
    const viewer = fake(picturesSection(api, '900000000000000001', false));
    await settle();
    assert.equal(buttonsNamed(viewer, 'Remove').length + buttonsNamed(viewer, 'Upload a picture').length, 0);
    assert.equal(buttonsNamed(viewer, 'Copy link').length, 1);
    assert.equal(sizeWords(5_000_000), '4.8 MB');
  }));
