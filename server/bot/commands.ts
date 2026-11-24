// Every slash command the application has, declared in code: the bot's own `/panel` and each module's. Whatever
// writes the list to Discord writes this whole list, so a command added here appears there and one removed is gone.

import { REGISTRY, type Registry } from './registry.ts';

const MANAGE_MESSAGES = String(1 << 13);

/** /panel: a private link to the bot's panel for this server. */
export const PANEL_COMMAND = Object.freeze({
  name: 'panel',
  description: "Open the bot's panel for this server",
  type: 1,
  // A door's look, not its lock: the panel itself checks each person's level.
  default_member_permissions: MANAGE_MESSAGES,
  contexts: [0],
});

/** The bot's commands, its own first. */
export const commandsOf = (registry: Registry = REGISTRY): readonly { readonly name: string }[] =>
  Object.freeze([PANEL_COMMAND, ...registry.commands]);
