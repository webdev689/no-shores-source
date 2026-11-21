// The game in a thread of its own: its loop, the rules' prediction, the room's connection and every draw, WebGPU on
// the page's canvas handed over to it. The page keeps the player's input, the pointer's lock, the pad, typing, sound
// and storage (`thread/pageHost.ts`); here they have stand-ins (`thread/pageAway.ts`, `thread/audioAway.ts`), put in
// place before the game's own code is first loaded, so it runs as it would on the page.
import { soundAway } from './thread/audioAway.ts';
import { pageAway } from './thread/pageAway.ts';
import type { Start, ToGame, ToPage } from './thread/pageOps.ts';

const send = (message: ToPage, transfer: Transferable[] = []) => postMessage(message, { transfer });

/** What the page said before the game could hear it, heard once it can. */
const waiting: ToGame[] = [];
let hear: ((message: ToGame) => void) | null = null;

addEventListener('message', (message: MessageEvent<ToGame>) => {
  const said = message.data;
  if (said.kind === 'start') void begin(said);
  else if (hear) hear(said);
  else waiting.push(said);
});

async function begin(start: Start): Promise<void> {
  const away = pageAway(start, send);
  const answered = soundAway((ops, transfer) => send({ kind: 'audio', ops }, transfer));
  hear = (message) => (message.kind === 'audio' ? answered(message.reply) : away.heard(message));
  for (const message of waiting.splice(0)) hear(message);
  try {
    const [{ GpuUnavailable, startGpu, stopWhenLost }, { startGame }] = await Promise.all([
      import('./gpu.ts'),
      import('./game/game.ts'),
    ]);
    try {
      const gpu = await startGpu(away.canvas);
      stopWhenLost(gpu.device, (message) => send({ kind: 'stopped', message }));
      await startGame(gpu, away.canvas);
      send({ kind: 'started' });
    } catch (error) {
      const why =
        error instanceof GpuUnavailable
          ? error.message
          : `The game could not start: ${error instanceof Error ? error.message : String(error)}`;
      send({ kind: 'stopped', message: why });
    }
  } catch (error) {
    send({
      kind: 'stopped',
      message: `The game could not load: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
