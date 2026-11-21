// Builds the sea's islands off the page's frame: each plan and its ground through the room module the page sends
// first, as `islePlanner` builds them on the page.
import { islePlanner } from './islePlans.ts';
import type { IslePlanAnswer, IslePlanAsk } from './islePlans.ts';

/** The worker's own scope: the DOM library types the page's, so the two calls it needs are named here. */
const scope = globalThis as unknown as {
  addEventListener(type: 'message', listener: (event: MessageEvent<IslePlanAsk>) => void): void;
  postMessage(message: IslePlanAnswer, transfer: Transferable[]): void;
};

let planner: ReturnType<typeof islePlanner> | null = null;

scope.addEventListener('message', (event) => {
  const ask = event.data;
  if ('module' in ask) {
    planner = islePlanner(ask.module);
    return;
  }
  try {
    if (!planner) throw new Error('no room module was sent');
    const built = planner(ask.seed, ask.climate, ask.at);
    scope.postMessage({ ticket: ask.ticket, built }, built ? [built.heights.buffer] : []);
  } catch (error) {
    scope.postMessage({ ticket: ask.ticket, error: error instanceof Error ? error.message : String(error) }, []);
  }
});
