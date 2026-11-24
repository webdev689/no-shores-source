// A message the bot posts for a server: words, up to ten embeds with Discord's own parts, and link buttons. Read by
// both sides: the bot builds what it posts from it, and the panel draws the same thing as its live preview, so what a
// manager sees is what Discord is sent.

import { type MessageField, type Schema, type Settings, type TextField, recordOf } from './settings.ts';

/** Discord's limits for a message and its embeds (the description held to the settings' own text bound). */
export const LIMITS = Object.freeze({
  content: 2000,
  embeds: 10,
  title: 256,
  description: 4000,
  fields: 25,
  fieldName: 256,
  fieldValue: 1024,
  footer: 2048,
  author: 256,
  url: 500,
  total: 6000,
  buttons: 25,
  buttonLabel: 80,
  buttonsInRow: 5,
});

/** The placeholders a link setting may hold: each is filled with an https address. */
export const LINK_SLOTS = Object.freeze(['avatar', 'server_icon', 'welcome_card']);
/** An embed's parts that are links. */
export const LINK_PARTS = Object.freeze(['authorUrl', 'authorIcon', 'url', 'thumbnail', 'image', 'footerIcon']);
/** The edge colour of an embed that names none. */
export const DEFAULT_COLOUR = '#8a5a2b';

/** A link setting: an https address, or a placeholder the bot fills with one. */
const LINK = `(https://\\S+|${LINK_SLOTS.map((slot) => `\\{${slot}\\}`).join('|')})`;
const link = (label: string): TextField => ({
  type: 'text',
  label,
  max: LIMITS.url,
  default: '',
  pattern: LINK,
  patternHelp: 'An https link, or {avatar}, {server_icon} or {welcome_card}.',
});
const words = (label: string, max: number, multiline = false): TextField => ({
  type: 'text',
  label,
  max,
  default: '',
  ...(multiline ? { multiline } : {}),
});

/** One embed's parts, as the settings hold them. */
export const EMBED_SCHEMA: Schema = Object.freeze({
  color: {
    type: 'text',
    label: 'Colour',
    max: 7,
    default: DEFAULT_COLOUR,
    pattern: '#[0-9a-fA-F]{6}',
    patternHelp: 'Use a # and six hex digits.',
  },
  authorName: words('Author', LIMITS.author),
  authorUrl: link('Author link'),
  authorIcon: link('Author icon'),
  title: words('Title', LIMITS.title),
  url: link('Title link'),
  description: words('Description', LIMITS.description, true),
  thumbnail: link('Thumbnail'),
  image: link('Image'),
  fields: {
    type: 'list',
    label: 'Fields',
    max: LIMITS.fields,
    default: [],
    of: {
      type: 'group',
      label: 'Field',
      fields: {
        name: words('Name', LIMITS.fieldName),
        value: words('Value', LIMITS.fieldValue, true),
        inline: { type: 'bool', label: 'Beside the one before', default: true },
      },
    },
  },
  footer: words('Footer', LIMITS.footer),
  footerIcon: link('Footer icon'),
  timestamp: { type: 'bool', label: 'Show the time it was sent', default: false },
});

/** One picture character, with its presentation mark, skin tone or the tags of a flag such as England's. */
const PICTURE = '\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier}|[\\u{E0020}-\\u{E007E}]+\\u{E007F})?';
/**
 * An emoji Discord takes on a button: a server's own as `<:name:id>`, or one emoji: a keycap, a flag's two letters,
 * or picture characters joined into one. Anything else, such as `:sword:`, a word, an arrow or a lone joiner, makes
 * Discord refuse the whole message.
 */
export const EMOJI_PATTERN = `<a?:\\w{2,32}:\\d{5,25}>|[#*0-9]\\uFE0F?\\u20E3|\\p{Regional_Indicator}{2}|${PICTURE}(?:\\u200D${PICTURE})*`;

/** A link button under a message: its words or emoji, and where it leads. */
export const BUTTON_SCHEMA: Schema = Object.freeze({
  label: words('Label', LIMITS.buttonLabel),
  emoji: {
    ...words('Emoji', 64),
    pattern: EMOJI_PATTERN,
    patternHelp: "One emoji, or one of this server's own as <:name:id>.",
  },
  url: link('Link'),
});

