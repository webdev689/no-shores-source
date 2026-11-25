// How the layout sets the bot's modules in the No Shores server: which are on, and their settings, with the channels
// and roles named by the ids the build found or made. Every setting is checked against the module's own law before
// it is saved, as a save from the panel is.

import type { Settings } from '../law/settings.ts';
import { HOUSE_ROLES } from './noShores.ts';
import {
  BRASS,
  type Ids,
  TICKET_OPEN_TEXT,
  TICKET_PANEL_TEXT,
  firstPatchNotes,
  guideMessage,
  joinMessage,
  openingNews,
  rulesMessage,
  tags,
} from './messages.ts';

export interface ModulePlan {
  readonly id: string;
  readonly enabled: boolean;
  /** Only the settings the layout chooses; the rest keep the module's defaults. */
  readonly config: Settings;
}

/** The announcements the build posts itself, by name; the others wait in the panel for the owner to send. */
export const POSTED_ANNOUNCEMENTS = ['welcome-guide', 'code-of-conduct'] as const;
export const PING_MENU = 'pings';

/** Sites a member may link to without auto-mod stepping in. */
const ALLOWED_SITES = ['noshores.online', 'youtube.com', 'youtu.be', 'twitch.tv'];

/** Modules the layout leaves off: each is one switch in the panel when the server wants it. */
export const LEFT_OFF = ['giveaways', 'starboard', 'birthdays', 'stats', 'socials'] as const;

export function modulePlans(ids: Ids): readonly ModulePlan[] {
  const channel = ids.channel;
  const role = ids.role;
  const staffChannels = ['staff', 'modLog', 'serverLog', 'transcripts'].map(channel).filter(Boolean);
  const staffRoles = ['founder', 'moderator'].map(role).filter(Boolean);
  const announcement = (name: string, where: string, message: Settings, ping = '') => ({
    name,
    channels: [channel(where)].filter(Boolean),
    message,
    mode: ping ? 'new' : 'edit',
    ping: ping ? 'role' : 'none',
    role: ping ? role(ping) : '',
    repeat: 'never',
  });
  return [
    {
      id: 'core',
      enabled: true,
      config: {
        problemsChannel: channel('modLog'),
        accent: BRASS,
        panelGrants: role('moderator') ? [{ role: role('moderator'), level: 'moderator' }] : [],
      },
    },
    {
      id: 'moderation',
      enabled: true,
      config: {
        logChannel: channel('modLog'),
        dmMembers: true,
        requireReason: true,
        warnDays: 30,
        steps: [
          { warnings: 3, action: 'timeout', minutes: 60 },
          { warnings: 5, action: 'kick', minutes: 0 },
        ],
      },
    },
    {
      id: 'logs',
      enabled: true,
      config: {
        messageChannel: channel('serverLog'),
        memberChannel: channel('serverLog'),
        voiceChannel: channel('serverLog'),
        serverChannel: channel('serverLog'),
        ignoreChannels: staffChannels,
        ignoreBots: true,
      },
    },
    {
      id: 'automod',
      enabled: true,
      config: {
        alertChannel: channel('modLog'),
        slurs: true,
        sexual: true,
        spam: true,
        mentionLimit: 6,
        invites: 'warn',
        links: 'warn',
        allowedSites: ALLOWED_SITES,
        caps: 'delete',
        emoji: 'delete',
        flood: 'timeout',
        repeats: 'delete',
        timeoutMinutes: 10,
        exemptRoles: staffRoles,
        exemptChannels: staffChannels,
      },
    },
    {
      id: 'antiraid',
      enabled: true,
      config: {
        alertChannel: channel('modLog'),
        joinCount: 10,
        joinSeconds: 30,
        raidMinutes: 15,
        raidAction: 'timeout',
        raiseVerification: true,
        minAccountDays: 1,
        youngAction: 'alert',
      },
    },
    {
      id: 'welcome',
      enabled: true,
      config: { joinChannel: channel('general'), joinMessage: joinMessage(ids), joinPing: true },
    },
    { id: 'levels', enabled: true, config: { announce: 'off', publicBoard: true } },
    {
      id: 'rolemenus',
      enabled: true,
      config: {
        menus: [
          {
            name: PING_MENU,
            channel: channel('welcome'),
            title: 'Pick your pings',
            description: 'Choose what you want to hear about. Press a button again to stop.',
            style: 'buttons',
            mode: 'toggle',
            options: [
              { role: role('announcementPings'), label: 'Announcements', emoji: '📣' },
              { role: role('patchNotePings'), label: 'Patch notes', emoji: '📜' },
              { role: role('eventPings'), label: 'Events', emoji: '⚓' },
            ].filter((option) => option.role),
          },
        ],
      },
    },
    { id: 'tags', enabled: true, config: { tags: tags(ids) } },
    {
      id: 'announce',
      enabled: true,
      config: {
        messages: [
          announcement('welcome-guide', 'welcome', { ...guideMessage(ids) }),
          announcement('code-of-conduct', 'rules', { ...rulesMessage(ids) }),
          announcement('news', 'announcements', { ...openingNews(ids) }, 'announcementPings'),
          announcement('patch-notes', 'patchNotes', { ...firstPatchNotes() }, 'patchNotePings'),
        ],
      },
    },
    { id: 'polls', enabled: true, config: {} },
    { id: 'suggest', enabled: true, config: { channel: channel('suggestions') } },
    {
      id: 'tickets',
      enabled: true,
      config: {
        category: channel('tickets'),
        staffRoles: [role('moderator')].filter(Boolean),
        logChannel: channel('transcripts'),
        panelChannel: channel('support'),
        panelTitle: 'Need help?',
        panelText: TICKET_PANEL_TEXT,
        openText: TICKET_OPEN_TEXT,
        maxOpen: 1,
      },
    },
    {
      id: 'tempvoice',
      enabled: true,
      config: { hub: channel('makeRoom'), category: channel('voice'), name: "{name}'s crew", limit: 0 },
    },
    { id: 'invites', enabled: true, config: {} },
    {
      id: 'game',
      enabled: true,
      config: {
        houses: Object.entries(HOUSE_ROLES)
          .map(([faction, key]) => ({ faction, role: role(key) }))
          .filter((house) => house.role),
      },
    },
  ];
}
