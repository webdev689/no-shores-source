// A message setting drawn as a composer: its words, up to ten embeds with every part Discord offers and its link
// buttons, and beside them a live preview built by the same law the bot posts with, each placeholder filled with a
// sample, so what is drawn is what is sent. Every change can be undone, typing a pause at a time.
import { EMBED_SCHEMA, LIMITS, messagePayload, messageSize } from '../../../server/bot/law/message.ts';
import { type MessageField, defaults, recordOf } from '../../../server/bot/law/settings.ts';
import { type Composer, insertTools, jsonTools, messageTools } from './composerTools.ts';
import type { Bound, FormContext } from './context.ts';
import { element } from './dom.ts';
import { previewNode, previewVars } from './preview.ts';

/** How many steps back the composer keeps. */
export const HISTORY_MAX = 100;
/** A pause in typing this long starts a new step to undo. */
export const TYPING_PAUSE_MS = 800;
/** The link settings a picture can be uploaded for. */
const PICTURE_KEYS = new Set(['authorIcon', 'thumbnail', 'image', 'footerIcon']);
/** The picture kinds the bot keeps. */
const PICTURE_TYPES = 'image/png,image/jpeg,image/gif,image/webp';

type Part = Record<string, unknown>;
type Embed = Part & { fields: Part[] };
type Model = Part & {
  content: string;
  embeds: Embed[];
  buttons: Part[];
};
interface TextOptions {
  readonly max: number;
  readonly multiline?: boolean;
  readonly placeholder?: string;
}

let composerCount = 0;
let checkCount = 0;

const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** A saved message in the composer's own shape: every embed with every part, every button with its three. */
function modelOf(value: unknown): Model {
  const saved = recordOf(value);
  const blank = defaults(EMBED_SCHEMA);
  return {
    content: String(saved.content ?? ''),
    embeds: listOf(saved.embeds).map((embed) => ({
      ...structuredClone(blank),
      ...recordOf(embed),
      fields: listOf(recordOf(embed).fields).map((field) => ({
        name: '',
        value: '',
        inline: true,
        ...recordOf(field),
      })),
    })),
    buttons: listOf(saved.buttons).map((link) => ({ label: '', emoji: '', url: '', ...recordOf(link) })),
  };
}

/** Move an item of a list by one, or not at all at its end. */
function move(list: unknown[], from: number, step: number): void {
  const to = from + step;
  if (to < 0 || to >= list.length) return;
  [list[from], list[to]] = [list[to], list[from]];
}

