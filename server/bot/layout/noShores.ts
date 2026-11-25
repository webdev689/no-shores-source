// The No Shores Discord server as the layout builds it: its roles, its categories and channels in the order members
// see them, who may do what in each, and the server's own settings. The messages are in `messages.ts` and the
// modules' settings in `moduleSettings.ts`. Every word a member reads follows the website's: plain, short, and
// never a dash between clauses.

import type { PermissionName } from '../law/access.ts';

/** Discord's channel types the layout makes. */
export const CHANNEL_TYPE = Object.freeze({ text: 0, voice: 2, category: 4, announcement: 5, forum: 15 });
export type ChannelKind = keyof typeof CHANNEL_TYPE;

export interface LayoutRole {
  readonly key: string;
  readonly name: string;
  readonly colour: number;
  /** Shown apart in the member list. */
  readonly hoist: boolean;
  /** What the role adds to a member's own permissions. */
  readonly permissions: readonly PermissionName[];
}

/** Whom a channel's permissions name: everyone, the bot itself, or one of the layout's roles by its key. */
export type Who = 'everyone' | 'bot' | string;
export interface Overwrite {
  readonly who: Who;
  readonly allow?: readonly PermissionName[];
  readonly deny?: readonly PermissionName[];
}

export interface ForumTag {
  readonly name: string;
  readonly emoji: string;
  /** Only members who may manage threads (the moderators) put it on a post. */
  readonly moderated?: boolean;
}

export interface LayoutChannel {
  readonly key: string;
  readonly name: string;
  readonly kind: ChannelKind;
  /** The category's key; categories have none. */
  readonly parent?: string;
  readonly topic?: string;
  /** Seconds a member waits between messages. */
  readonly slowmode?: number;
  /** Laid over the category's: for whom a channel names, its own entry replaces the category's. */
  readonly overwrites?: readonly Overwrite[];
  readonly tags?: readonly ForumTag[];
  /** A forum's default reaction on each post. */
  readonly reaction?: string;
  /** Other names it is found by when there before the layout, such as the voice channel Discord starts a server with. */
  readonly also?: readonly string[];
}

export const ROLES: readonly LayoutRole[] = [
  { key: 'founder', name: 'Founder', colour: 0xffd36e, hoist: true, permissions: [] },
  {
    key: 'moderator',
    name: 'Moderator',
    colour: 0x6fb7d6,
    hoist: true,
    permissions: [
      'MANAGE_MESSAGES',
      'MANAGE_THREADS',
      'MODERATE_MEMBERS',
      'KICK_MEMBERS',
      'BAN_MEMBERS',
      'VIEW_AUDIT_LOG',
      'MOVE_MEMBERS',
      'MUTE_MEMBERS',
    ],
  },
  // Each house in its own gear's colour (content/gear/factions.json), given by the game module from a member's pledge.
  { key: 'stormcallers', name: 'Stormcallers', colour: 0x447cc0, hoist: true, permissions: [] },
  { key: 'lamplighters', name: 'Lamplighters', colour: 0xc49a69, hoist: true, permissions: [] },
  { key: 'veiled', name: 'The Veiled', colour: 0xa5a5ae, hoist: true, permissions: [] },
  { key: 'announcementPings', name: 'Announcement Pings', colour: 0, hoist: false, permissions: [] },
  { key: 'patchNotePings', name: 'Patch Note Pings', colour: 0, hoist: false, permissions: [] },
  { key: 'eventPings', name: 'Event Pings', colour: 0, hoist: false, permissions: [] },
];

/** Each house's role, by the faction's name as the game and the accounts give it. */
export const HOUSE_ROLES: Readonly<Record<string, string>> = {
  Stormcallers: 'stormcallers',
  Lamplighters: 'lamplighters',
  'The Veiled': 'veiled',
};

