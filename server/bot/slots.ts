// The values a message's placeholders are filled with: the member and the server, and whatever a module fills
// itself (its `slots`), asked for only when the message names one of them.

import { avatarUrl, serverIconUrl, slotsUsed } from './law/message.ts';
import type { Settings } from './law/settings.ts';
import type { BotContext } from './kit.ts';
import { REGISTRY, type Registry } from './registry.ts';
import type { Snapshot } from './store.ts';

/** A Discord user, as an event or the panel's sign-in names one. */
export interface SlotUser {
  readonly id?: unknown;
  readonly username?: unknown;
  readonly global_name?: unknown;
  readonly avatar?: unknown;
  readonly discriminator?: unknown;
}

/** The placeholder values a message about one member fills in, as plain text: the message law escapes them. */
export const memberVars = (snapshot: Snapshot | null, user: SlotUser): Record<string, string> => ({
  user: `<@${String(user.id)}>`,
  name: String(user.global_name || user.username || user.id || 'Member'),
  server: snapshot?.name || 'the server',
  count: (snapshot?.memberCount ?? 0).toLocaleString('en'),
  avatar: avatarUrl(user),
  server_icon: serverIconUrl(snapshot?.guildId, snapshot?.icon),
});

/**
 * Every value `message` names, for this member in this server, with `extra` (a level, say) over the member's own.
 * `fresh` holds a module's settings where the caller has just read or saved them, by module id.
 */
export async function slotsFor(
  context: BotContext,
  guildId: string,
  user: SlotUser,
  message: unknown,
  extra: Readonly<Record<string, string>> = {},
  fresh: Readonly<Record<string, Settings>> = {},
  registry: Registry = REGISTRY,
): Promise<Record<string, string>> {
  const vars = { ...memberVars(await context.snapshot(guildId), user), ...extra };
  const used = slotsUsed(message);
  for (const shape of registry.modules) {
    const source = shape.slots;
    if (!source?.names.some((name) => used.has(name))) continue;
    Object.assign(vars, await source.fill(context, guildId, user, vars, fresh[shape.id]));
  }
  return vars;
}
