// The server layout: the panel's plan and build (`../layout/`).

import { build, planRows } from '../layout/build.ts';
import type { ServerModule } from './module.ts';

export const layoutModule: ServerModule = {
  id: 'layout',
  views: { plan: (context, guildId) => planRows(context, guildId) },
  actions: {
    async build(context, guildId, _input, actor) {
      const done = await build(context, guildId, actor);
      return { ok: done.ok, message: done.message };
    },
  },
};
