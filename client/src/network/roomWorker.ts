// The rooms for playing alone, run off the game's frame: each opened, told and ticked as the game's thread says
// (`roomThread.ts`), through `roomServe.ts`.
import { type FromRooms, serveRooms, type ToRooms } from './roomServe.ts';

/** The worker's own scope: the DOM library types the page's, so the two calls it needs are named here. */
const scope = globalThis as unknown as {
  addEventListener(type: 'message', listener: (event: MessageEvent<ToRooms>) => void): void;
  postMessage(message: FromRooms): void;
};

const serve = serveRooms((said) => scope.postMessage(said));
scope.addEventListener('message', (event) => serve(event.data));
