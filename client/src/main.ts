// The game's page: one canvas, handed to the game's own thread to draw on (`gameWorker.ts`), and the page's side of
// it, which keeps what only a page has (`thread/pageHost.ts`).
import { PageHost } from './thread/pageHost.ts';
import { stopped } from './ui/page.ts';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('index.html has no <canvas id="game">');

if (typeof canvas.transferControlToOffscreen !== 'function') {
  stopped('This browser cannot draw the game from a thread of its own. Try a current Chrome, Edge, Firefox or Safari.');
} else {
  const worker = new Worker(new URL('./gameWorker.ts', import.meta.url), { type: 'module' });
  const host = new PageHost(canvas, worker);
  worker.addEventListener('error', (error) => host.thrown(error));
  const offscreen = canvas.transferControlToOffscreen();
  worker.postMessage(host.start(offscreen), [offscreen]);
}
