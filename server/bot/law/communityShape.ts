// The community modules' shapes: welcome, levels, role menus, tags and announcements.

import type { BotModule } from './modules.ts';
import { CHANNEL_KIND, type ChannelField, type ListField, type TextField } from './settings.ts';
import { messageField } from './message.ts';
import { GAME_SLOTS } from './gameShape.ts';

const KEY: TextField = {
  type: 'text',
  label: 'Name',
  help: 'Lower case letters, numbers and dashes.',
  max: 32,
  default: '',
  pattern: '[a-z0-9-]{1,32}',
  patternHelp: 'Use lower case letters, numbers and dashes.',
};
const text = (label: string, help?: string): ChannelField => ({
  type: 'channel',
  kinds: [CHANNEL_KIND.TEXT, CHANNEL_KIND.ANNOUNCEMENT],
  label,
  ...(help ? { help } : {}),
  default: '',
});
const colour = (label: string, hex: string): TextField => ({
  type: 'text',
  label,
  max: 7,
  default: hex,
  pattern: '#[0-9a-fA-F]{6}',
  patternHelp: 'Use a # and six hex digits.',
});
const roles = (label: string, max: number): ListField => ({
  type: 'list',
  label,
  max,
  default: [],
  of: { type: 'role', label: 'Role', default: '' },
});
/** The placeholders a message about one member may use: the member, the server and the member's game character. */
const MEMBER_SLOTS = ['user', 'name', 'server', 'count', 'avatar', 'server_icon', ...GAME_SLOTS];
/** How many channels one announcement is posted in at most. */
export const ANNOUNCE_CHANNELS_MAX = 10;

export const WELCOME_SHAPE: BotModule = {
  id: 'welcome',
  title: 'Welcome',
  blurb: 'Greets new members, says goodbye, and gives roles on joining.',
  group: 'Community',
  view: 'manager',
  edit: 'manager',
  schema: {
    joinChannel: text('Welcome channel'),
    joinMessage: messageField('Welcome message', {
      vars: [...MEMBER_SLOTS, 'welcome_card'],
      content: 'Welcome {user} to {server}! You are member {count}.',
    }),
    joinPing: { type: 'bool', label: 'Mention the new member', default: true },
    dmMessage: messageField('Direct message to new members', {
      help: 'Empty sends none.',
      vars: [...MEMBER_SLOTS, 'welcome_card'],
    }),
    leaveChannel: text('Goodbye channel'),
    leaveMessage: messageField('Goodbye message', { vars: MEMBER_SLOTS, content: '{name} left the server.' }),
    card: {
      type: 'group',
      label: 'Welcome card picture',
      help: 'Put {welcome_card} in an image link of a welcome message to show it. Save to see a change in the preview.',
      fields: {
        title: { type: 'text', label: 'Top line', max: 40, default: 'Welcome' },
        subtitle: {
          type: 'text',
          label: 'Bottom line',
          help: 'You can use {count} and {server}.',
          max: 80,
          default: 'Member #{count} of {server}',
        },
        accent: colour('Accent', '#d9a33c'),
        background: colour('Background', '#0e1a2e'),
      },
    },
    joinRoles: roles('Roles for new members', 10),
    botRoles: roles('Roles for new bots', 10),
    delayMinutes: {
      type: 'int',
      label: 'Give roles after (minutes)',
      help: "Members who must pass the server's rules screening get them once they pass.",
      min: 0,
      max: 1440,
      default: 0,
    },
  },
  actions: [{ id: 'test', label: 'Send a test welcome', level: 'manager', inputs: {} }],
};

