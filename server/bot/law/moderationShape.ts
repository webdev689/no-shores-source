// The moderation module's settings, the tables the panel shows, and the acts it offers, read by the bot and the panel.

import type { BotModule } from './modules.ts';
import { CHANNEL_KIND, type TextField } from './settings.ts';

const USER: TextField = {
  type: 'text',
  label: 'Member (user id)',
  max: 20,
  default: '',
  pattern: '\\d{17,20}',
  patternHelp: 'A Discord user id.',
};
const REASON: TextField = { type: 'text', label: 'Reason', max: 400, default: '' };
const DURATION: TextField = {
  type: 'text',
  label: 'For how long',
  help: 'Such as 10m, 2h, 7d or 1w.',
  max: 12,
  default: '',
  pattern: '(\\d{1,6}[smhdw])+',
  patternHelp: 'Use a number and a unit, such as 10m, 2h or 7d.',
};

export const MODERATION_SHAPE: BotModule = {
  id: 'moderation',
  title: 'Moderation',
  blurb: 'Warn, time out, kick and ban, with numbered cases, a log channel and automatic steps for repeat warnings.',
  group: 'Moderation',
  view: 'moderator',
  edit: 'manager',
  schema: {
    logChannel: {
      type: 'channel',
      kinds: [CHANNEL_KIND.TEXT],
      label: 'Case log channel',
      help: 'Every case is posted here.',
      default: '',
    },
    dmMembers: {
      type: 'bool',
      label: 'Tell members by direct message',
      help: 'The member is told what was done and why.',
      default: true,
    },
    requireReason: { type: 'bool', label: 'A reason is required', default: false },
    warnDays: {
      type: 'int',
      label: 'Warnings count for (days)',
      help: 'Older warnings stop counting. Use 0 to keep them forever.',
      min: 0,
      max: 365,
      default: 30,
    },
    steps: {
      type: 'list',
      label: 'Automatic steps for warnings',
      help: 'When a member reaches this many warnings, the bot does this.',
      max: 10,
      default: [],
      of: {
        type: 'group',
        label: 'Step',
        fields: {
          warnings: { type: 'int', label: 'Warnings', min: 1, max: 50, default: 3 },
          action: {
            type: 'enum',
            label: 'Then',
            default: 'timeout',
            values: [
              { value: 'timeout', label: 'Time out' },
              { value: 'kick', label: 'Kick' },
              { value: 'ban', label: 'Ban' },
            ],
          },
          minutes: {
            type: 'int',
            label: 'For (minutes)',
            help: 'For a time-out or a ban. Use 0 for a ban with no end.',
            min: 0,
            max: 40_320,
            default: 60,
          },
        },
      },
    },
  },
  views: [
    {
      id: 'cases',
      title: 'Cases',
      level: 'moderator',
      columns: [
        { key: 'caseNo', label: 'Case' },
        { key: 'action', label: 'Action' },
        { key: 'user', label: 'Member' },
        { key: 'mod', label: 'By' },
        { key: 'reason', label: 'Reason' },
        { key: 'when', label: 'When' },
      ],
    },
    {
      id: 'bans',
      title: 'Bans',
      level: 'moderator',
      columns: [
        { key: 'user', label: 'Member' },
        { key: 'reason', label: 'Reason' },
      ],
    },
  ],
  actions: [
    { id: 'warn', label: 'Warn', level: 'moderator', perm: 'MODERATE_MEMBERS', inputs: { user: USER, reason: REASON } },
    {
      id: 'timeout',
      label: 'Time out',
      level: 'moderator',
      perm: 'MODERATE_MEMBERS',
      inputs: { user: USER, duration: { ...DURATION, default: '10m' }, reason: REASON },
    },
    {
      id: 'untimeout',
      label: 'End time-out',
      level: 'moderator',
      perm: 'MODERATE_MEMBERS',
      inputs: { user: USER, reason: REASON },
    },
    {
      id: 'kick',
      label: 'Kick',
      level: 'moderator',
      perm: 'KICK_MEMBERS',
      confirm: 'Kick this member?',
      inputs: { user: USER, reason: REASON },
    },
    {
      id: 'ban',
      label: 'Ban',
      level: 'moderator',
      perm: 'BAN_MEMBERS',
      confirm: 'Ban this member?',
      inputs: {
        user: USER,
        duration: { ...DURATION, label: 'For how long (empty: no end)' },
        reason: REASON,
      },
    },
    { id: 'unban', label: 'Unban', level: 'moderator', perm: 'BAN_MEMBERS', inputs: { user: USER, reason: REASON } },
    {
      id: 'note',
      label: 'Add a note',
      level: 'moderator',
      perm: 'MODERATE_MEMBERS',
      inputs: { user: USER, reason: { ...REASON, label: 'Note' } },
    },
    {
      id: 'unwarn',
      label: 'Remove a warning',
      level: 'moderator',
      perm: 'MODERATE_MEMBERS',
      inputs: { caseNo: { type: 'int', label: 'Case number', min: 1, max: 1_000_000, default: 1 } },
    },
  ],
};