/** A whole message: its words, its embeds and its link buttons. */
export const MESSAGE_SCHEMA: Schema = Object.freeze({
  content: words('Message', LIMITS.content, true),
  embeds: {
    type: 'list',
    label: 'Embeds',
    max: LIMITS.embeds,
    default: [],
    of: { type: 'group', label: 'Embed', fields: EMBED_SCHEMA },
  },
  buttons: {
    type: 'list',
    label: 'Link buttons',
    max: LIMITS.buttons,
    default: [],
    of: { type: 'group', label: 'Button', fields: BUTTON_SCHEMA },
  },
});

/** An embed with every part at its default, and the parts given. */
export const blankEmbed = (parts: Settings = {}): Settings => ({
  ...Object.fromEntries(
    Object.entries(EMBED_SCHEMA).map(([key, field]) => [
      key,
      structuredClone(field.type === 'group' ? {} : field.default),
    ]),
  ),
  ...parts,
});

/** A message setting for a module's shape: its label, the placeholders its words may use, and what it starts as. */
export const messageField = (
  label: string,
  {
    help,
    vars = [],
    content = '',
    embeds = [],
  }: { help?: string; vars?: readonly string[]; content?: string; embeds?: readonly Settings[] } = {},
): MessageField => ({
  type: 'message',
  label,
  ...(help ? { help } : {}),
  vars,
  default: { content, embeds: embeds.map((parts) => blankEmbed(parts)), buttons: [] },
});