export const LEVELS_SHAPE: BotModule = {
  id: 'levels',
  title: 'Levels',
  blurb: 'Experience for chatting and voice, levels with role rewards, /rank, and a leaderboard on the website.',
  group: 'Community',
  view: 'moderator',
  edit: 'manager',
  schema: {
    xpMin: { type: 'int', label: 'Least experience a message', min: 1, max: 100, default: 15 },
    xpMax: { type: 'int', label: 'Most experience a message', min: 1, max: 100, default: 25 },
    cooldownSeconds: { type: 'int', label: 'Seconds between messages that count', min: 0, max: 600, default: 60 },
    voiceXp: {
      type: 'int',
      label: 'Experience a minute in voice',
      help: 'Use 0 for none.',
      min: 0,
      max: 100,
      default: 10,
    },
    noXpChannels: {
      type: 'list',
      label: 'Channels that give no experience',
      max: 50,
      default: [],
      of: { type: 'channel', label: 'Channel', default: '' },
    },
    noXpRoles: roles('Roles that earn no experience', 20),
    boosts: {
      type: 'list',
      label: 'Roles that earn more',
      max: 20,
      default: [],
      of: {
        type: 'group',
        label: 'Boost',
        fields: {
          role: { type: 'role', label: 'Role', default: '' },
          percent: { type: 'int', label: 'Extra (percent)', min: 1, max: 500, default: 50 },
        },
      },
    },
    announce: {
      type: 'enum',
      label: 'Say a level-up',
      default: 'same',
      values: [
        { value: 'off', label: 'Nowhere' },
        { value: 'same', label: 'In the channel where it happened' },
        { value: 'channel', label: 'In the channel below' },
        { value: 'dm', label: 'In a direct message' },
      ],
    },
    announceChannel: text('Level-up channel'),
    levelUpPing: { type: 'bool', label: 'Mention the member in the post', default: true },
    levelMessage: messageField('Level-up message', {
      vars: ['user', 'name', 'level', 'server', 'avatar', ...GAME_SLOTS],
      content: '{user} reached level {level}!',
    }),
    rewards: {
      type: 'list',
      label: 'Role rewards',
      max: 50,
      default: [],
      of: {
        type: 'group',
        label: 'Reward',
        fields: {
          level: { type: 'int', label: 'At level', min: 1, max: 500, default: 5 },
          role: { type: 'role', label: 'Role', default: '' },
        },
      },
    },
    keepRewards: {
      type: 'bool',
      label: 'Keep earlier rewards',
      help: 'Off: a member holds only their highest reward.',
      default: true,
    },
    publicBoard: { type: 'bool', label: 'Show the leaderboard on the website', default: true },
  },
  views: [
    {
      id: 'board',
      title: 'Leaderboard',
      level: 'moderator',
      columns: [
        { key: 'rank', label: 'Rank' },
        { key: 'name', label: 'Member' },
        { key: 'level', label: 'Level' },
        { key: 'xp', label: 'Experience' },
        { key: 'messages', label: 'Messages' },
        { key: 'voice', label: 'Voice minutes' },
      ],
    },
  ],
  actions: [
    {
      id: 'give',
      label: 'Give or take experience',
      level: 'manager',
      perm: 'MANAGE_GUILD',
      inputs: {
        user: {
          ...KEY,
          label: 'Member (user id)',
          help: '',
          max: 20,
          pattern: '\\d{17,20}',
          patternHelp: 'A Discord user id.',
        },
        amount: { type: 'int', label: 'Amount (negative takes)', min: -1_000_000, max: 1_000_000, default: 100 },
      },
    },
    {
      id: 'reset',
      label: 'Reset a member',
      level: 'manager',
      perm: 'MANAGE_GUILD',
      confirm: "Reset this member's experience to nothing?",
      inputs: {
        user: {
          ...KEY,
          label: 'Member (user id)',
          help: '',
          max: 20,
          pattern: '\\d{17,20}',
          patternHelp: 'A Discord user id.',
        },
      },
    },
  ],
};

export const ROLEMENUS_SHAPE: BotModule = {
  id: 'rolemenus',
  title: 'Role menus',
  blurb: 'Buttons, a list or reactions that members use to pick their own roles.',
  group: 'Community',
  view: 'manager',
  edit: 'manager',
  schema: {
    menus: {
      type: 'list',
      label: 'Menus',
      max: 10,
      default: [],
      of: {
        type: 'group',
        label: 'Menu',
        fields: {
          name: KEY,
          channel: text('Channel'),
          title: { type: 'text', label: 'Title', max: 100, default: 'Pick your roles' },
          description: { type: 'text', label: 'Words', multiline: true, max: 1000, default: '' },
          style: {
            type: 'enum',
            label: 'Style',
            default: 'buttons',
            values: [
              { value: 'buttons', label: 'Buttons' },
              { value: 'select', label: 'A list' },
              { value: 'reactions', label: 'Reactions' },
            ],
          },
          mode: {
            type: 'enum',
            label: 'Picking',
            default: 'toggle',
            values: [
              { value: 'toggle', label: 'Any number, and take them back' },
              { value: 'unique', label: 'One at a time' },
              { value: 'keep', label: 'Once given, kept' },
            ],
          },
          options: {
            type: 'list',
            label: 'Roles offered',
            max: 25,
            default: [],
            of: {
              type: 'group',
              label: 'Role',
              fields: {
                role: { type: 'role', label: 'Role', default: '' },
                label: { type: 'text', label: 'Label', max: 80, default: '' },
                emoji: { type: 'text', label: 'Emoji', help: 'One emoji. Needed for reactions.', max: 64, default: '' },
              },
            },
          },
        },
      },
    },
  },
  actions: [
    { id: 'publish', label: 'Post or update a menu', level: 'manager', perm: 'MANAGE_ROLES', inputs: { name: KEY } },
  ],
};

