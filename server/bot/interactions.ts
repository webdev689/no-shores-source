// Discord's interactions: every slash command, button press, menu choice and form the application receives. The bot
// checks Discord's signature over the exact bytes it was sent, and hands each one to the module that owns it.

import { moduleOf } from './law/modules.ts';
import { panelUrl } from './auth.ts';
import { discordSigned } from './crypto.ts';
import { fail, json, readCapped } from './http.ts';
import {
  BOT_PREFIX,
  type BotContext,
  type Interaction,
  type InteractionReply,
  REPLY,
  TYPE,
  privateReply,
} from './kit.ts';
import type { Registry } from './registry.ts';

/** Discord's interactions are small; anything past this is not one. */
export const INTERACTION_MAX = 32 * 1024;
export const INTERACTION_PATH = '/v1/discord/interactions';
const UNKNOWN = 'That is not something this bot knows yet.';

/** POST /v1/discord/interactions. */
export async function interactionRoute(
  context: BotContext & { readonly nowS: number; readonly registry: Registry },
  request: Request,
): Promise<Response> {
  if (request.method !== 'POST') return fail('method', 405);
  const bytes = await readCapped(request, INTERACTION_MAX);
  if (!bytes) return fail('too-large', 413);
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  const key = String(context.vars.DISCORD_PUBLIC_KEY ?? '');
  if (!key) return fail('not-set-up', 503, {}, 'DISCORD_PUBLIC_KEY is not set.');
  if (!(await discordSigned(key, bytes, signature, timestamp, context.nowS))) return fail('signature', 401);
  let interaction: unknown;
  try {
    interaction = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return fail('body', 400);
  }
  if (!interaction || typeof interaction !== 'object') return fail('body', 400);
  const given = interaction as Interaction;
  if (given.type === TYPE.PING) return json({ type: REPLY.PONG });
  return json(await answer(context, given));
}

/** The answer to one interaction: `/panel` the bot's own, everything else its module's where the module is on. */
async function answer(
  context: BotContext & { readonly registry: Registry },
  interaction: Interaction,
): Promise<InteractionReply> {
  const isCommand = interaction.type === TYPE.COMMAND || interaction.type === TYPE.AUTOCOMPLETE;
  const guildId = String(interaction.guild_id ?? '');
  if (isCommand && interaction.data?.name === 'panel') {
    const panel = panelUrl(context.vars);
    if (!panel) return privateReply('The panel is not set up yet.');
    if (/^\d{5,25}$/.test(guildId)) panel.hash = `g=${guildId}`;
    return privateReply('Sign in with Discord to manage the bot for this server.', [
      { type: 1, components: [{ type: 2, style: 5, label: 'Open the panel', url: panel.toString() }] },
    ]);
  }
  const customId = String(interaction.data?.custom_id ?? '');
  const isPress = interaction.type === TYPE.COMPONENT || interaction.type === TYPE.MODAL;
  if (isPress && !customId.startsWith(BOT_PREFIX)) return privateReply(UNKNOWN);
  const words = isCommand ? [] : customId.slice(BOT_PREFIX.length).split(':');
  const owner = isCommand
    ? context.registry.commandOwner(String(interaction.data?.name ?? ''))
    : context.registry.byId(words[0] ?? '');
  if (!owner || !/^\d{5,25}$/.test(guildId)) return privateReply(UNKNOWN);
  const found = await context.config(guildId, owner.id);
  if (!found?.enabled) {
    const title = moduleOf(owner.id)?.title ?? owner.id;
    return privateReply(`${title} is off in this server. A manager can turn it on in the panel.`);
  }
  if (isCommand && owner.command) return owner.command(context, interaction, found.config);
  if (isPress && owner.component) return owner.component(context, interaction, words.slice(1), found.config);
  return privateReply(UNKNOWN);
}
