// The auto-mod module's settings: Discord's own AutoMod rules the bot keeps in step, and the bot's own filters on
// what Discord's rules cannot see.

import type { BotModule } from './modules.ts';
import { CHANNEL_KIND, type EnumField } from './settings.ts';

const reaction = (label: string, help: string): EnumField => ({
  type: 'enum',
  label,
  help,
  default: 'off',
  values: [
    { value: 'off', label: 'Off' },
    { value: 'delete', label: 'Delete the message' },
    { value: 'warn', label: 'Delete and warn' },
    { value: 'timeout', label: 'Delete and time out' },
  ],
});

export const AUTOMOD_SHAPE: BotModule = {
  id: 'automod',
  title: 'Auto-mod',
  blurb:
    'Blocked words, spam, mass mentions, invites, links, capitals, emoji and floods, handled before staff see them.',
  group: 'Moderation',
  view: 'moderator',
  edit: 'manager',
  schema: {
    alertChannel: {
      type: 'channel',
      kinds: [CHANNEL_KIND.TEXT],
      label: 'Alert channel',
      help: 'Where the bot and Discord say what they stopped.',
      default: '',
    },
    words: {
      type: 'list',
      label: 'Blocked words',
      help: 'Discord blocks these before anyone sees them. Use * as a wildcard, such as *badword*.',
      max: 100,
      default: [],
      of: { type: 'text', label: 'Word', max: 60, default: '' },
    },
    profanity: { type: 'bool', label: "Block Discord's list of profanity", default: false },
    sexual: { type: 'bool', label: "Block Discord's list of sexual words", default: false },
    slurs: { type: 'bool', label: "Block Discord's list of slurs", default: true },
    spam: { type: 'bool', label: 'Block messages Discord marks as spam', default: true },
    mentionLimit: {
      type: 'int',
      label: 'Most mentions in one message',
      help: 'More is blocked, and the sender timed out. Use 0 for no limit.',
      min: 0,
      max: 50,
      default: 8,
    },
    invites: reaction('Server invites', 'Invite links to other Discord servers.'),
    links: reaction('Links', 'Links to sites not on the list below.'),
    allowedSites: {
      type: 'list',
      label: 'Sites links may go to',
      help: 'Such as noshores.online. Its subdomains count too.',
      max: 50,
      default: [],
      of: {
        type: 'text',
        label: 'Site',
        max: 100,
        default: '',
        pattern: '[a-z0-9.-]+\\.[a-z]{2,}',
        patternHelp: 'A site name such as example.com.',
      },
    },
    caps: reaction('Capitals', 'Long messages mostly in capitals.'),
    capsPercent: { type: 'int', label: 'Capitals share (percent)', min: 50, max: 100, default: 70 },
    emoji: reaction('Emoji', 'Messages with many emoji.'),
    emojiMax: { type: 'int', label: 'Most emoji in one message', min: 3, max: 50, default: 10 },
    flood: reaction('Flooding', 'Many messages in a short time.'),
    floodCount: { type: 'int', label: 'Messages', min: 3, max: 30, default: 6 },
    floodSeconds: { type: 'int', label: 'Within (seconds)', min: 2, max: 60, default: 8 },
    repeats: reaction('Repeats', 'The same message three times in half a minute.'),
    timeoutMinutes: { type: 'int', label: 'Time-out length (minutes)', min: 1, max: 1440, default: 10 },
    exemptRoles: {
      type: 'list',
      label: 'Roles auto-mod leaves alone',
      max: 20,
      default: [],
      of: { type: 'role', use: 'name', label: 'Role', default: '' },
    },
    exemptChannels: {
      type: 'list',
      label: 'Channels auto-mod leaves alone',
      max: 50,
      default: [],
      of: { type: 'channel', label: 'Channel', default: '' },
    },
  },
};