export const TAGS_SHAPE: BotModule = {
  id: 'tags',
  title: 'Tags',
  blurb: 'Saved answers anyone can call up with !name or /tag: rules, links, FAQs.',
  group: 'Community',
  view: 'manager',
  edit: 'manager',
  schema: {
    prefix: {
      type: 'text',
      label: 'Prefix',
      help: 'What a tag starts with in chat. Empty: /tag only.',
      max: 3,
      default: '!',
    },
    tags: {
      type: 'list',
      label: 'Tags',
      max: 100,
      default: [],
      of: {
        type: 'group',
        label: 'Tag',
        fields: {
          name: KEY,
          reply: messageField('Answer', {
            vars: ['user', 'name', 'server', 'avatar', 'server_icon', ...GAME_SLOTS],
          }),
          roles: roles('Only these roles may use it (empty: everyone)', 10),
        },
      },
    },
  },
};

export const ANNOUNCE_SHAPE: BotModule = {
  id: 'announce',
  title: 'Announcements',
  blurb: 'Messages and cards sent now or on a schedule: once, every hour, day or week.',
  group: 'Community',
  view: 'manager',
  edit: 'manager',
  schema: {
    messages: {
      type: 'list',
      label: 'Announcements',
      max: 25,
      default: [],
      of: {
        type: 'group',
        label: 'Announcement',
        fields: {
          name: KEY,
          channels: {
            type: 'list',
            label: 'Channels',
            help: 'It is posted in each of them.',
            max: ANNOUNCE_CHANNELS_MAX,
            default: [],
            of: text('Channel'),
          },
          message: messageField('Message', { vars: ['server', 'server_icon'] }),
          mode: {
            type: 'enum',
            label: 'Each time it is sent',
            help: 'Editing keeps one message up to date, as for rules or a schedule. A mention pings only a new post.',
            default: 'new',
            values: [
              { value: 'new', label: 'Post a new message' },
              { value: 'edit', label: 'Edit the one it posted last' },
            ],
          },
          ping: {
            type: 'enum',
            label: 'Mention',
            default: 'none',
            values: [
              { value: 'none', label: 'No one' },
              { value: 'role', label: 'The role below' },
              { value: 'everyone', label: 'Everyone' },
            ],
          },
          role: { type: 'role', label: 'Role to mention', default: '' },
          repeat: {
            type: 'enum',
            label: 'Send',
            default: 'never',
            values: [
              { value: 'never', label: 'Only when I press Send' },
              { value: 'once', label: 'Once, at the time below' },
              { value: 'hourly', label: 'Every hour, at the minute below' },
              { value: 'daily', label: 'Every day, at the time below' },
              { value: 'weekly', label: 'Every week, on the day and time below' },
            ],
          },
          at: {
            type: 'text',
            label: 'Time (UTC)',
            help: 'HH:MM, or YYYY-MM-DD HH:MM for once.',
            max: 16,
            default: '12:00',
            pattern: '(\\d{4}-\\d{2}-\\d{2} )?\\d{2}:\\d{2}',
            patternHelp: 'Use HH:MM, or YYYY-MM-DD HH:MM.',
          },
          weekday: {
            type: 'enum',
            label: 'Day',
            default: '1',
            values: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(
              (day, index) => ({ value: String(index), label: day }),
            ),
          },
        },
      },
    },
  },
  actions: [{ id: 'send', label: 'Send now', level: 'manager', perm: 'MANAGE_GUILD', inputs: { name: KEY } }],
};
