import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blankEmbed } from '../../../server/bot/law/message.ts';
import { type BotModule, moduleOf } from '../../../server/bot/law/modules.ts';
import { type GroupField, type ListField, defaults, validate } from '../../../server/bot/law/settings.ts';
import type { FormContext } from './context.ts';
import { boxFor, buttonsNamed, fake, withDocument } from './domForTests.ts';
import { bindForm } from './form.ts';

export const CONTEXT: FormContext = {
  channels: [
    { id: '900000000000000050', name: 'Text', type: 4, parentId: null, position: 0 },
    { id: '900000000000000030', name: 'general', type: 0, parentId: '900000000000000050', position: 1 },
    { id: '900000000000000031', name: 'voice', type: 2, parentId: null, position: 2 },
  ],
  roles: [
    { id: '900000000000000020', name: 'Moderators', color: 0, position: 2, managed: false },
    { id: '900000000000000021', name: 'Helpers', color: 0, position: 1, managed: false },
  ],
  disabled: false,
};
const shapeOf = (id: string): BotModule => moduleOf(id) ?? assert.fail(`no module ${id}`);
const CORE = shapeOf('core');
const WELCOME = shapeOf('welcome');
const SAVED = {
  panelGrants: [
    { role: '900000000000000020', level: 'manager' },
    { role: '900000000000000021', level: 'viewer' },
  ],
  problemsChannel: '900000000000000030',
  accent: '#336699',
};
const PREVIEW: FormContext = {
  ...CONTEXT,
  preview: { guildName: 'Saltmere', memberCount: 1287, me: { name: 'harbourmaster', avatar: '' } },
};
const previewText = (root: ReturnType<typeof fake>, className: string): string[] =>
  root.querySelectorAll(`.${className}`).map((node) => node.textContent);
const errorsShown = (root: ReturnType<typeof fake>): string[] =>
  root
    .querySelectorAll('.field-error')
    .map((node) => node.textContent)
    .filter(Boolean);

test("a module's settings read back exactly as given, and pass the bot's own check", () =>
  withDocument(() => {
    const form = bindForm(CORE.schema, SAVED, CONTEXT);
    assert.deepEqual(form.read(), SAVED);
    assert.equal(validate(CORE.schema, form.read()).ok, true);
  }));

test("a channel picker offers the field's kinds under their category; a role picker every role, highest first", () =>
  withDocument(() => {
    const root = fake(bindForm(CORE.schema, SAVED, CONTEXT).element);
    const selects = root.findAll((node) => node.tagName === 'SELECT');
    const labels = (select: ReturnType<typeof fake> | undefined): string[] =>
      select?.children.map((option) => option.textContent) ?? [];
    const channel = selects.find((select) => select.value === '900000000000000030');
    assert.deepEqual(labels(channel), ['None', 'Text / #general'], 'the text channel alone, under its category');
    assert.deepEqual(labels(selects[0]), ['None', '@Moderators', '@Helpers']);
  }));

test("removing a list row renumbers the rest, so the bot's error lands on the right row", () =>
  withDocument(() => {
    const form = bindForm(CORE.schema, SAVED, CONTEXT);
    const root = fake(form.element);
    buttonsNamed(root, 'Remove')[0]?.click();
    assert.deepEqual(form.read().panelGrants, [SAVED.panelGrants[1]]);
    const left = form.mark([{ path: 'panelGrants[0].role', message: 'Must be a role or none.' }]);
    assert.deepEqual(left, [], 'the renumbered row took the error');
    assert.deepEqual(errorsShown(root), ['Must be a role or none.']);
    assert.deepEqual(
      form.mark([{ path: 'nowhere', message: 'x' }]).map((error) => error.path),
      ['nowhere'],
    );
    assert.deepEqual(errorsShown(root), [], 'marks clear');
  }));

test("a list stops at its bound; a viewer's form is read-only; a missing channel stays visible", () =>
  withDocument(() => {
    const grants = Array.from({ length: 20 }, () => ({ role: '', level: 'viewer' }));
    const many = { ...SAVED, panelGrants: grants, problemsChannel: '900000000000000099' };
    const root = fake(bindForm(CORE.schema, many, CONTEXT).element);
    assert.equal(buttonsNamed(root, 'Add')[0]?.disabled, true, 'twenty grants is the bound');
    const kept = root.find((node) => node.tagName === 'OPTION' && node.attrs.value === '900000000000000099');
    assert.equal(kept?.textContent, 'Missing (900000000000000099)', 'a saved channel that is gone still shows');
    const viewer = fake(bindForm(CORE.schema, SAVED, { ...CONTEXT, disabled: true }).element);
    const inputs = viewer.findAll((node) => ['INPUT', 'SELECT', 'BUTTON'].includes(node.tagName));
    assert.ok(inputs.length > 5 && inputs.every((node) => node.disabled));
  }));