/** What the bot needs where members may not post: to post, and to keep its own messages tidy. */
const BOT_POSTS: readonly PermissionName[] = [
  'VIEW_CHANNEL',
  'SEND_MESSAGES',
  'EMBED_LINKS',
  'ATTACH_FILES',
  'READ_MESSAGE_HISTORY',
  'ADD_REACTIONS',
  'MENTION_EVERYONE',
  'MANAGE_MESSAGES',
];
const READ_ONLY: Overwrite = {
  who: 'everyone',
  deny: ['SEND_MESSAGES', 'ADD_REACTIONS', 'CREATE_PUBLIC_THREADS'],
};
/** Members read and react, but only the bot posts: news is answered with reactions, not replies. */
const NEWS: Overwrite = { who: 'everyone', deny: ['SEND_MESSAGES', 'CREATE_PUBLIC_THREADS'] };
const HIDDEN: Overwrite = { who: 'everyone', deny: ['VIEW_CHANNEL'] };
const STAFF_TALK: Overwrite = {
  who: 'moderator',
  allow: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'READ_MESSAGE_HISTORY', 'EMBED_LINKS', 'ATTACH_FILES'],
};
/** A log is the bot's to write and the staff's to read. */
const STAFF_READS: Overwrite = {
  who: 'moderator',
  allow: ['VIEW_CHANNEL', 'READ_MESSAGE_HISTORY'],
  deny: ['SEND_MESSAGES'],
};
const BOT: Overwrite = { who: 'bot', allow: BOT_POSTS };

export const CHANNELS: readonly LayoutChannel[] = [
  { key: 'startHere', name: 'Start here', kind: 'category', overwrites: [READ_ONLY, BOT] },
  {
    key: 'welcome',
    name: 'welcome',
    kind: 'text',
    parent: 'startHere',
    topic: 'How to play No Shores, where everything is, and the pings you can pick.',
  },
  {
    key: 'rules',
    name: 'rules',
    kind: 'text',
    parent: 'startHere',
    topic: 'The code of conduct. Everyone here has agreed to it.',
  },
  {
    key: 'announcements',
    name: 'announcements',
    kind: 'announcement',
    parent: 'startHere',
    topic: 'News for every captain. Pick Announcements in #welcome to be pinged.',
    overwrites: [NEWS],
  },
  {
    key: 'patchNotes',
    name: 'patch-notes',
    kind: 'announcement',
    parent: 'startHere',
    topic: 'Every update to the game, one post each. Pick Patch notes in #welcome to be pinged.',
    overwrites: [NEWS],
  },
  { key: 'community', name: 'Community', kind: 'category' },
  {
    key: 'general',
    name: 'general',
    kind: 'text',
    parent: 'community',
    topic: 'Talk about No Shores with other captains.',
  },
  {
    key: 'screenshots',
    name: 'screenshots',
    kind: 'text',
    parent: 'community',
    topic: 'Pictures and clips of your voyages. Talk about one in its thread.',
  },
  {
    key: 'lookingForGroup',
    name: 'looking-for-group',
    kind: 'text',
    parent: 'community',
    topic: "Find a crew for a dungeon, an event or the week's Abyss Dungeon. Say your level, the run and when.",
    slowmode: 30,
  },
  { key: 'feedback', name: 'Feedback and support', kind: 'category' },
  {
    key: 'bugReports',
    name: 'bug-reports',
    kind: 'forum',
    parent: 'feedback',
    topic:
      'One bug per post, titled with what went wrong. Say what you did, what you expected and what happened ' +
      'instead, with your browser and graphics card, and add a screenshot or a clip if you can. A moderator tags ' +
      'a post Known once it is logged and Fixed once the fix is out.',
    tags: [
      { name: 'Crash', emoji: '💥' },
      { name: 'Graphics', emoji: '🎨' },
      { name: 'Combat', emoji: '⚔️' },
      { name: 'Sailing', emoji: '⛵' },
      { name: 'Interface', emoji: '🧭' },
      { name: 'Sign-in', emoji: '🔑' },
      { name: 'Known', emoji: '📌', moderated: true },
      { name: 'Fixed', emoji: '✅', moderated: true },
    ],
    reaction: '👍',
  },
  {
    key: 'suggestions',
    name: 'suggestions',
    kind: 'text',
    parent: 'feedback',
    topic: 'Ideas for the game, one card each. Post yours with /suggest and vote with the thumbs.',
    overwrites: [READ_ONLY, BOT],
  },
  {
    key: 'support',
    name: 'support',
    kind: 'text',
    parent: 'feedback',
    topic: 'Open a private ticket with the staff: an account problem, a player to report, an exploit or an appeal.',
    overwrites: [READ_ONLY, BOT],
  },
  { key: 'voice', name: 'Voice', kind: 'category' },
  { key: 'lounge', name: 'Lounge', kind: 'voice', parent: 'voice', also: ['General'] },
  { key: 'makeRoom', name: 'Make a room', kind: 'voice', parent: 'voice' },
  {
    key: 'tickets',
    name: 'Tickets',
    kind: 'category',
    overwrites: [HIDDEN, STAFF_TALK, { who: 'bot', allow: [...BOT_POSTS, 'MANAGE_CHANNELS'] }],
  },
  { key: 'staffArea', name: 'Staff', kind: 'category', overwrites: [HIDDEN, STAFF_TALK, BOT] },
  {
    key: 'staff',
    name: 'staff',
    kind: 'text',
    parent: 'staffArea',
    topic: "Staff talk. Discord's notices for the server arrive here too.",
  },
  {
    key: 'modLog',
    name: 'mod-log',
    kind: 'text',
    parent: 'staffArea',
    topic: "Every warning, timeout, kick and ban, auto-mod's actions and raid alerts.",
    overwrites: [STAFF_READS],
  },
  {
    key: 'serverLog',
    name: 'server-log',
    kind: 'text',
    parent: 'staffArea',
    topic: 'Edited and deleted messages, joins and leaves, and changes to roles, channels and voice.',
    overwrites: [STAFF_READS],
  },
  {
    key: 'transcripts',
    name: 'ticket-transcripts',
    kind: 'text',
    parent: 'staffArea',
    topic: 'Each closed ticket, as a file.',
    overwrites: [STAFF_READS],
  },
];