/** Markdown in someone's words shown as they typed it. */
export const escapeText = (text: unknown): string => String(text).replace(/([\\*_~`|>#[\]()-])/g, '\\$1');

/** The placeholders that hold a mention or a link, filled as they are. */
const AS_IS = new Set(['user', ...LINK_SLOTS]);

export interface Emoji {
  readonly id?: string;
  readonly name: string;
  readonly animated?: boolean;
}

/** An emoji as Discord's components take it: a server's own by its id, a plain one by its character, or null. */
export function emojiOf(text: unknown): Emoji | null {
  const held = String(text ?? '').trim();
  const custom = /^<(a?):(\w+):(\d+)>$/.exec(held);
  if (custom) return { id: custom[3] ?? '', name: custom[2] ?? '', animated: custom[1] === 'a' };
  return held ? { name: held } : null;
}

/** Every placeholder a saved message's words, embeds and buttons name. */
export function slotsUsed(message: unknown): Set<string> {
  const found = new Set<string>();
  const walk = (held: unknown) => {
    if (typeof held === 'string') for (const match of held.matchAll(/\{([a-z_.]+)\}/g)) found.add(match[1] ?? '');
    else if (Array.isArray(held)) held.forEach(walk);
    else if (held && typeof held === 'object') Object.values(held).forEach(walk);
  };
  walk(message);
  return found;
}

/** A user's avatar address, or the default Discord draws for them. */
export function avatarUrl(
  user: { id?: unknown; avatar?: unknown; discriminator?: unknown } | null | undefined,
): string {
  const id = String(user?.id ?? '');
  if (!/^\d{5,25}$/.test(id)) return '';
  if (user?.avatar) return `https://cdn.discordapp.com/avatars/${id}/${String(user.avatar)}.png?size=256`;
  const legacy = Number(user?.discriminator);
  const index = legacy > 0 ? legacy % 5 : Number((BigInt(id) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

/** A server's icon address, or none. */
export const serverIconUrl = (guildId: unknown, icon: unknown): string =>
  /^\d{5,25}$/.test(String(guildId ?? '')) && icon
    ? `https://cdn.discordapp.com/icons/${String(guildId)}/${String(icon)}.png?size=256`
    : '';

/**
 * Fill `{name}` placeholders; an unknown one stays as written, so a typo shows. Only the values' own keys count, so
 * `{constructor}` is never filled from the object's prototype.
 */
export const fillSlots = (text: unknown, vars: Readonly<Record<string, string | number>>): string =>
  String(text ?? '').replace(/\{([a-z_.]+)\}/g, (whole, key: string) =>
    Object.hasOwn(vars, key) ? String(vars[key]) : whole,
  );

/** A link once filled, if it is an https address; anything else is left out. */
const linkOf = (text: unknown, vars: Readonly<Record<string, string>>) => {
  const filled = fillSlots(text, vars).trim();
  return /^https:\/\/\S+$/.test(filled) && filled.length <= LIMITS.url ? filled : '';
};

/** `#rrggbb` as Discord's number. */
export const colorNumber = (hex: unknown): number =>
  /^#[0-9a-fA-F]{6}$/.test(String(hex)) ? parseInt(String(hex).slice(1), 16) : parseInt(DEFAULT_COLOUR.slice(1), 16);

export interface EmbedField {
  name: string;
  value: string;
  inline: boolean;
}
/** One embed as Discord takes it. */
export interface BuiltEmbed {
  color: number;
  author?: { name: string; url?: string; icon_url?: string };
  title?: string;
  url?: string;
  description?: string;
  thumbnail?: { url: string };
  image?: { url: string };
  fields?: EmbedField[];
  footer?: { text: string; icon_url?: string };
  timestamp?: string;
}
export interface LinkButton {
  readonly type: 2;
  readonly style: 5;
  readonly url: string;
  readonly label?: string;
  readonly emoji?: Emoji;
}
export interface ButtonRow {
  readonly type: 1;
  readonly components: readonly LinkButton[];
}
export interface Payload {
  content?: string;
  embeds: BuiltEmbed[];
  components?: ButtonRow[];
}

/** The characters of a built embed Discord counts toward its 6000: the one counting rule. */
const counted = (embed: BuiltEmbed): number =>
  (embed.title?.length ?? 0) +
  (embed.description?.length ?? 0) +
  (embed.author?.name.length ?? 0) +
  (embed.footer?.text.length ?? 0) +
  (embed.fields ?? []).reduce((sum, field) => sum + field.name.length + field.value.length, 0);

const listOf = (held: unknown): Settings[] => (Array.isArray(held) ? held : []).map(recordOf);

/** A saved embed's counted parts in the built shape, so one rule counts both. */
const countedParts = (saved: Settings): BuiltEmbed => ({
  color: 0,
  title: String(saved.title ?? ''),
  description: String(saved.description ?? ''),
  author: { name: String(saved.authorName ?? '') },
  footer: { text: String(saved.footer ?? '') },
  fields: listOf(saved.fields).map((field) => ({
    name: String(field.name ?? ''),
    value: String(field.value ?? ''),
    inline: true,
  })),
});

/** The characters a saved message's embeds hold toward Discord's 6000, before placeholders are filled. */
export const messageSize = (message: unknown): number =>
  listOf(recordOf(message).embeds).reduce((sum, saved) => sum + counted(countedParts(saved)), 0);

/** Whether a built embed shows anything: Discord refuses one with only a colour, and the message with it. */
const hasParts = (embed: BuiltEmbed) =>
  ['author', 'title', 'description', 'thumbnail', 'image', 'fields', 'footer'].some((key) => key in embed);

/**
 * One embed as Discord takes it; one with no parts is left out of the message at its end. `marked` fills the parts
 * Discord reads markdown in; the author and footer, which it shows as typed, take `vars` as they are.
 */
function embedOf(
  saved: Settings,
  vars: Readonly<Record<string, string>>,
  marked: Readonly<Record<string, string>>,
  nowMs: number,
): BuiltEmbed {
  const fill = (text: unknown, most: number) => fillSlots(text, marked).slice(0, most);
  const plain = (text: unknown, most: number) => fillSlots(text, vars).slice(0, most);
  const embed: BuiltEmbed = { color: colorNumber(saved.color) };
  const authorName = plain(saved.authorName, LIMITS.author).trim();
  if (authorName) {
    const url = linkOf(saved.authorUrl, vars);
    const icon = linkOf(saved.authorIcon, vars);
    embed.author = { name: authorName, ...(url ? { url } : {}), ...(icon ? { icon_url: icon } : {}) };
  }
  const title = fill(saved.title, LIMITS.title).trim();
  if (title) {
    embed.title = title;
    const url = linkOf(saved.url, vars);
    if (url) embed.url = url;
  }
  const description = fill(saved.description, LIMITS.description).trim();
  if (description) embed.description = description;
  const thumbnail = linkOf(saved.thumbnail, vars);
  if (thumbnail) embed.thumbnail = { url: thumbnail };
  const image = linkOf(saved.image, vars);
  if (image) embed.image = { url: image };
  // Discord refuses a field with no name or no value: an empty one is a zero-width space, and a field with neither goes
  const fields = listOf(saved.fields)
    .slice(0, LIMITS.fields)
    .map((field) => ({
      name: fill(field.name, LIMITS.fieldName).trim(),
      value: fill(field.value, LIMITS.fieldValue).trim(),
      inline: field.inline !== false,
    }))
    .filter((field) => field.name || field.value)
    .map((field) => ({ name: field.name || '​', value: field.value || '​', inline: field.inline }));
  if (fields.length) embed.fields = fields;
  const footer = plain(saved.footer, LIMITS.footer).trim();
  if (footer) {
    const icon = linkOf(saved.footerIcon, vars);
    embed.footer = { text: footer, ...(icon ? { icon_url: icon } : {}) };
  }
  if (saved.timestamp === true) embed.timestamp = new Date(nowMs).toISOString();
  return embed;
}

/**
 * A message's link buttons as Discord's components: rows of five, each button with an https link and a label or an
 * emoji. A button with neither, or no link once filled, is left out.
 */
function buttonRows(saved: unknown, vars: Readonly<Record<string, string>>): ButtonRow[] {
  const buttons = listOf(saved)
    .slice(0, LIMITS.buttons)
    .flatMap((button): LinkButton[] => {
      const label = fillSlots(button.label, vars).trim().slice(0, LIMITS.buttonLabel);
      const emoji = emojiOf(button.emoji);
      const url = linkOf(button.url, vars);
      return url && (label || emoji)
        ? [{ type: 2, style: 5, url, ...(label ? { label } : {}), ...(emoji ? { emoji } : {}) }]
        : [];
    });
  return rowsOf(buttons);
}

/** Buttons in Discord's rows of five. */
export function rowsOf(buttons: readonly LinkButton[]): ButtonRow[] {
  const rows: ButtonRow[] = [];
  for (let from = 0; from < buttons.length; from += LIMITS.buttonsInRow)
    rows.push({ type: 1, components: buttons.slice(from, from + LIMITS.buttonsInRow) });
  return rows;
}

/** Cut a built message back within Discord's 6000: the last descriptions first, then the last fields, then embeds. */
function heldToTotal(embeds: BuiltEmbed[]): void {
  let over = embeds.reduce((sum, embed) => sum + counted(embed), 0) - LIMITS.total;
  for (const embed of [...embeds].reverse()) {
    if (over <= 0) break;
    const description = embed.description ?? '';
    const cut = Math.min(description.length, over);
    if (!cut) continue;
    embed.description = description.slice(0, description.length - cut);
    if (!embed.description) delete embed.description;
    over -= cut;
  }
  for (const embed of [...embeds].reverse()) {
    const fields = embed.fields ?? [];
    while (over > 0 && fields.length) {
      const gone = fields.pop();
      over -= (gone?.name.length ?? 0) + (gone?.value.length ?? 0);
    }
    if (embed.fields && !fields.length) delete embed.fields;
  }
  // one embed's title, author and footer are under 6000 together, so dropping whole embeds always ends within it
  while (over > 0 && embeds.length > 1) over -= counted(embeds.pop() ?? { color: 0 });
}

/**
 * What Discord is sent for a saved message: placeholders filled from plain `vars` (markdown escaped where Discord reads
 * it), links checked, and Discord's limits held. Filled names can pass the 6000 a save was held to; then the last
 * descriptions are cut, then the last fields go, then the last embeds. No words: no `content`; no buttons: no rows.
 */
export function messagePayload(
  message: unknown,
  vars: Readonly<Record<string, string>> = {},
  nowMs = Date.now(),
): Payload {
  const saved = recordOf(message);
  const marked = Object.fromEntries(
    Object.entries(vars).map(([key, value]) => [key, AS_IS.has(key) ? String(value) : escapeText(value)]),
  );
  const content = fillSlots(saved.content, marked).slice(0, LIMITS.content).trim();
  const embeds = listOf(saved.embeds)
    .slice(0, LIMITS.embeds)
    .map((embed) => embedOf(embed, vars, marked, nowMs));
  heldToTotal(embeds);
  const rows = buttonRows(saved.buttons, vars);
  return {
    ...(content ? { content } : {}),
    embeds: embeds.filter(hasParts),
    ...(rows.length ? { components: rows } : {}),
  };
}

/** Whether a built message posts nothing: Discord refuses one with no words, embeds or buttons. */
export const payloadEmpty = (payload: Payload): boolean =>
  !payload.content && payload.embeds.length === 0 && !payload.components?.length;

/** A built message as an edit of one already posted: what it no longer has is cleared, not kept from before. */
export const asEdit = (payload: Payload): Payload & { content: string; components: ButtonRow[] } => ({
  content: '',
  components: [],
  ...payload,
});

/** Whether a saved message would post anything at all. */
export const messageEmpty = (message: unknown, vars: Readonly<Record<string, string>> = {}): boolean =>
  payloadEmpty(messagePayload(message, vars, 0));
