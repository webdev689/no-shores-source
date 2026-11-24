// The shape of a bot module's settings, read by both sides: the bot validates every write against it, and the panel
// draws its forms from it. One description per field means a setting cannot be valid in the panel and refused by the
// bot, or the other way round.

import { LIMITS, LINK_PARTS, MESSAGE_SCHEMA, emojiOf, messageSize } from './message.ts';

/** Discord's channel types a picker may offer. */
export const CHANNEL_KIND = Object.freeze({ TEXT: 0, VOICE: 2, CATEGORY: 4, ANNOUNCEMENT: 5, STAGE: 13, FORUM: 15 });

interface FieldBase {
  readonly label: string;
  readonly help?: string;
}
export interface BoolField extends FieldBase {
  readonly type: 'bool';
  readonly default: boolean;
}
export interface IntField extends FieldBase {
  readonly type: 'int';
  readonly min: number;
  readonly max: number;
  readonly default: number;
}
/** `pattern` is a regular expression the whole text must match; empty text always passes it. */
export interface TextField extends FieldBase {
  readonly type: 'text';
  readonly max: number;
  readonly default: string;
  readonly multiline?: boolean;
  readonly placeholder?: string;
  readonly pattern?: string;
  readonly patternHelp?: string;
}
export interface ChannelField extends FieldBase {
  readonly type: 'channel';
  readonly kinds?: readonly number[];
  readonly default: string;
}
export interface RoleField extends FieldBase {
  readonly type: 'role';
  readonly default: string;
}
export interface EnumField extends FieldBase {
  readonly type: 'enum';
  readonly values: ReadonlyArray<{ readonly value: string; readonly label: string }>;
  readonly default: string;
}
export interface ListField extends FieldBase {
  readonly type: 'list';
  readonly of: Field;
  readonly max: number;
  readonly default: readonly unknown[];
  /** A field of each entry that no two entries may share: the name the module finds an entry by. */
  readonly unique?: string;
}
export interface GroupField extends FieldBase {
  readonly type: 'group';
  readonly fields: Schema;
}
/** A saved message: its words, its embeds and its link buttons, each as the message law holds them. */
export interface SavedMessage {
  readonly content: string;
  readonly embeds: readonly Settings[];
  readonly buttons: readonly Settings[];
}
export interface MessageField extends FieldBase {
  readonly type: 'message';
  readonly vars: readonly string[];
  readonly default: SavedMessage;
}
export type Field =
  BoolField | IntField | TextField | ChannelField | RoleField | EnumField | ListField | GroupField | MessageField;
export type Schema = Readonly<Record<string, Field>>;
/** A module's settings as saved: read through `validate` or `salvage`, which give each field its schema's shape. */
export type Settings = Record<string, unknown>;
export interface FieldError {
  readonly path: string;
  readonly message: string;
}

const SNOWFLAKE = /^\d{17,20}$/;
/** The most characters a text setting, and entries a list setting, may hold, whatever its own bound says. */
export const TEXT_HARD_MAX = 4000;
export const LIST_HARD_MAX = 250;

/** A value read as a group of settings, or nothing when it is not one. */
export const recordOf = (value: unknown): Settings =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Settings) : {};

export function fieldDefault(field: Field): unknown {
  if (field.type === 'group') return defaults(field.fields);
  if (field.type === 'list' || field.type === 'message') return structuredClone(field.default);
  return field.default;
}

/** Every field at its default. */
export function defaults(schema: Schema): Settings {
  const out: Settings = {};
  for (const [key, field] of Object.entries(schema)) out[key] = fieldDefault(field);
  return out;
}

/**
 * Check `value` against `schema`. Answers the value with every missing field at its default and every unknown key
 * dropped, or the errors. A missing field is not an error, so a module can grow a setting without breaking a saved
 * config; a present field of the wrong shape is.
 */
export function validate(
  schema: Schema,
  value: unknown,
): { readonly ok: true; readonly value: Settings } | { readonly ok: false; readonly errors: FieldError[] } {
  const errors: FieldError[] = [];
  const out = checkGroup(schema, value, '', errors, false);
  return errors.length ? { ok: false, errors } : { ok: true, value: out };
}

/**
 * A saved config read under today's schema, keeping all it can: a list or a text past a lowered limit is cut to it, a
 * number past its range is brought inside, and only a field that cannot be read takes its default. Never refuses.
 */
export function salvage(schema: Schema, value: unknown): Settings {
  return checkGroup(schema, value, '', [], true);
}

function checkGroup(schema: Schema, value: unknown, path: string, errors: FieldError[], lenient: boolean): Settings {
  const out: Settings = {};
  if (value !== undefined && (value === null || typeof value !== 'object' || Array.isArray(value))) {
    errors.push({ path: path || '.', message: 'Must be a group of settings.' });
    return defaults(schema);
  }
  const given = recordOf(value);
  for (const [key, field] of Object.entries(schema)) {
    const where = path ? `${path}.${key}` : key;
    out[key] = Object.hasOwn(given, key) ? checkField(field, given[key], where, errors, lenient) : fieldDefault(field);
  }
  return out;
}

