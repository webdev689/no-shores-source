// The bot's modules as the panel lists them: each one's name, what it does, who may change it, and the shape of its
// settings. The bot reads the same list to validate a save, so a module added here appears in the panel and is
// enforced by the bot together.

import type { Level, PermissionName } from './access.ts';
import { CHANNEL_KIND, type Schema } from './settings.ts';
import { DEFAULT_COLOUR } from './message.ts';
import { MODERATION_SHAPE } from './moderationShape.ts';
import { LOGS_SHAPE } from './logsShape.ts';
import { AUTOMOD_SHAPE } from './automodShape.ts';
import { ANTIRAID_SHAPE } from './antiraidShape.ts';
import { GAME_SHAPE } from './gameShape.ts';
import { ANNOUNCE_SHAPE, LEVELS_SHAPE, ROLEMENUS_SHAPE, TAGS_SHAPE, WELCOME_SHAPE } from './communityShape.ts';
import {
  BIRTHDAYS_SHAPE,
  GIVEAWAYS_SHAPE,
  INVITES_SHAPE,
  POLLS_SHAPE,
  SOCIALS_SHAPE,
  STARBOARD_SHAPE,
  STATS_SHAPE,
  SUGGEST_SHAPE,
  TEMPVOICE_SHAPE,
  TICKETS_SHAPE,
} from './engagementShape.ts';

/** A table the panel shows. */
export interface ModuleView {
  readonly id: string;
  readonly title: string;
  readonly level: Level;
  readonly columns: ReadonlyArray<{ readonly key: string; readonly label: string }>;
}
/** An act the panel offers: its form's `inputs`, the level and the Discord permission (`perm`) it needs. */
export interface ModuleAction {
  readonly id: string;
  readonly label: string;
  readonly level: Level;
  readonly inputs: Schema;
  readonly perm?: PermissionName;
  readonly confirm?: string;
}
/** `view` and `edit` are the panel levels that may see and change the module; `alwaysOn` has no off switch. */
export interface BotModule {
  readonly id: string;
  readonly title: string;
  readonly blurb: string;
  readonly group: 'Bot' | 'Moderation' | 'Community' | 'Engagement' | 'Game';
  readonly view: Level;
  readonly edit: Level;
  readonly alwaysOn?: boolean;
  readonly schema: Schema;
  readonly views?: readonly ModuleView[];
  readonly actions?: readonly ModuleAction[];
}

/** The bot's own settings: who opens the panel, and where the bot reports its own problems. */
export const CORE_SHAPE: BotModule = {
  id: 'core',
  title: 'Bot settings',
  blurb: 'Who can open this panel, and where the bot reports its own problems.',
  group: 'Bot',
  view: 'manager',
  edit: 'owner',
  alwaysOn: true,
  schema: {
    panelGrants: {
      type: 'list',
      label: 'Panel access by role',
      help: 'Members with one of these roles can open the panel at the level you choose.',
      max: 20,
      default: [],
      of: {
        type: 'group',
        label: 'Grant',
        fields: {
          role: { type: 'role', label: 'Role', default: '' },
          level: {
            type: 'enum',
            label: 'Level',
            default: 'viewer',
            values: [
              { value: 'viewer', label: 'Viewer: can see settings and logs' },
              { value: 'moderator', label: 'Moderator: can act on members' },
              { value: 'manager', label: 'Manager: can change settings' },
            ],
          },
        },
      },
    },
    problemsChannel: {
      type: 'channel',
      kinds: [CHANNEL_KIND.TEXT],
      label: 'Bot problems channel',
      help: 'The bot posts here when it lacks a permission or Discord refuses it.',
      default: '',
    },
    accent: {
      type: 'text',
      label: 'Card colour',
      help: `The edge colour of the bot's cards, such as ${DEFAULT_COLOUR}.`,
      max: 7,
      default: DEFAULT_COLOUR,
      pattern: '#[0-9a-fA-F]{6}',
      patternHelp: `Use a # and six hex digits, such as ${DEFAULT_COLOUR}.`,
    },
  },
};

export const BOT_MODULES: readonly BotModule[] = Object.freeze([
  MODERATION_SHAPE,
  LOGS_SHAPE,
  AUTOMOD_SHAPE,
  ANTIRAID_SHAPE,
  WELCOME_SHAPE,
  LEVELS_SHAPE,
  ROLEMENUS_SHAPE,
  TAGS_SHAPE,
  ANNOUNCE_SHAPE,
  GIVEAWAYS_SHAPE,
  POLLS_SHAPE,
  STARBOARD_SHAPE,
  TICKETS_SHAPE,
  SUGGEST_SHAPE,
  BIRTHDAYS_SHAPE,
  TEMPVOICE_SHAPE,
  INVITES_SHAPE,
  STATS_SHAPE,
  SOCIALS_SHAPE,
  GAME_SHAPE,
  CORE_SHAPE,
]);

export const moduleOf = (id: string): BotModule | null => BOT_MODULES.find((shape) => shape.id === id) ?? null;
