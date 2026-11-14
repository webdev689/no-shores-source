import { startLand } from '../rules/landRules.ts';
import type { LandAnswer, LandRequest } from './landClient.ts';

/** The worker's own scope: the DOM library types the page's, so the two calls it needs are named here. */
const scope = globalThis as unknown as {
  addEventListener(type: 'message', listener: (event: MessageEvent<LandRequest>) => void): void;
  postMessage(message: LandAnswer, transfer: Transferable[]): void;
};

const land = fetch(`${import.meta.env.BASE_URL}land.wasm`)
  .then((answer) => answer.arrayBuffer())
  .then(startLand);

scope.addEventListener('message', (event) => {
  const { ticket, layoutText, id } = event.data;
  land
    .then((rules) => {
      const view = rules.open(layoutText, id);
      scope.postMessage({ ticket, view }, [view.heights.buffer, view.lakes.buffer]);
    })
    .catch((error: unknown) => {
      scope.postMessage({ ticket, error: error instanceof Error ? error.message : String(error) }, []);
    });
});
