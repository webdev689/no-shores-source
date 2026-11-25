// Starting designs for a message setting. The composer offers only those whose placeholders the setting can fill, and
// a template replaces the message as one step the person can undo.
import { blankEmbed, slotsUsed } from '../../../server/bot/law/message.ts';
import type { SavedMessage } from '../../../server/bot/law/settings.ts';
import { OUTSIDE } from '../siteMap.ts';

const PLAY = { label: 'Play No Shores', emoji: '', url: OUTSIDE.play ?? '' };

export interface Template {
  readonly id: string;
  readonly label: string;
  readonly message: SavedMessage;
}

export const STARTERS: readonly Template[] = Object.freeze([
  {
    id: 'welcome-card',
    label: 'Welcome with a card picture',
    message: {
      content: '{user}',
      embeds: [
        blankEmbed({
          color: '#ffd36e',
          title: 'Welcome to {server}!',
          description: 'You are member **{count}**. Read the rules, then say hello.',
          image: '{welcome_card}',
        }),
      ],
      buttons: [PLAY],
    },
  },
  {
    id: 'welcome',
    label: 'Welcome',
    message: {
      content: '',
      embeds: [
        blankEmbed({
          color: '#ffd36e',
          authorName: '{name} joined',
          authorIcon: '{avatar}',
          description: 'Welcome {user}! You are member **{count}** of {server}.',
          thumbnail: '{avatar}',
          timestamp: true,
        }),
      ],
      buttons: [],
    },
  },
  {
    id: 'rules',
    label: 'Server rules',
    message: {
      content: '',
      embeds: [
        blankEmbed({
          color: '#8a2a1c',
          title: 'The rules of {server}',
          description:
            '1. Be kind to everyone.\n2. No spam or adverts.\n3. Keep each channel to its topic.\n4. Follow the moderators.',
          footer: 'Breaking a rule can end in a time-out or a ban.',
        }),
      ],
      buttons: [],
    },
  },
  {
    id: 'patch',
    label: 'Patch notes',
    message: {
      content: '',
      embeds: [
        blankEmbed({
          color: '#34507a',
          title: 'Patch notes',
          description: "## What's new\n- \n## Fixes\n- ",
          footer: '{server}',
          timestamp: true,
        }),
      ],
      buttons: [PLAY],
    },
  },
  {
    id: 'event',
    label: 'Event',
    message: {
      content: '',
      embeds: [
        blankEmbed({
          color: '#2f5d5a',
          title: 'Event: ',
          description: 'What, and who it is for.',
          fields: [
            { name: 'When', value: 'Use Insert time to add one.', inline: true },
            { name: 'Where', value: '', inline: true },
          ],
        }),
      ],
      buttons: [],
    },
  },
  {
    id: 'level',
    label: 'Level up',
    message: {
      content: '',
      embeds: [
        blankEmbed({ color: '#d99a36', description: '{user} reached **level {level}**!', thumbnail: '{avatar}' }),
      ],
      buttons: [],
    },
  },
  {
    id: 'birthday',
    label: 'Birthday',
    message: {
      content: '',
      embeds: [blankEmbed({ color: '#ffd36e', title: 'Happy birthday!', description: 'Have a good day, {user}.' })],
      buttons: [],
    },
  },
]);

/** The templates a setting can use: those whose every placeholder it fills. */
export const templatesFor = (vars: readonly string[]): Template[] =>
  STARTERS.filter((starter) => [...slotsUsed(starter.message)].every((slot) => vars.includes(slot)));
