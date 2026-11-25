// The panel's test of a message: the message as the composer holds it, filled with the person's own name and this
// server's, sent to them by direct message or posted in one of this server's text channels. A test pings no one, goes
// to the audit log, and a person may send only a few a minute.

import { type Level, atLeast } from './law/access.ts';
import { type BotModule, moduleOf } from './law/modules.ts';
import { LINK_SLOTS, messageField, messagePayload, payloadEmpty } from './law/message.ts';
import { type Field, type Schema, type Settings, referencedIds, validate } from './law/settings.ts';
import type { PanelUser } from './auth.ts';
import { fail, json, readJson } from './http.ts';
import { directMessage, postTo } from './kit.ts';
import type { PanelContext } from './panel.ts';
import { type SlotUser, slotsFor } from './slots.ts';
import { type Snapshot, readConfig } from './store.ts';

/** How many tests one person may send in one server a minute. */
export const TESTS_A_MINUTE = 6;
/** What a test's level placeholder says, where a real post says the level reached. */
export const TEST_LEVEL = '5';
/** A test is sent as the person sees it: every link placeholder any message may use is filled for them. */
const TEST_SCHEMA: Schema = Object.freeze({ message: messageField('Test', { vars: [...LINK_SLOTS] }) });
/** The channel kinds a test may be posted in: text and announcement channels. */
const POSTABLE = new Set([0, 5]);

/** A button can show only an emoji the bot can: this server's own. */
export const EMOJI_REFUSAL = "A button's emoji is not one of this server's own.";
/** The first of `ids` that is not one of the server's emoji, or null. */
export const emojiOutside = (snapshot: Snapshot, ids: readonly string[]): string | null => {
  const own = new Set(snapshot.emojis.map((emoji) => emoji.id));
  return ids.find((id) => !own.has(id)) ?? null;
};

/** Every placeholder a module's message settings may use. */
export function messageVarsOf(schema: Schema): Set<string> {
  const found = new Set<string>();
  const walk = (field: Field) => {
    if (field.type === 'message') field.vars.forEach((name) => found.add(name));
    else if (field.type === 'list') walk(field.of);
    else if (field.type === 'group') Object.values(field.fields).forEach(walk);
  };
  Object.values(schema).forEach(walk);
  return found;
}

/** The signed-in person as a Discord user, for placeholders about them. */
const personOf = (user: PanelUser): SlotUser => ({
  id: user.id,
  username: user.username,
  global_name: user.globalName,
  avatar: user.avatar,
});

/**
 * What a module page's previews fill the placeholders only the bot can with, for the person signed in: the welcome
 * card's address, where the module that draws it is in. `config` is the module's settings as just read or saved, so a
 * card drawn after a save shows the new look.
 */
export async function messagePreview(
  context: PanelContext,
  snapshot: Snapshot,
  shape: BotModule,
  user: PanelUser,
  config: Settings | undefined,
): Promise<Record<string, string>> {
  if (!messageVarsOf(shape.schema).has('welcome_card')) return {};
  const fresh: Record<string, Settings> = config ? { [shape.id]: config } : {};
  const filled = await slotsFor(
    context.bot,
    snapshot.guildId,
    personOf(user),
    '{welcome_card}',
    {},
    fresh,
    context.registry,
  );
  return filled.welcome_card ? { cardUrl: filled.welcome_card } : {};
}

/** POST .../test-message {module, message, to}: `to` is 'me' or one of this server's text channels. */
export async function testMessage(
  context: PanelContext,
  request: Request,
  snapshot: Snapshot,
  level: Level,
  user: PanelUser,
): Promise<Response> {
  const { cors, database } = context;
  const body = await readJson(request);
  const shape = moduleOf(String(body?.module ?? ''));
  if (!shape) return fail('module', 404, cors);
  if (!atLeast(level, shape.edit)) return fail('level', 403, cors, 'Your level cannot change this module.');
  const checked = validate(TEST_SCHEMA, { message: body?.message });
  if (!checked.ok) return json({ error: 'invalid', errors: checked.errors }, 400, cors);
  const strange = emojiOutside(snapshot, referencedIds(TEST_SCHEMA, checked.value).emojis);
  if (strange) return json({ error: 'emoji', emoji: strange, message: EMOJI_REFUSAL }, 403, cors);
  const to = String(body?.to ?? 'me');
  const channel = to === 'me' ? null : snapshot.channels.find((one) => one.id === to && POSTABLE.has(one.type));
  if (to !== 'me' && !channel)
    return fail('channel', 403, cors, 'A test can go to you, or to a text channel of this server.');
  const message = checked.value.message;
  const welcome = (await readConfig(database, snapshot.guildId, 'welcome', snapshot))?.config;
  const fresh: Record<string, Settings> = welcome ? { welcome } : {};
  const extra = { level: TEST_LEVEL };
  const vars = await slotsFor(context.bot, snapshot.guildId, personOf(user), message, extra, fresh, context.registry);
  const payload = messagePayload(message, vars, context.nowMs);
  if (payloadEmpty(payload)) return fail('empty', 400, cors, 'The message is empty.');
  // the test's audit row is its place in the minute: written only while there is room, in one statement, so tests
  // pressed together cannot all see room
  const claim = await database
    .prepare(
      `INSERT INTO audit_log (guild_id, at, actor_id, actor_name, source, action, target, detail)
       SELECT ?, ?, ?, ?, 'panel', 'message.test', ?, ?
       WHERE (SELECT COUNT(*) FROM audit_log
              WHERE guild_id = ? AND actor_id = ? AND action = 'message.test' AND at > ?) < ?`,
    )
    .bind(
      snapshot.guildId,
      context.nowS,
      user.id,
      String(user.globalName || user.username).slice(0, 100),
      channel ? channel.id : 'dm',
      JSON.stringify({ module: shape.id, ok: false }),
      snapshot.guildId,
      user.id,
      context.nowS - 60,
      TESTS_A_MINUTE,
    )
    .run();
  if (claim.meta.changes !== 1) return fail('rate', 429, cors, 'That is enough tests for a minute. Try again shortly.');
  const sent = channel
    ? (await postTo(context.rest, channel.id, payload)) !== null
    : await directMessage(context.rest, user.id, payload);
  if (!sent) {
    const why = channel
      ? `The bot could not post in #${channel.name}.`
      : 'Discord did not deliver it. Your direct messages may be closed to this server.';
    return fail('discord', 502, cors, why);
  }
  await database
    .prepare('UPDATE audit_log SET detail = ? WHERE id = ?')
    .bind(JSON.stringify({ module: shape.id, ok: true }), claim.meta.last_row_id)
    .run();
  const done = channel ? `A test was posted in #${channel.name}.` : 'A test was sent to you by direct message.';
  return json({ ok: true, message: done }, 200, cors);
}
