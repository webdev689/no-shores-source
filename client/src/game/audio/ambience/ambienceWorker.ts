// The ambience's worker: beds and calls made off the page's thread, as a bed takes 20 to 200 ms and a call a few, and
// a place's whole set at once would stall a frame. A message `{ id, job }` is answered `{ id, rate, samples }`, the
// samples handed over, not copied; a job with nothing to make is answered with no samples.

import { type Job, runJob } from './sounds.ts';

/** What the page asks: a job, by its number. */
export type Asked = { readonly id: number; readonly job: Job };
/** What the worker answers. */
export type Answered = { readonly id: number; readonly rate: number; readonly samples: Float32Array | null };

const scope = globalThis as unknown as {
  addEventListener(type: 'message', listener: (event: MessageEvent<Asked>) => void): void;
  postMessage(message: Answered, transfer: Transferable[]): void;
};

scope.addEventListener('message', (event) => {
  const { id, job } = event.data;
  const made = runJob(job);
  scope.postMessage({ id, rate: made?.rate ?? 0, samples: made?.samples ?? null }, made ? [made.samples.buffer] : []);
});
