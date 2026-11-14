import type { LandView } from '../rules/landRules.ts';

/** What the page asks the land worker. */
export interface LandRequest {
  readonly ticket: number;
  readonly kind: 'open';
  readonly layoutText: string;
  readonly id: string;
}

/** What the land worker answers: a landmass's view, or why there is none. */
export interface LandAnswer {
  readonly ticket: number;
  readonly view?: LandView;
  readonly error?: string;
}

/** The land, generated in a worker so the page stays responsive while a continent takes seconds. */
export interface LandWorker {
  open(layoutText: string, id: string): Promise<LandView>;
}

export function startLandWorker(): LandWorker {
  const worker = new Worker(new URL('./landWorker.ts', import.meta.url), { type: 'module' });
  const waiting = new Map<number, { resolve(view: LandView): void; reject(error: Error): void }>();
  let nextTicket = 0;
  worker.addEventListener('message', (event: MessageEvent<LandAnswer>) => {
    const { ticket, view, error } = event.data;
    const caller = waiting.get(ticket);
    waiting.delete(ticket);
    if (view) caller?.resolve(view);
    else caller?.reject(new Error(error ?? 'the land worker gave no answer'));
  });
  worker.addEventListener('error', (event) => {
    for (const caller of waiting.values()) caller.reject(new Error(event.message || 'the land worker stopped'));
    waiting.clear();
  });
  return {
    open: (layoutText, id) =>
      new Promise((resolve, reject) => {
        const ticket = nextTicket++;
        waiting.set(ticket, { resolve, reject });
        const request: LandRequest = { ticket, kind: 'open', layoutText, id };
        worker.postMessage(request);
      }),
  };
}