test("a row added to a list is every one of its settings at the schema's default, as the bot would fill it", () =>
  withDocument(() => {
    const announce = shapeOf('announce');
    const form = bindForm(announce.schema, defaults(announce.schema), CONTEXT);
    buttonsNamed(fake(form.element), 'Add')[0]?.click();
    const [row] = form.read().messages as unknown[];
    const list = announce.schema.messages as ListField;
    assert.deepEqual(row, defaults((list.of as GroupField).fields));
    assert.equal(validate(announce.schema, form.read()).ok, true, 'and the bot takes it as it stands');
  }));

test("a message reads back as saved and passes the bot's check; the preview is what the bot would post", () =>
  withDocument(() => {
    const joinMessage = {
      content: 'Hi {user}, welcome to {server}!',
      embeds: [
        blankEmbed({
          title: '{name} joined',
          description: 'Member **{count}**',
          fields: [{ name: 'Rules', value: 'Be kind', inline: true }],
        }),
      ],
      buttons: [{ label: 'Play', emoji: '', url: 'https://noshores.online/' }],
    };
    const welcome = { ...defaults(WELCOME.schema), joinMessage };
    const form = bindForm(WELCOME.schema, welcome, PREVIEW);
    assert.deepEqual(form.read(), welcome);
    assert.equal(validate(WELCOME.schema, form.read()).ok, true);
    const [joinPreview] = fake(form.element).querySelectorAll('.preview');
    assert.ok(joinPreview);
    assert.deepEqual(previewText(joinPreview, 'dmsg-content'), ['Hi @harbourmaster, welcome to Saltmere!']);
    assert.deepEqual(previewText(joinPreview, 'dembed-title'), ['harbourmaster joined']);
    assert.equal(joinPreview.find((node) => node.tagName === 'STRONG')?.textContent, '1,287', 'bold drawn as bold');
    assert.deepEqual(previewText(joinPreview, 'dembed-field-name'), ['Rules']);
    assert.equal(joinPreview.querySelectorAll('.dembed')[0]?.style.borderLeftColor, '#8a5a2b');
    assert.match(joinPreview.textContent, /No Shores bot/);
  }));

test("typing redraws the preview; embeds and fields are added, moved, copied and removed to Discord's bounds", () =>
  withDocument(() => {
    const form = bindForm(WELCOME.schema, defaults(WELCOME.schema), PREVIEW);
    const root = fake(form.element);
    const titles = (): unknown =>
      (form.read().joinMessage as { embeds: Array<{ title: string }> }).embeds.map((embed) => embed.title);
    const [joinPreview] = root.querySelectorAll('.preview');
    assert.ok(joinPreview);
    boxFor(root, 'Message')?.type('Hello');
    assert.deepEqual(previewText(joinPreview, 'dmsg-content'), ['Hello']);
    buttonsNamed(root, 'Add embed')[0]?.click();
    boxFor(root, 'Title')?.type('First');
    buttonsNamed(root, 'Add field')[0]?.click();
    boxFor(root, 'Field 1 value')?.type('A value');
    const [embed] = (form.read().joinMessage as { embeds: Array<{ fields: unknown }> }).embeds;
    assert.deepEqual(embed?.fields, [{ name: '', value: 'A value', inline: true }]);
    assert.deepEqual(previewText(joinPreview, 'dembed-field-name'), ['​'], 'an empty name is sent as Discord needs it');
    buttonsNamed(root, 'Copy')[0]?.click();
    boxFor(root, 'Title', 1)?.type('Second');
    assert.deepEqual(titles(), ['First', 'Second']);
    buttonsNamed(root, 'Move up')[1]?.click();
    assert.deepEqual(titles(), ['Second', 'First']);
    assert.deepEqual(previewText(joinPreview, 'dembed-title'), ['Second', 'First']);
    buttonsNamed(root, 'Remove embed')[0]?.click();
    assert.deepEqual(titles(), ['First']);
    for (let i = 0; i < 9; i++) buttonsNamed(root, 'Add embed')[0]?.click();
    assert.equal((titles() as string[]).length, 10);
    assert.equal(buttonsNamed(root, 'Add embed')[0]?.disabled, true, "ten embeds is Discord's bound");
    assert.ok(buttonsNamed(root, 'Copy').every((copy) => copy.disabled));
    assert.equal(validate(WELCOME.schema, form.read()).ok, true);
  }));

