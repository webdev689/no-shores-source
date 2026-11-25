// The server layout as the panel shows it: a plan of what a build would do, and the build. It has no settings of its
// own: what it makes is the No Shores server's layout (`server/bot/layout/`).

import type { BotModule } from './modules.ts';

export const LAYOUT_SHAPE: BotModule = {
  id: 'layout',
  title: 'Server layout',
  blurb:
    "Builds the No Shores server: its roles, channels, settings and first messages, and the bot's modules set to " +
    'match. A build makes only what is missing, never undoes a change made by hand, and leaves a checklist in the ' +
    'staff channel of what only the owner can do.',
  group: 'Bot',
  view: 'manager',
  edit: 'owner',
  alwaysOn: true,
  schema: {},
  views: [
    {
      id: 'plan',
      title: 'What a build would do',
      level: 'manager',
      columns: [
        { key: 'part', label: 'Part' },
        { key: 'name', label: 'Name' },
        { key: 'state', label: 'What happens' },
      ],
    },
  ],
  actions: [
    {
      id: 'build',
      label: 'Build the No Shores layout',
      level: 'owner',
      inputs: {},
      confirm:
        'Build the No Shores layout in this server? It adds what is missing and sets what it owns, and changes ' +
        'nothing made or saved by hand.',
    },
  ],
};
