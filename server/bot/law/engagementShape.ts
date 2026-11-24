// The engagement modules' shapes: giveaways, polls, starboard, tickets, suggestions, birthdays, voice rooms, invites,
// stat channels and feeds.

import type { BotModule } from './modules.ts';
import { CHANNEL_KIND, type ChannelField, type IntField, type ListField, type TextField } from './settings.ts';
import { messageField } from './message.ts';

const text = (label: string, help?: string): ChannelField => ({
  type: 'channel',
  kinds: [CHANNEL_KIND.TEXT, CHANNEL_KIND.ANNOUNCEMENT],
  label,
  ...(help ? { help } : {}),
  default: '',
});
const roles = (label: string): ListField => ({
  type: 'list',
  label,
  max: 10,
  default: [],
  of: { type: 'role', label: 'Role', default: '' },
});
const DURATION: TextField = {
  type: 'text',
  label: 'For how long',
  help: 'Such as 1h, 2d or 1w.',
  max: 12,
  default: '1d',
  pattern: '(\\d{1,6}[smhdw])+',
  patternHelp: 'Use a number and a unit, such as 1h or 2d.',
};
const NUMBER_INPUT: IntField = { type: 'int', label: 'Number', min: 1, max: 1_000_000_000, default: 1 };

export const GIVEAWAYS_SHAPE: BotModule = {
  id: 'giveaways',
  title: 'Giveaways',
  blurb: 'Timed giveaways members enter with a button, with winners drawn fairly and rerolls on demand.',
  group: 'Engagement',
  view: 'moderator',
  edit: 'manager',
  schema: {
    channel: text('Default channel', 'Where /giveaway posts when no channel is named.'),
    pingWinners: { type: 'bool', label: 'Mention the winners', default: true },
  },
  views: [
    {
      id: 'list',
      title: 'Giveaways',
      level: 'moderator',
      columns: [
        { key: 'id', label: 'Number' },
        { key: 'prize', label: 'Prize' },
        { key: 'entries', label: 'Entries' },
        { key: 'state', label: 'State' },
        { key: 'winners', label: 'Winners' },
      ],
    },
  ],
  actions: [
    {
      id: 'start',
      label: 'Start a giveaway',
      level: 'manager',
      perm: 'MANAGE_GUILD',
      inputs: {
        prize: { type: 'text', label: 'Prize', max: 200, default: '' },
        duration: DURATION,
        winners: { type: 'int', label: 'Winners', min: 1, max: 20, default: 1 },
        channel: text('Channel', 'Empty: the default channel.'),
        role: { type: 'role', label: 'Only members with this role may enter', default: '' },
      },
    },
    { id: 'end', label: 'End a giveaway now', level: 'manager', perm: 'MANAGE_GUILD', inputs: { id: NUMBER_INPUT } },
    { id: 'reroll', label: 'Draw new winners', level: 'manager', perm: 'MANAGE_GUILD', inputs: { id: NUMBER_INPUT } },
  ],
};

export const POLLS_SHAPE: BotModule = {
  id: 'polls',
  title: 'Polls',
  blurb: "Discord's own polls, from /poll or the panel.",
  group: 'Engagement',
  view: 'moderator',
  edit: 'manager',
  schema: {},
  actions: [
    {
      id: 'start',
      label: 'Start a poll',
      level: 'moderator',
      perm: 'MANAGE_MESSAGES',
      inputs: {
        channel: text('Channel'),
        question: { type: 'text', label: 'Question', max: 300, default: '' },
        answers: {
          type: 'text',
          label: 'Answers',
          help: 'Two to ten, one a line.',
          multiline: true,
          max: 600,
          default: '',
        },
        hours: { type: 'int', label: 'Open for (hours)', min: 1, max: 768, default: 24 },
        many: { type: 'bool', label: 'Members may choose more than one', default: false },
      },
    },
  ],
};

export const STARBOARD_SHAPE: BotModule = {
  id: 'starboard',
  title: 'Starboard',
  blurb: 'Messages with enough stars are shown again in a channel of their own.',
  group: 'Engagement',
  view: 'manager',
  edit: 'manager',
  schema: {
    channel: text('Starboard channel'),
    emoji: { type: 'text', label: 'Emoji that counts', max: 64, default: '⭐' },
    threshold: { type: 'int', label: 'Stars needed', min: 1, max: 100, default: 3 },
    selfStar: { type: 'bool', label: "Count the author's own star", default: false },
    ignoreChannels: {
      type: 'list',
      label: 'Channels never shown',
      max: 50,
      default: [],
      of: { type: 'channel', label: 'Channel', default: '' },
    },
  },
};

export const TICKETS_SHAPE: BotModule = {
  id: 'tickets',
  title: 'Tickets',
  blurb: 'A button that opens a private channel between a member and staff, with a transcript kept on closing.',
  group: 'Engagement',
  view: 'moderator',
  edit: 'manager',
  schema: {
    category: { type: 'channel', kinds: [CHANNEL_KIND.CATEGORY], label: 'Category for ticket channels', default: '' },
    staffRoles: roles('Staff who see every ticket'),
    logChannel: text('Transcript channel', "A closed ticket's messages are posted here as a file."),
    panelChannel: text('Channel for the Open a ticket button'),
    panelTitle: { type: 'text', label: 'Button card title', max: 100, default: 'Need help?' },
    panelText: {
      type: 'text',
      label: 'Button card words',
      multiline: true,
      max: 1000,
      default: 'Press the button to open a private ticket with the staff.',
    },
    openText: {
      type: 'text',
      label: 'First message in a ticket',
      help: 'You can use {user}.',
      multiline: true,
      max: 1000,
      default: 'Hello {user}. Tell us what you need, and staff will answer here.',
    },
    maxOpen: { type: 'int', label: 'Open tickets a member may have', min: 1, max: 5, default: 1 },
  },
  views: [
    {
      id: 'open',
      title: 'Tickets',
      level: 'moderator',
      columns: [
        { key: 'id', label: 'Number' },
        { key: 'user', label: 'Member' },
        { key: 'state', label: 'State' },
        { key: 'when', label: 'Opened' },
      ],
    },
  ],
  actions: [
    { id: 'post', label: 'Post the Open a ticket button', level: 'manager', perm: 'MANAGE_CHANNELS', inputs: {} },
  ],
};