/** `lenient` is reading a saved config (salvage): cut and bring inside rather than refuse. */
function checkField(field: Field, value: unknown, path: string, errors: FieldError[], lenient: boolean): unknown {
  const bad = (message: string) => {
    errors.push({ path, message });
    return fieldDefault(field);
  };
  switch (field.type) {
    case 'bool':
      return typeof value === 'boolean' ? value : bad('Must be on or off.');
    case 'int':
      if (typeof value !== 'number' || !Number.isSafeInteger(value)) return bad('Must be a whole number.');
      if (lenient) return Math.min(field.max, Math.max(field.min, value));
      return value < field.min || value > field.max ? bad(`Must be from ${field.min} to ${field.max}.`) : value;
    case 'text': {
      if (typeof value !== 'string') return bad('Must be text.');
      const most = Math.min(field.max, TEXT_HARD_MAX);
      const text = lenient ? value.slice(0, most) : value;
      if (text.length > most) return bad(`At most ${most} characters.`);
      if (field.pattern && text !== '' && !new RegExp(`^(?:${field.pattern})$`).test(text))
        return bad(field.patternHelp ?? 'Not the right form.');
      return text;
    }
    case 'channel':
    case 'role':
      if (value === '') return '';
      return typeof value === 'string' && SNOWFLAKE.test(value) ? value : bad(`Must be a ${field.type} or none.`);
    case 'enum':
      return typeof value === 'string' && field.values.some((choice) => choice.value === value)
        ? value
        : bad('Not one of the choices.');
    case 'list': {
      if (!Array.isArray(value)) return bad('Must be a list.');
      const most = Math.min(field.max, LIST_HARD_MAX);
      const items = lenient ? value.slice(0, most) : value;
      if (items.length > most) return bad(`At most ${most} entries.`);
      const checked = items.map((item, i) => checkField(field.of, item, `${path}[${i}]`, errors, lenient));
      if (field.unique && !lenient) refuseTwins(field, field.unique, items, path, errors);
      return checked;
    }
    case 'group':
      return checkGroup(field.fields, value, path, errors, lenient);
    case 'message':
      return checkMessage(field, value, path, errors, lenient, bad);
    default:
      return bad('Unknown setting.');
  }
}

/**
 * Refuse an entry whose `key` an entry before it already holds. Only a save is refused: a saved config that has two
 * still loads, so nothing saved before is lost.
 */
function refuseTwins(field: ListField, key: string, items: readonly unknown[], path: string, errors: FieldError[]) {
  const entry = field.of.label.toLowerCase();
  const named = (field.of.type === 'group' ? field.of.fields[key]?.label : undefined) ?? key;
  const seen = new Set<unknown>();
  items.forEach((item, i) => {
    const held = recordOf(item)[key];
    if (seen.has(held))
      errors.push({ path: `${path}[${i}].${key}`, message: `Another ${entry} has this ${named.toLowerCase()}.` });
    seen.add(held);
  });
}

/**
 * Words and up to ten embeds, each part to Discord's own bound, and the embeds together to its 6000; one that cannot
 * be read back at all takes the field's own default, as any other setting does. A link this message cannot fill
 * would vanish when sent, so it is refused where it was typed.
 */
function checkMessage(
  field: MessageField,
  value: unknown,
  path: string,
  errors: FieldError[],
  lenient: boolean,
  bad: (message: string) => unknown,
): unknown {
  const readable = value === undefined || (value !== null && typeof value === 'object' && !Array.isArray(value));
  if (lenient && !readable) return fieldDefault(field);
  const message = checkGroup(MESSAGE_SCHEMA, value, path, errors, lenient);
  if (lenient) return message;
  const fills = new Set(field.vars);
  const linkFits = (text: unknown, where: string) => {
    const strange = [...String(text ?? '').matchAll(/\{([a-z_]+)\}/g)].find((found) => !fills.has(found[1] ?? ''));
    if (strange) errors.push({ path: where, message: `This message cannot fill {${strange[1]}}.` });
  };
  const listOf = (held: unknown) => (Array.isArray(held) ? held : []).map(recordOf);
  listOf(message.embeds).forEach((embed, i) =>
    LINK_PARTS.forEach((part) => linkFits(embed[part], `${path}.embeds[${i}].${part}`)),
  );
  listOf(message.buttons).forEach((button, i) => linkFits(button.url, `${path}.buttons[${i}].url`));
  if (messageSize(message) > LIMITS.total) return bad(`The embeds hold at most ${LIMITS.total} characters together.`);
  return message;
}

/** Every field of a schema, visited with the value it holds, through lists and groups. */
function walkFields(schema: Schema, value: unknown, visit: (field: Field, held: unknown) => void): void {
  const given = recordOf(value);
  const walk = (field: Field, held: unknown) => {
    visit(field, held);
    if (field.type === 'list' && Array.isArray(held)) held.forEach((item) => walk(field.of, item));
    else if (field.type === 'group') walkFields(field.fields, held, visit);
  };
  for (const [key, field] of Object.entries(schema)) walk(field, given[key]);
}

