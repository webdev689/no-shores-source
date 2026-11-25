// The game module's shape: a linked member's No Shores character in the bot's messages, and the words shown for a
// member whose Discord is linked to no account.

import type { BotModule } from './modules.ts';

/** The placeholders the game module fills, which a message about one member may use. */
export const GAME_SLOTS: readonly string[] = Object.freeze(['character', 'character_level', 'character_faction']);

export const GAME_SHAPE: BotModule = {
  id: 'game',
  title: 'No Shores',
  blurb: "A linked member's character in the bot's messages, and /link, which says how to link one.",
  group: 'Game',
  view: 'manager',
  edit: 'manager',
  schema: {
    notLinked: {
      type: 'text',
      label: 'Words for a member not linked',
      help: 'What {character}, {character_level} and {character_faction} show for a member who has not linked Discord in the game. Empty shows nothing.',
      max: 100,
      default: '',
    },
  },
};