export const SUGGEST_SHAPE: BotModule = {
  id: 'suggest',
  title: 'Suggestions',
  blurb: 'Members post ideas with /suggest; others vote, and staff mark them taken or not.',
  group: 'Engagement',
  view: 'moderator',
  edit: 'manager',
  schema: { channel: text('Suggestions channel') },
};

export const BIRTHDAYS_SHAPE: BotModule = {
  id: 'birthdays',
  title: 'Birthdays',
  blurb: 'Members set their birthday; the bot wishes them well and gives a role for the day.',
  group: 'Engagement',
  view: 'manager',
  edit: 'manager',
  schema: {
    channel: text('Birthday channel'),
    message: messageField('Message', {
      help: 'The member is mentioned before it when Mention the member is on.',
      vars: ['user', 'name', 'server', 'avatar'],
      embeds: [{ color: '#d9a33c', description: 'Happy birthday, {user}!' }],
    }),
    role: { type: 'role', label: 'Role for the day', default: '' },
    hour: { type: 'int', label: 'Hour to wish them (UTC)', min: 0, max: 23, default: 9 },
    pingMember: { type: 'bool', label: 'Mention the member', default: true },
  },
};

export const TEMPVOICE_SHAPE: BotModule = {
  id: 'tempvoice',
  title: 'Voice rooms',
  blurb: 'Joining one voice channel makes a member their own room, deleted when it empties.',
  group: 'Engagement',
  view: 'manager',
  edit: 'manager',
  schema: {
    hub: { type: 'channel', kinds: [CHANNEL_KIND.VOICE], label: 'Join this channel to get a room', default: '' },
    category: { type: 'channel', kinds: [CHANNEL_KIND.CATEGORY], label: 'Category for rooms', default: '' },
    name: { type: 'text', label: 'Room name', help: 'You can use {name}.', max: 90, default: "{name}'s room" },
    limit: {
      type: 'int',
      label: 'Most members a room holds',
      help: 'Use 0 for no limit.',
      min: 0,
      max: 99,
      default: 0,
    },
  },
};

export const INVITES_SHAPE: BotModule = {
  id: 'invites',
  title: 'Invites',
  blurb: "Who invited whom: each join's invite, and /invites to count them. The bot needs Manage Server.",
  group: 'Engagement',
  view: 'moderator',
  edit: 'manager',
  schema: { channel: text('Join report channel', 'Each join and the invite it used. Empty: counted only.') },
  views: [
    {
      id: 'top',
      title: 'Top inviters',
      level: 'moderator',
      columns: [
        { key: 'inviter', label: 'Member' },
        { key: 'joins', label: 'Joins' },
      ],
    },
  ],
};

export const STATS_SHAPE: BotModule = {
  id: 'stats',
  title: 'Stat channels',
  blurb: 'Channel names that show live numbers, such as the member count. Updated every ten minutes.',
  group: 'Engagement',
  view: 'manager',
  edit: 'manager',
  schema: {
    counters: {
      type: 'list',
      label: 'Counters',
      max: 5,
      default: [],
      of: {
        type: 'group',
        label: 'Counter',
        fields: {
          channel: { type: 'channel', kinds: [CHANNEL_KIND.VOICE, CHANNEL_KIND.TEXT], label: 'Channel', default: '' },
          name: {
            type: 'text',
            label: 'Name',
            help: 'You can use {members}, {roles} and {channels}.',
            max: 90,
            default: 'Members: {members}',
          },
        },
      },
    },
  },
};

export const SOCIALS_SHAPE: BotModule = {
  id: 'socials',
  title: 'Feeds',
  blurb: 'New YouTube videos and posts from any RSS or Atom feed, posted as they appear.',
  group: 'Engagement',
  view: 'manager',
  edit: 'manager',
  schema: {
    feeds: {
      type: 'list',
      label: 'Feeds',
      max: 20,
      default: [],
      of: {
        type: 'group',
        label: 'Feed',
        fields: {
          kind: {
            type: 'enum',
            label: 'Kind',
            default: 'youtube',
            values: [
              { value: 'youtube', label: 'A YouTube channel' },
              { value: 'rss', label: 'An RSS or Atom feed' },
            ],
          },
          source: {
            type: 'text',
            label: 'YouTube channel id, or feed link',
            help: 'A channel id starts with UC.',
            max: 300,
            default: '',
          },
          channel: text('Post in'),
          message: {
            type: 'text',
            label: 'Message',
            help: 'You can use {title} and {link}.',
            max: 500,
            default: 'New: {title}\n{link}',
          },
          role: { type: 'role', label: 'Role to mention', default: '' },
        },
      },
    },
  },
};
