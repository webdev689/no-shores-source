// The bot's Worker as Cloudflare runs it: the routes and the clock of `worker.ts`, the Gateway, and the one question
// the accounts ask the bot by their service binding. Kept apart from `worker.ts`, which the tests import, as only the
// platform gives `cloudflare:workers`.

import { WorkerEntrypoint } from 'cloudflare:workers';
import { isDeveloper } from './modules/gameDevelopers.ts';
import worker, { type Env, workerContext } from './worker.ts';

export { BotGateway } from './worker.ts';

/** The accounts' question, reached only through their service binding, never from the web. */
export class Members extends WorkerEntrypoint<Env> {
  /** Whether a Discord user holds a developer's role (`gameDevelopers.ts`). */
  developer(userId: string): Promise<boolean> {
    return isDeveloper(workerContext(this.env, this.ctx, Date.now), String(userId));
  }
}

export default worker;
