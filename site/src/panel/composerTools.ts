// The composer's tools around a message: buttons and pickers that put a placeholder, a mention, a server emoji or a
// live time where the person was typing; starting designs; Discord's JSON in and out; and a test sent through the bot.
// Each tool only calls back into the composer, which keeps the message and its undo history.
import { messageFromJson, messageToJson } from '../../../server/bot/law/messageJson.ts';
import { type MessageField, salvage } from '../../../server/bot/law/settings.ts';
import type { FormContext } from './context.ts';
import { element } from './dom.ts';
import { templatesFor } from './templates.ts';

let toolCount = 0;

/** What a tool may ask of the composer it serves. */
export interface Composer {
  readonly ctx: FormContext;
  readonly field: MessageField;
  readonly current: () => unknown;
  readonly replace: (message: unknown) => void;
  readonly say: (words: string) => void;
}

/** The styles a live time can be shown in, as Discord names them. */
export const TIME_STYLES: ReadonlyArray<readonly [string, string]> = Object.freeze([
  ['R', 'Relative (in 2 hours)'],
  ['f', 'Date and time'],
  ['F', 'Day, date and time'],
  ['D', 'Date'],
  ['d', 'Short date'],
  ['t', 'Time'],
  ['T', 'Time with seconds'],
]);

const small = (label: string, attributes: Record<string, string> = {}): HTMLButtonElement =>
  element('button', { type: 'button', class: 'button button-small', ...attributes }, [label]);

/** A drop-down that does one thing on a choice and goes back to its prompt. */
function chooser(
  prompt: string,
  options: ReadonlyArray<readonly [string, string]>,
  act: (value: string) => void,
  off: boolean,
): HTMLSelectElement {
  const select = element('select', { 'aria-label': prompt });
  select.append(
    element('option', { value: '' }, [prompt]),
    ...options.map(([value, words]) => element('option', { value }, [words])),
  );
  select.disabled = off;
  select.addEventListener('change', () => {
    const value = select.value;
    select.value = '';
    if (value) act(value);
  });
  return select;
}

/** The insert row: placeholder buttons, then mention, emoji and time pickers. */
export function insertTools(ctx: FormContext, vars: readonly string[], insert: (text: string) => void): HTMLElement {
  const off = ctx.disabled;
  const chips = vars.map((name) => {
    const chip = small(`{${name}}`, { title: `Put {${name}} where you were typing` });
    chip.disabled = off;
    // pressing a chip must not take the focus from the box being typed in
    chip.addEventListener('mousedown', (event) => event.preventDefault());
    chip.addEventListener('click', () => insert(`{${name}}`));
    return chip;
  });
  const channels = ctx.channels
    .filter((channel) => channel.type !== 4)
    .map((channel): [string, string] => [channel.id, `#${channel.name}`]);
  const roles = ctx.roles.map((role): [string, string] => [role.id, `@${role.name}`]);
  const emojis = (ctx.emojis ?? []).map((emoji): [string, string] => [
    `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`,
    `:${emoji.name}:`,
  ]);
  const id = `t${++toolCount}`;
  const when = element('input', { id: `${id}-when`, type: 'datetime-local' });
  when.disabled = off;
  const style = element('select', { 'aria-label': 'Time style' });
  style.append(...TIME_STYLES.map(([value, words]) => element('option', { value }, [words])));
  style.disabled = off;
  const putTime = small('Insert time');
  putTime.disabled = off;
  putTime.addEventListener('click', () => {
    const moment = new Date(when.value).getTime();
    if (Number.isFinite(moment)) insert(`<t:${Math.floor(moment / 1000)}:${style.value || 'R'}>`);
  });
  const slots = chips.length
    ? [
        element('div', { class: 'composer-slots' }, [
          element('span', { class: 'field-help' }, ['Placeholders: ']),
          ...chips,
        ]),
      ]
    : [];
  return element('div', { class: 'composer-insert' }, [
    ...slots,
    element('div', { class: 'composer-pickers' }, [
      ...(channels.length ? [chooser('Mention a channel', channels, (value) => insert(`<#${value}>`), off)] : []),
      ...(roles.length ? [chooser('Mention a role', roles, (value) => insert(`<@&${value}>`), off)] : []),
      ...(emojis.length ? [chooser('Server emoji', emojis, insert, off)] : []),
      element('span', { class: 'composer-time' }, [
        element('label', { for: `${id}-when`, class: 'field-help' }, ['Live time']),
        when,
        style,
        putTime,
      ]),
    ]),
  ]);
}