/** Draw a message setting as a composer with its live preview. */
export function bindMessage(field: MessageField, value: unknown, context: FormContext, path: string): Bound {
  const composerId = `m${++composerCount}`;
  const model = modelOf(value);
  /** Each input's note for the bot's refusals, by the path the bot names. */
  const notes = new Map<string, HTMLElement>();
  const opened = new WeakSet<object>(model.embeds.slice(0, 1));
  /** The model part the person last typed in: a redraw makes new boxes, so the part is kept, not its box. */
  let lastSpot: { owner: Part; key: string } | null = null;
  /** This drawing's box for each model part, by its owner and key. */
  let boxes = new Map<Part, Map<string, HTMLInputElement | HTMLTextAreaElement>>();
  /** Steps back and forward, each the whole message as it was. */
  const past: string[] = [];
  const future: string[] = [];
  /** The part last typed in and when, so one burst of typing is one step. */
  let typing: { owner: Part | null; key: string; at: number } = { owner: null, key: '', at: 0 };
  const note = element('p', { class: 'field-error', role: 'alert' });
  const toolNote = element('p', { class: 'field-help', role: 'status' });
  const previewBox = element('div', { class: 'preview', 'aria-label': `${field.label}: preview` });
  const total = element('p', { class: 'field-help' });
  const editor = element('div', { class: 'composer-editor' });
  const say = (words: string): void => {
    toolNote.textContent = words;
  };

  const redrawPreview = (): void => {
    previewBox.replaceChildren(previewNode(messagePayload(model, previewVars(context)), context));
    const size = messageSize(model);
    total.textContent = `Embeds: ${size.toLocaleString('en')} of ${LIMITS.total.toLocaleString('en')} characters.`;
    total.classList.toggle('over', size > LIMITS.total);
  };

  const current = (): Model =>
    structuredClone({ content: model.content, embeds: model.embeds, buttons: model.buttons });
  const undoButton = element('button', { type: 'button', class: 'button button-small' }, ['Undo']);
  const redoButton = element('button', { type: 'button', class: 'button button-small' }, ['Redo']);
  const showHistory = (): void => {
    undoButton.disabled = context.disabled || !past.length;
    redoButton.disabled = context.disabled || !future.length;
  };
  /** Keep the message as it is now as a step back, before a change. */
  const remember = (): void => {
    past.push(JSON.stringify(current()));
    if (past.length > HISTORY_MAX) past.shift();
    future.length = 0;
    showHistory();
  };
  /** Put a message in place of this one's parts, keeping which embeds were open by their place. */
  const take = (next: Model, keepOpen: readonly boolean[]): void => {
    model.content = next.content;
    model.embeds = next.embeds;
    model.buttons = next.buttons;
    model.embeds.forEach((embed, i) => {
      if (keepOpen[i]) opened.add(embed);
    });
    drawEditor();
    redrawPreview();
  };
  const travel = (from: string[], to: string[]): void => {
    const held = from.pop();
    if (held === undefined) return;
    to.push(JSON.stringify(current()));
    typing = { owner: null, key: '', at: 0 };
    take(
      modelOf(JSON.parse(held)),
      model.embeds.map((embed) => opened.has(embed)),
    );
    showHistory();
  };
  const undo = (): void => travel(past, future);
  const redo = (): void => travel(future, past);
  undoButton.addEventListener('click', undo);
  redoButton.addEventListener('click', redo);
  /** Put a whole message in place of this one, as one step. */
  const replace = (message: unknown): void => {
    remember();
    take(modelOf(message), [true]);
  };

  /** A keystroke on `owner[key]`: a new step unless it continues the same burst of typing. */
  const typed = (owner: Part, key: string): void => {
    const now = Date.now();
    if (typing.owner !== owner || typing.key !== key || now - typing.at > TYPING_PAUSE_MS) remember();
    typing = { owner, key, at: now };
  };

  /** One text input bound to a part of the model (`owner[key]`): its label, its counter where the bound is long. */
  const textBox = (label: string, spot: string, owner: Part, key: string, options: TextOptions): HTMLElement => {
    const id = `${composerId}-${notes.size}`;
    const attributes = {
      id,
      maxlength: String(options.max),
      ...(options.placeholder ? { placeholder: options.placeholder } : {}),
    };
    const box = options.multiline ? element('textarea', attributes) : element('input', attributes);
    box.value = String(owner[key] ?? '');
    box.disabled = context.disabled;
    const owned = boxes.get(owner) ?? new Map();
    boxes.set(owner, owned.set(key, box));
    const count = element('span', { class: 'field-help count' });
    const counted = (): void => {
      count.textContent = options.max >= 256 ? `${box.value.length} / ${options.max}` : '';
    };
    counted();
    box.addEventListener('focus', () => {
      lastSpot = { owner, key };
    });
    box.addEventListener('input', () => {
      typed(owner, key);
      owner[key] = box.value;
      counted();
      redrawPreview();
    });
    const fieldNote = element('p', { class: 'field-error', role: 'alert' });
    notes.set(spot, fieldNote);
    return element('div', { class: 'field' }, [element('label', { for: id }, [label, ' ', count]), box, fieldNote]);
  };
  const checkBox = (label: string, owner: Part, key: string): HTMLElement => {
    const id = `${composerId}-c${++checkCount}`;
    const box = element('input', { id, type: 'checkbox' });
    box.checked = owner[key] === true;
    box.disabled = context.disabled;
    box.addEventListener('change', () => {
      remember();
      owner[key] = box.checked;
      redrawPreview();
    });
    return element('div', { class: 'field inline-check' }, [box, element('label', { for: id }, [label])]);
  };
  /** A small button that changes the message as one step, then draws it again. */
  const small = (label: string, act: () => void, off = false): HTMLButtonElement => {
    const node = element('button', { type: 'button', class: 'button button-small' }, [label]);
    node.disabled = context.disabled || off;
    node.addEventListener('click', () => {
      remember();
      act();
      drawEditor();
      redrawPreview();
    });
    return node;
  };
  /** An Upload button beside a picture's link: the file goes to the bot, and its address into the link. */
  const uploader = (owner: Part, key: string): HTMLElement | null => {
    const upload = context.tools?.upload;
    if (!upload || context.disabled) return null;
    const picker = element('input', { type: 'file', accept: PICTURE_TYPES, class: 'visually-hidden', tabindex: '-1' });
    const press = element('button', { type: 'button', class: 'button button-small' }, ['Upload']);
    press.addEventListener('click', () => picker.click());
    picker.addEventListener('change', async () => {
      const file = picker.files?.[0];
      picker.value = '';
      if (!file) return;
      press.disabled = true;
      say('Uploading...');
      const answer = await upload(file).catch(() => ({ ok: false, url: '', message: 'The bot could not be reached.' }));
      press.disabled = false;
      if (!answer.ok || !answer.url) {
        say(answer.message ?? 'The picture was not kept.');
        return;
      }
      remember();
      owner[key] = answer.url;
      drawEditor();
      redrawPreview();
      say('Uploaded.');
    });
    return element('span', { class: 'composer-upload' }, [press, picker]);
  };

  const embedCard = (embed: Embed, i: number): HTMLElement => {
    const spot = `${path}.embeds[${i}]`;
    const part = (key: string, label: string, options: TextOptions): HTMLElement =>
      textBox(label, `${spot}.${key}`, embed, key, options);
    const linkPart = (key: string, label: string): HTMLElement => {
      const box = part(key, label, { max: LIMITS.url, placeholder: 'https://...' });
      const upload = PICTURE_KEYS.has(key) ? uploader(embed, key) : null;
      if (upload) box.append(upload);
      return box;
    };
    const colourId = `${composerId}-colour-${i}`;
    const colour = element('input', { id: colourId, type: 'color' });
    const held = String(embed.color ?? '');
    colour.value = /^#[0-9a-fA-F]{6}$/.test(held) ? held : '#8a5a2b';
    colour.disabled = context.disabled;
    colour.addEventListener('input', () => {
      typed(embed, 'color');
      embed.color = colour.value;
      redrawPreview();
    });
    const fields = element('div', { class: 'composer-fields' });
    embed.fields.forEach((row, j) => {
      const fieldAt = `${spot}.fields[${j}]`;
      fields.append(
        element('div', { class: 'composer-field' }, [
          textBox(`Field ${j + 1} name`, `${fieldAt}.name`, row, 'name', { max: LIMITS.fieldName }),
          textBox(`Field ${j + 1} value`, `${fieldAt}.value`, row, 'value', {
            max: LIMITS.fieldValue,
            multiline: true,
          }),
          checkBox('Beside the one before', row, 'inline'),
          element('div', { class: 'acts' }, [
            small('Up', () => move(embed.fields, j, -1), j === 0),
            small('Down', () => move(embed.fields, j, 1), j === embed.fields.length - 1),
            small('Remove field', () => embed.fields.splice(j, 1)),
          ]),
        ]),
      );
    });
    const named = String(embed.title || embed.authorName || String(embed.description ?? '').slice(0, 40) || 'Empty');
    const card = element('details', { class: 'composer-embed' }, [
      element('summary', {}, [`Embed ${i + 1}: ${named}`]),
    ]);
    card.open = opened.has(embed);
    card.addEventListener('toggle', () => {
      if (card.open) opened.add(embed);
      else opened.delete(embed);
    });
    const group = (legend: string, parts: readonly Node[]): HTMLElement =>
      element('fieldset', { class: 'group' }, [element('legend', {}, [legend]), ...parts]);
    card.append(
      element('div', { class: 'field' }, [element('label', { for: colourId }, ['Colour']), colour]),
      group('Author', [
        part('authorName', 'Name', { max: LIMITS.author }),
        linkPart('authorUrl', 'Link'),
        linkPart('authorIcon', 'Icon'),
      ]),
      part('title', 'Title', { max: LIMITS.title }),
      linkPart('url', 'Title link'),
      part('description', 'Description', { max: LIMITS.description, multiline: true }),
      linkPart('thumbnail', 'Thumbnail (small, top right)'),
      linkPart('image', 'Image (large, below)'),
      group('Fields', [
        fields,
        small(
          'Add field',
          () => embed.fields.push({ name: '', value: '', inline: true }),
          embed.fields.length >= LIMITS.fields,
        ),
      ]),
      group('Footer', [
        part('footer', 'Words', { max: LIMITS.footer }),
        linkPart('footerIcon', 'Icon'),
        checkBox('Show the time it was sent', embed, 'timestamp'),
      ]),
      element('div', { class: 'acts' }, [
        small('Move up', () => move(model.embeds, i, -1), i === 0),
        small('Move down', () => move(model.embeds, i, 1), i === model.embeds.length - 1),
        small(
          'Copy',
          () => {
            const copy = structuredClone(embed);
            opened.add(copy);
            model.embeds.splice(i + 1, 0, copy);
          },
          model.embeds.length >= LIMITS.embeds,
        ),
        small('Remove embed', () => model.embeds.splice(i, 1)),
      ]),
    );
    return card;
  };

  /** The link buttons under the message. */
  const buttonsCard = (): HTMLElement => {
    const rows = model.buttons.map((link, k) => {
      const spot = `${path}.buttons[${k}]`;
      return element('div', { class: 'composer-field' }, [
        textBox(`Button ${k + 1} words`, `${spot}.label`, link, 'label', { max: LIMITS.buttonLabel }),
        textBox(`Button ${k + 1} emoji`, `${spot}.emoji`, link, 'emoji', { max: 64, placeholder: '🎮 or <:name:id>' }),
        textBox(`Button ${k + 1} link`, `${spot}.url`, link, 'url', { max: LIMITS.url, placeholder: 'https://...' }),
        element('div', { class: 'acts' }, [
          small('Up', () => move(model.buttons, k, -1), k === 0),
          small('Down', () => move(model.buttons, k, 1), k === model.buttons.length - 1),
          small('Remove button', () => model.buttons.splice(k, 1)),
        ]),
      ]);
    });
    return element('fieldset', { class: 'group' }, [
      element('legend', {}, ['Link buttons']),
      element('p', { class: 'field-help' }, ['Up to 25, five to a row. Each needs a link, and words or an emoji.']),
      ...rows,
      small(
        'Add button',
        () => model.buttons.push({ label: '', emoji: '', url: '' }),
        model.buttons.length >= LIMITS.buttons,
      ),
    ]);
  };

  /**
   * Text put where the person was typing, as if they had typed it: in this drawing's box for that part, or the
   * message's own box once that part is gone.
   */
  const insert = (text: string): void => {
    const spotBox = lastSpot ? boxes.get(lastSpot.owner)?.get(lastSpot.key) : undefined;
    const box = spotBox ?? editor.querySelector('textarea');
    if (!box || box.disabled) return;
    const start = box.selectionStart ?? box.value.length;
    const end = box.selectionEnd ?? start;
    box.value = `${box.value.slice(0, start)}${text}${box.value.slice(end)}`;
    box.setSelectionRange?.(start + text.length, start + text.length);
    typing = { owner: null, key: '', at: 0 };
    box.dispatchEvent(new window.Event('input'));
    box.focus();
  };

  const composer: Composer = { context, field, current, replace, say };
  function drawEditor(): void {
    notes.clear();
    boxes = new Map();
    editor.replaceChildren(
      insertTools(context, field.vars, insert),
      textBox('Message', `${path}.content`, model, 'content', { max: LIMITS.content, multiline: true }),
      ...model.embeds.map(embedCard),
      element('div', { class: 'acts' }, [
        small(
          'Add embed',
          () => {
            const fresh: Embed = { ...defaults(EMBED_SCHEMA), fields: [] };
            opened.add(fresh);
            model.embeds.push(fresh);
          },
          model.embeds.length >= LIMITS.embeds,
        ),
      ]),
      buttonsCard(),
      total,
      jsonTools(composer),
    );
  }

  drawEditor();
  redrawPreview();
  showHistory();
  const box = element('div', { class: 'field message' }, [
    element('p', { class: 'field-label' }, [field.label]),
    ...(field.help ? [element('p', { class: 'field-help' }, [field.help])] : []),
    element('div', { class: 'composer-bar' }, [undoButton, redoButton, messageTools(composer)]),
    toolNote,
    element('div', { class: 'composer' }, [
      editor,
      element('div', { class: 'composer-preview' }, [element('p', { class: 'field-help' }, ['Preview']), previewBox]),
    ]),
    note,
  ]);
  // undo and redo by keyboard outside the text boxes, where the browser keeps its own undo for the words
  box.addEventListener('keydown', (event) => {
    const tag = (event.target as HTMLElement | null)?.tagName ?? '';
    if (!(event.ctrlKey || event.metaKey) || ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
    const key = String(event.key).toLowerCase();
    if (key !== 'z' && key !== 'y') return;
    event.preventDefault();
    if (key === 'y' || event.shiftKey) redo();
    else undo();
  });
  return {
    element: box,
    read: current,
    refresh: redrawPreview,
    mark: (spot, message) => {
      const target = notes.get(spot);
      if (target) {
        target.textContent = message;
        return true;
      }
      if (spot !== path && !spot.startsWith(`${path}.`)) return false;
      note.textContent = message;
      return true;
    },
  };
}