test("a placeholder goes where the person typed; the total warns past 6000; the bot's refusal lands on its part", () =>
  withDocument(() => {
    const form = bindForm(WELCOME.schema, defaults(WELCOME.schema), PREVIEW);
    const root = fake(form.element);
    const words = boxFor(root, 'Message');
    assert.ok(words);
    words.type('Hi ');
    words.selectionStart = words.selectionEnd = 3;
    words.focus();
    buttonsNamed(root, '{name}')[0]?.click();
    assert.equal((form.read().joinMessage as { content: string }).content, 'Hi {name}');
    buttonsNamed(root, 'Add embed')[0]?.click();
    buttonsNamed(root, 'Add embed')[0]?.click();
    boxFor(root, 'Description')?.type('x'.repeat(4000));
    boxFor(root, 'Description', 1)?.type('y'.repeat(2500));
    const total = root.find((node) => node.tagName === 'P' && node.textContent.startsWith('Embeds: '));
    assert.equal(total?.textContent, 'Embeds: 6,500 of 6,000 characters.');
    assert.equal(total?.classList.contains('over'), true);
    assert.equal(validate(WELCOME.schema, form.read()).ok, false);
    boxFor(root, 'Image (large, below)')?.type('http://plain');
    const message = form.read().joinMessage as { embeds: Array<Record<string, unknown>> };
    const short = { ...message, embeds: message.embeds.map((embed) => ({ ...embed, description: '' })) };
    const refused = validate(WELCOME.schema, { ...form.read(), joinMessage: short });
    const errors = refused.ok ? [] : refused.errors;
    assert.deepEqual(
      errors.map((error) => error.path),
      ['joinMessage.embeds[0].image'],
    );
    assert.deepEqual(form.mark(errors), [], 'every refusal found its box');
    const image = boxFor(root, 'Image (large, below)');
    const holder = root.find((node) => !!image && node.children.includes(image));
    assert.match(holder?.children.find((node) => node.attrs.class === 'field-error')?.textContent ?? '', /https/);
    const viewer = fake(bindForm(WELCOME.schema, defaults(WELCOME.schema), { ...PREVIEW, disabled: true }).element);
    const changers = viewer.findAll(
      (node) =>
        ['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(node.tagName) &&
        !node.readOnly &&
        node.textContent !== 'Copy out',
    );
    assert.ok(changers.length > 20 && changers.every((node) => node.disabled), 'a viewer reads only');
  }));

test('a placeholder pressed after a redraw goes into the box now drawn for that part, and is kept', () =>
  withDocument(() => {
    const form = bindForm(WELCOME.schema, defaults(WELCOME.schema), PREVIEW);
    const root = fake(form.element);
    const description = (): unknown =>
      (form.read().joinMessage as { embeds: Array<{ description: string }> }).embeds[0]?.description;
    buttonsNamed(root, 'Add embed')[0]?.click();
    const before = boxFor(root, 'Description');
    assert.ok(before);
    before.focus();
    before.type('Hi ');
    buttonsNamed(root, 'Add field')[0]?.click();
    const now = boxFor(root, 'Description');
    assert.ok(now);
    assert.notEqual(now, before, 'the redraw made a new box');
    buttonsNamed(root, '{name}')[0]?.click();
    assert.equal(now.value, 'Hi {name}', 'the visible box shows it');
    assert.equal(description(), 'Hi {name}');
    now.type(`${now.value}!`);
    assert.equal(description(), 'Hi {name}!', 'the next keystroke keeps it');
    buttonsNamed(root, 'Remove embed')[0]?.click();
    buttonsNamed(root, '{user}')[0]?.click();
    assert.equal(
      (form.read().joinMessage as { content: string }).content,
      'Welcome {user} to {server}! You are member {count}.{user}',
      'a removed part sends it to the message',
    );
  }));