/** The message row: starting designs and a test sent through the bot. */
export function messageTools({ ctx, field, current, replace, say }: Composer): HTMLElement {
  const off = ctx.disabled;
  const templates = templatesFor(field.vars);
  const start = chooser(
    'Start from a template',
    templates.map((template): [string, string] => [template.id, template.label]),
    (value) => {
      const chosen = templates.find((template) => template.id === value);
      if (!chosen) return;
      replace(structuredClone(chosen.message));
      say(`${chosen.label}: put in. Undo brings back what was there.`);
    },
    off,
  );
  const tools: HTMLElement[] = [start];
  const sendTest = ctx.tools?.sendTest;
  if (sendTest) {
    const places: Array<[string, string]> = [
      ['me', 'To me, by direct message'],
      ...ctx.channels
        .filter((channel) => channel.type === 0 || channel.type === 5)
        .map((channel): [string, string] => [channel.id, `In #${channel.name}`]),
    ];
    const target = element('select', { 'aria-label': 'Where the test goes' });
    target.append(...places.map(([value, words]) => element('option', { value }, [words])));
    target.disabled = off;
    const send = small('Send a test');
    send.disabled = off;
    send.addEventListener('click', async () => {
      send.disabled = true;
      say('Sending a test...');
      const answer = await sendTest(current(), target.value || 'me').catch(() => ({
        ok: false,
        message: 'The bot could not be reached.',
      }));
      say(answer.message);
      send.disabled = off;
    });
    tools.push(element('span', { class: 'composer-test' }, [target, send]));
  }
  return element('div', { class: 'composer-tools' }, tools);
}

/**
 * Discord's JSON for the message: copied out with its placeholders, or brought in from Discohook or Discord and held
 * to the settings, as one step the person can undo.
 */
export function jsonTools({ ctx, field, current, replace, say }: Composer): HTMLElement {
  const id = `t${++toolCount}-json`;
  const text = element('textarea', { id, rows: '6', spellcheck: 'false' });
  const inBox = 'The words are in the box: copy them from there.';
  const out = small('Copy out');
  out.addEventListener('click', () => {
    text.value = JSON.stringify(messageToJson(current()), null, 2);
    const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (!clip) say(inBox);
    clip?.writeText(text.value).then(
      () => say('Copied. The words are in the box too.'),
      () => say(inBox),
    );
  });
  const into = small('Bring in');
  into.disabled = ctx.disabled;
  // a viewer may copy a design out, but bring none in
  text.readOnly = ctx.disabled;
  into.addEventListener('click', () => {
    const read = messageFromJson(text.value);
    if (!read) {
      say('That is not a message Discord takes. Paste JSON from Discohook or a Discord message.');
      return;
    }
    replace(salvage({ message: field }, { message: read.message }).message);
    say(
      read.left.length
        ? `Brought in. Left out: ${read.left.join(', ')}.`
        : 'Brought in. Undo brings back what was there.',
    );
  });
  return element('details', { class: 'composer-json' }, [
    element('summary', {}, ['Discord JSON (Discohook)']),
    element('label', { for: id, class: 'field-help' }, ['Paste a message to bring it in, or copy this one out.']),
    text,
    element('div', { class: 'acts' }, [out, into]),
  ]);
}
