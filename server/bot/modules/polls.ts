// Polls and suggestions. A poll is Discord's own, so Discord counts it and shows the result. A suggestion is a card
// with two reactions to vote by and two buttons staff press to take it or decline it; the card itself carries its
// state, so nothing is stored.

import { escapeText } from '../law/message.ts';
import { type Settings, recordOf } from '../law/settings.ts';
import {
  BOT_PREFIX,
  type BotContext,
  type Interaction,
  type InteractionReply,
  NO_PINGS,
  REPLY,
  embed,
  holds,
  optionOf,
  postTo,
  privateReply,
} from '../kit.ts';
import type { Outcome } from './giveaways.ts';
import type { ServerModule } from './module.ts';

const MANAGE_MESSAGES = 1n << 13n;
/** The longest Discord keeps a poll open. */
export const POLL_HOURS_MAX = 768;

/** What a poll is posted with. */
export interface PollAsk {
  readonly question: string;
  readonly answers: string;
  readonly hours: number;
  readonly many: boolean;
}

/** Post one of Discord's polls. Answers come one a line, or split by `;` or `|`. */
export async function postPoll(context: BotContext, channelId: string, ask: PollAsk): Promise<Outcome> {
  const answers = ask.answers
    .split(/[\n;|]/)
    .map((answer) => answer.trim())
    .filter(Boolean)
    .slice(0, 10);
  if (!ask.question.trim()) return { ok: false, message: 'Ask a question.' };
  if (answers.length < 2) return { ok: false, message: 'Give two to ten answers.' };
  const posted = await postTo(context.rest, channelId, {
    poll: {
      question: { text: ask.question.trim().slice(0, 300) },
      answers: answers.map((answer) => ({ poll_media: { text: answer.slice(0, 55) } })),
      duration: Math.max(1, Math.min(POLL_HOURS_MAX, Math.round(ask.hours))),
      allow_multiselect: ask.many,
    },
  });
  return posted
    ? { ok: true, message: 'The poll is up.' }
    : { ok: false, message: 'The bot could not post a poll there. It needs Send Polls.' };
}

const statusCard = (status: string, marker: string) =>
  status === 'taken'
    ? { color: 0x2c7341, line: `Taken by ${marker}.` }
    : { color: 0xb91309, line: `Declined by ${marker}.` };

async function onPoll(context: BotContext, interaction: Interaction): Promise<InteractionReply> {
  if (!holds(interaction.member?.permissions, MANAGE_MESSAGES))
    return privateReply('You need Manage Messages for polls.');
  const done = await postPoll(context, String(interaction.channel_id), {
    question: String(optionOf(interaction, 'question') ?? ''),
    answers: String(optionOf(interaction, 'answers') ?? ''),
    hours: Number(optionOf(interaction, 'hours') ?? 24),
    many: optionOf(interaction, 'many') === true,
  });
  return privateReply(done.message);
}

async function onSuggest(context: BotContext, interaction: Interaction, config: Settings): Promise<InteractionReply> {
  const user = interaction.member?.user ?? {};
  const idea = String(optionOf(interaction, 'idea') ?? '').trim();
  if (!idea) return privateReply('Write your idea.');
  const channel = String(config.channel ?? '');
  if (!channel) return privateReply('Suggestions have no channel yet. Ask a manager to choose one.');
  const posted = await postTo(context.rest, channel, {
    embeds: [
      embed({
        title: 'Suggestion',
        description: escapeText(idea).slice(0, 3000),
        footer: `From ${user.global_name || user.username || 'a member'} (${String(user.id)})`,
      }),
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 3, label: 'Take it', custom_id: `${BOT_PREFIX}suggest:taken` },
          { type: 2, style: 4, label: 'Decline', custom_id: `${BOT_PREFIX}suggest:declined` },
        ],
      },
    ],
  });
  if (!posted) return privateReply('The bot could not post in the suggestions channel.');
  for (const emoji of ['👍', '👎'])
    await context.rest.put(
      `/channels/${channel}/messages/${String(posted.id)}/reactions/${encodeURIComponent(emoji)}/@me`,
      undefined,
    );
  return privateReply('Your suggestion is posted.');
}

/** Staff take or decline a suggestion; the card changes for everyone. */
async function onMark(
  context: BotContext,
  interaction: Interaction,
  words: readonly string[],
): Promise<InteractionReply> {
  if (!holds(interaction.member?.permissions, MANAGE_MESSAGES))
    return privateReply('Only staff can mark a suggestion.');
  const shown = recordOf(recordOf(interaction).message).embeds;
  const before = recordOf(Array.isArray(shown) ? shown[0] : undefined);
  const user = interaction.member?.user ?? {};
  const status = statusCard(words[0] ?? '', escapeText(user.global_name || user.username || 'staff'));
  return {
    type: REPLY.UPDATE,
    data: {
      embeds: [{ ...before, color: status.color, fields: [{ name: 'Status', value: status.line }] }],
      components: [],
      allowed_mentions: NO_PINGS,
    },
  };
}

export const pollsModule: ServerModule = {
  id: 'polls',
  commands: [
    {
      name: 'poll',
      description: 'Start a poll in this channel',
      type: 1,
      contexts: [0],
      default_member_permissions: String(MANAGE_MESSAGES),
      options: [
        { type: 3, name: 'question', description: 'The question', required: true, max_length: 300 },
        { type: 3, name: 'answers', description: 'Two to ten answers, split by ;', required: true, max_length: 600 },
        {
          type: 4,
          name: 'hours',
          description: 'Open for how many hours',
          required: false,
          min_value: 1,
          max_value: POLL_HOURS_MAX,
        },
        { type: 5, name: 'many', description: 'Allow more than one answer', required: false },
      ],
    },
  ],
  command: onPoll,
  actions: {
    start: (context, guildId, input) =>
      input.channel
        ? postPoll(context, String(input.channel), {
            question: String(input.question ?? ''),
            answers: String(input.answers ?? ''),
            hours: Number(input.hours),
            many: !!input.many,
          })
        : Promise.resolve({ ok: false, message: 'Choose a channel.' }),
  },
};

export const suggestModule: ServerModule = {
  id: 'suggest',
  commands: [
    {
      name: 'suggest',
      description: 'Suggest an idea',
      type: 1,
      contexts: [0],
      options: [{ type: 3, name: 'idea', description: 'Your idea', required: true, max_length: 2000 }],
    },
  ],
  command: onSuggest,
  component: onMark,
};
