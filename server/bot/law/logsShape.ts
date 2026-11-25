// The logs module's settings: which channel hears which kind of event, and what it never logs.

import type { BotModule } from './modules.ts';
import { CHANNEL_KIND, type ChannelField } from './settings.ts';

const logChannel = (label: string, help: string): ChannelField => ({
  type: 'channel',
  kinds: [CHANNEL_KIND.TEXT],
  label,
  help,
  default: '',
});

export const LOGS_SHAPE: BotModule = {
  id: 'logs',
  title: 'Logs',
  blurb: 'Edited and deleted messages, joins and leaves, role and nickname changes, voice moves and server changes.',
  group: 'Moderation',
  view: 'moderator',
  edit: 'manager',
  schema: {
    messageChannel: logChannel(
      'Messages',
      'Edited and deleted messages. The bot keeps their words for a week to show them.',
    ),
    memberChannel: logChannel('Members', 'Joins, leaves, nicknames and roles.'),
    voiceChannel: logChannel('Voice', 'Joining, leaving and moving between voice channels.'),
    serverChannel: logChannel('Server', 'Channels and roles made or deleted, and bans made outside the bot.'),
    ignoreChannels: {
      type: 'list',
      label: 'Channels never logged',
      max: 50,
      default: [],
      of: { type: 'channel', label: 'Channel', default: '' },
    },
    ignoreBots: { type: 'bool', label: "Leave out bots' messages", default: true },
  },
};