/** A config with each field `keep` rewrites rewritten, through lists and groups, the rest as it was. */
function rewritten(schema: Schema, value: Settings, keep: (field: Field, held: unknown) => unknown): Settings {
  const each = (field: Field, held: unknown): unknown => {
    const kept = keep(field, held);
    if (field.type === 'list' && Array.isArray(kept)) return kept.map((item) => each(field.of, item));
    if (field.type === 'group' && kept && typeof kept === 'object')
      return rewritten(field.fields, kept as Settings, keep);
    return kept;
  };
  const out: Settings = { ...value };
  for (const [key, field] of Object.entries(schema)) if (Object.hasOwn(out, key)) out[key] = each(field, out[key]);
  return out;
}

/**
 * A config with every channel it names that is not one of `known` taken out: a field's id emptied, a list's entry
 * dropped. The bot reads every saved config through this with the server's own channels, so a setting can only ever
 * reach that server, whatever was saved.
 */
export function channelsWithin(schema: Schema, value: Settings, known: ReadonlySet<string>): Settings {
  return rewritten(schema, value, (field, held) => {
    if (field.type === 'channel') return typeof held === 'string' && held && !known.has(held) ? '' : held;
    if (field.type === 'list' && field.of.type === 'channel' && Array.isArray(held))
      return held.filter((id) => !id || known.has(String(id)));
    return held;
  });
}

/** A message's buttons, each with the id of the server emoji it shows, if it shows one. */
const buttonEmojis = (message: unknown) =>
  (Array.isArray(recordOf(message).buttons) ? (recordOf(message).buttons as unknown[]) : []).map((button) => ({
    button: recordOf(button),
    id: emojiOf(recordOf(button).emoji)?.id ?? null,
  }));

/** Every channel, role and server emoji id a config names: the bot holds each to the server's own. */
export function referencedIds(
  schema: Schema,
  value: unknown,
): { channels: string[]; roles: string[]; emojis: string[] } {
  const channels = new Set<string>();
  const roles = new Set<string>();
  const emojis = new Set<string>();
  walkFields(schema, value, (field, held) => {
    if (field.type === 'channel' && typeof held === 'string' && held) channels.add(held);
    else if (field.type === 'role' && typeof held === 'string' && held) roles.add(held);
    else if (field.type === 'message') buttonEmojis(held).forEach(({ id }) => id && emojis.add(id));
  });
  return { channels: [...channels], roles: [...roles], emojis: [...emojis] };
}

/**
 * Where a config holds what `pick` finds: its setting's path, a list's place as `[]` or, for an entry with a name or a
 * level, by that. A thing moved to where it does more (a role from a setting that only names it to a reward, a reward
 * to a lower level) is then new where it now stands.
 */
function spotsOf(schema: Schema, value: unknown, pick: (field: Field, held: unknown) => string | null): string[] {
  const spots = new Set<string>();
  const walk = (field: Field, held: unknown, path: string) => {
    const found = pick(field, held);
    if (found) spots.add(`${path}=${found}`);
    else if (field.type === 'list' && Array.isArray(held))
      held.forEach((item) => {
        const entry = recordOf(item);
        const group = field.of.type === 'group';
        const named =
          group && typeof entry.name === 'string' && entry.name
            ? `name:${entry.name}`
            : group && Number.isFinite(entry.level)
              ? `level:${String(entry.level)}`
              : '';
        walk(field.of, item, `${path}[${named}]`);
      });
    else if (field.type === 'group' && held)
      for (const [key, sub] of Object.entries(field.fields)) walk(sub, recordOf(held)[key], `${path}.${key}`);
  };
  for (const [key, field] of Object.entries(schema)) walk(field, recordOf(value)[key], key);
  return [...spots];
}

/** Every role a config names, as `path=roleId`, with where it is named (`spotsOf`). */
export const roleSpots = (schema: Schema, value: unknown): string[] =>
  spotsOf(schema, value, (field, held) => (field.type === 'role' && held ? String(held) : null));

/** Every setting that mentions everyone, with where it stands (`spotsOf`). */
export const everyoneSpots = (schema: Schema, value: unknown): string[] =>
  spotsOf(schema, value, (field, held) => (field.type === 'enum' && held === 'everyone' ? 'everyone' : null));

/**
 * A config with each button's server emoji kept only while the server has it: Discord refuses a whole message for a
 * button whose emoji it cannot show.
 */
export function emojisWithin(schema: Schema, value: Settings, known: ReadonlySet<string>): Settings {
  return rewritten(schema, value, (field, held) =>
    field.type === 'message' && held && typeof held === 'object'
      ? {
          ...held,
          buttons: buttonEmojis(held).map(({ button, id }) =>
            id && !known.has(id) ? { ...button, emoji: '' } : button,
          ),
        }
      : held,
  );
}
