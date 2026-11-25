// Tags: saved answers called up with the prefix in chat (!rules) or with /tag, whose name list Discord fills in as the
// member types. A tag can be kept to some roles.

import { messagePayload, payloadEmpty } from '../law/message.ts';
import { type Settings, recordOf } from '../law/settings.ts';
import { type BotContext, type Interaction, REPLY, TYPE, optionOf, postTo, privateReply, publicReply } from '../kit.ts';
import { type SlotUser, slotsFor } from '../slots.ts';
import type { ServerModule } from './module.ts';

type Tag = { readonly name: string; readonly reply: unknown; readonly roles: readonly string[] };

const tagsOf = (config: Settings) => (config.tags ?? []) as Tag[];
const tagNamed = (config: Settings, name: string) => tagsOf(config).find((tag) => tag.name === name.toLowerCase());
const allowed = (tag: Tag, roles: readonly string[]) =>
  !tag.roles.filter(Boolean).length || roles.some((role) => tag.roles.includes(role));

/** The message a tag answers with, for the member who called it. */
export const tagMessage = async (context: BotContext, guildId: string, tag: Tag, user: SlotUser) =>
  messagePayload(tag.reply, await slotsFor(context, guildId, user, tag.reply), context.now());

const events: ServerModule['events'] = {
  async MESSAGE_CREATE(context, data, config) {
    const author = recordOf(data.author);
    const prefix = String(config.prefix ?? '');
    if (!prefix || author.bot || !data.member) return;
    const content = String(data.content ?? '');
    if (!content.startsWith(prefix)) return;
    const name = content.slice(prefix.length).split(/\s/)[0] ?? '';
    const tag = name ? tagNamed(config, name) : undefined;
    const roles = ((recordOf(data.member).roles ?? []) as unknown[]).map(String);
    if (!tag || !allowed(tag, roles)) return;
    const payload = await tagMessage(context, String(data.guild_id), tag, author);
    if (payloadEmpty(payload)) return;
    await postTo(context.rest, String(data.channel_id), {
      ...payload,
      message_reference: { message_id: String(data.id), fail_if_not_exists: false },
    });
  },
};

/** /tag, and the names Discord offers while it is typed. */
async function onCommand(context: BotContext, interaction: Interaction, config: Settings) {
  const typed = String(optionOf(interaction, 'name') ?? '');
  if (interaction.type === TYPE.AUTOCOMPLETE) {
    const choices = tagsOf(config)
      .filter((tag) => tag.name.includes(typed.toLowerCase()))
      .slice(0, 25)
      .map((tag) => ({ name: tag.name, value: tag.name }));
    return { type: REPLY.CHOICES, data: { choices } };
  }
  const tag = tagNamed(config, typed);
  if (!tag) return privateReply('There is no tag by that name.');
  if (!allowed(tag, (interaction.member?.roles ?? []).map(String)))
    return privateReply('Your roles cannot use that tag.');
  const payload = await tagMessage(context, String(interaction.guild_id), tag, interaction.member?.user ?? {});
  return payloadEmpty(payload) ? privateReply('That tag has no answer yet.') : publicReply({ ...payload });
}

export const tagsModule: ServerModule = {
  id: 'tags',
  commands: [
    {
      name: 'tag',
      description: 'Show a saved answer',
      type: 1,
      contexts: [0],
      options: [{ type: 3, name: 'name', description: 'Which', required: true, autocomplete: true, max_length: 32 }],
    },
  ],
  command: onCommand,
  events,
};
