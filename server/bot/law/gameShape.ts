// The game module's shape: a linked member's No Shores character in the bot's messages, the words shown for a
// member whose Discord is linked to no account, the role each house's members hold, and the roles a developer holds.

import book from '../../../content/gear/factions.json' with { type: 'json' };
import type { BotModule } from './modules.ts';

/** The placeholders the game module fills, which a message about one member may use. */
export const GAME_SLOTS: readonly string[] = Object.freeze(['character', 'character_level', 'character_faction']);

/** The houses a player pledges to, by the names the accounts answer. */
const HOUSES = book.factions.map((faction) => ({ value: faction.name, label: faction.name }));

export const GAME_SHAPE: BotModule = {
  id: 'game',
  title: 'No Shores',
  blurb:
    "A linked member's character in the bot's messages, their house's role, and /link, which says how to link one.",
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
    houses: {
      type: 'list',
      label: 'House roles',
      help: "The bot gives each linked member their house's role, and takes it back when they switch house or unlink.",
      max: HOUSES.length,
      default: [],
      unique: 'faction',
      of: {
        type: 'group',
        label: 'House role',
        fields: {
          faction: { type: 'enum', label: 'House', values: HOUSES, default: HOUSES[0]?.value ?? '' },
          role: { type: 'role', use: 'give', label: 'Role', default: '' },
        },
      },
    },
    developers: {
      type: 'list',
      label: 'Developer roles',
      help: "A linked member holding one of these roles is a developer: the game's character screen offers them the Test Room.",
      max: 5,
      default: [],
      of: { type: 'role', use: 'name', label: 'Role', default: '' },
    },
  },
};