/** The words a newcomer sees about the server, before they join and in Discord's welcome screen. */
export const SERVER_WORDS =
  'A pirate action RPG in a shared world. Captain your own ship and fight on land and at sea, right in your browser.';

/** The server's settings, by Discord's own numbers. */
export const SERVER = Object.freeze({
  /** A verified email and an account older than five minutes. */
  verificationLevel: 2,
  /** A new member is told of mentions only, not every message. */
  notifications: 1,
  /** Every member's uploads are scanned, not only new members'. */
  contentFilter: 2,
  /** Discord's own join messages are off (the welcome card says it) as are its setup tips; boosts are still told. */
  systemFlags: (1 << 0) | (1 << 2) | (1 << 3),
  systemChannel: 'general',
  rulesChannel: 'rules',
  updatesChannel: 'staff',
  safetyChannel: 'modLog',
  icon: 'https://noshores.online/art/server-icon.png',
});

/** Discord's welcome screen, shown to a newcomer of a Community server: five channels at most. */
export const WELCOME_SCREEN: readonly { channel: string; emoji: string; description: string }[] = [
  { channel: 'welcome', emoji: '🧭', description: 'How to play, and pick your pings' },
  { channel: 'rules', emoji: '📜', description: 'The code of conduct' },
  { channel: 'announcements', emoji: '📣', description: 'News from the No Shores team' },
  { channel: 'general', emoji: '⚓', description: 'Say hello to other captains' },
  { channel: 'lookingForGroup', emoji: '⚔️', description: 'Find a crew for your next run' },
];

/**
 * What the bot is invited with: what its modules use, and what the layout grants the moderators and denies members
 * where only the bot posts (a bot can only give or deny a permission it holds itself).
 */
export const BOT_PERMISSIONS: readonly PermissionName[] = [
  'KICK_MEMBERS',
  'BAN_MEMBERS',
  'MANAGE_CHANNELS',
  'MANAGE_GUILD',
  'ADD_REACTIONS',
  'VIEW_AUDIT_LOG',
  'VIEW_CHANNEL',
  'SEND_MESSAGES',
  'MANAGE_MESSAGES',
  'EMBED_LINKS',
  'ATTACH_FILES',
  'READ_MESSAGE_HISTORY',
  'MENTION_EVERYONE',
  'CONNECT',
  'MUTE_MEMBERS',
  'MOVE_MEMBERS',
  'MANAGE_ROLES',
  'MANAGE_THREADS',
  'CREATE_PUBLIC_THREADS',
  'SEND_MESSAGES_IN_THREADS',
  'MODERATE_MEMBERS',
];
