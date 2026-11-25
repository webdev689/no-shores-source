// The raid guard's settings: what counts as a raid, what raid mode does, and what happens to very new accounts.

import type { BotModule } from './modules.ts';
import { CHANNEL_KIND } from './settings.ts';

export const ANTIRAID_SHAPE: BotModule = {
  id: 'antiraid',
  title: 'Raid guard',
  blurb: 'Notices a wave of joins, turns on raid mode for a while, and deals with brand-new accounts.',
  group: 'Moderation',
  view: 'moderator',
  edit: 'manager',
  schema: {
    alertChannel: { type: 'channel', kinds: [CHANNEL_KIND.TEXT], label: 'Alert channel', default: '' },
    joinCount: { type: 'int', label: 'A raid is this many joins', min: 3, max: 100, default: 10 },
    joinSeconds: { type: 'int', label: 'Within (seconds)', min: 5, max: 600, default: 30 },
    raidMinutes: { type: 'int', label: 'Raid mode lasts (minutes)', min: 1, max: 1440, default: 15 },
    raidAction: {
      type: 'enum',
      label: 'In raid mode, members who join are',
      default: 'kick',
      values: [
        { value: 'alert', label: 'Only reported' },
        { value: 'timeout', label: 'Timed out for the raid' },
        { value: 'kick', label: 'Kicked' },
      ],
    },
    raiseVerification: {
      type: 'bool',
      label: 'Raise verification in raid mode',
      help: 'New members must have a verified phone until raid mode ends. The bot needs Manage Server.',
      default: true,
    },
    minAccountDays: {
      type: 'int',
      label: 'New account age (days)',
      help: 'Accounts younger than this are dealt with below. Use 0 to leave them alone.',
      min: 0,
      max: 365,
      default: 0,
    },
    youngAction: {
      type: 'enum',
      label: 'New accounts are',
      default: 'alert',
      values: [
        { value: 'alert', label: 'Only reported' },
        { value: 'timeout', label: 'Timed out for a day' },
        { value: 'kick', label: 'Kicked' },
      ],
    },
  },
  actions: [
    {
      id: 'start',
      label: 'Start raid mode',
      level: 'moderator',
      perm: 'KICK_MEMBERS',
      confirm: 'Start raid mode now?',
      inputs: { minutes: { type: 'int', label: 'For (minutes)', min: 1, max: 1440, default: 15 } },
    },
    { id: 'end', label: 'End raid mode', level: 'moderator', perm: 'KICK_MEMBERS', inputs: {} },
  ],
};
