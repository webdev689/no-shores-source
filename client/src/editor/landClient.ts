import type { Brush, LandPatch, LandView } from '../rules/landRules.ts';

/** What the page asks the land worker. */
export type LandRequest =
  | {
      readonly kind: 'open';
      readonly layoutText: string;
      readonly id: string;
      readonly editsText: string | null;
      readonly keep: boolean;
    }
  | { readonly kind: 'dab'; readonly brush: Brush; readonly point: readonly [number, number]; readonly starts: boolean }
  | { readonly kind: 'settle' }
  | { readonly kind: 'setEdits'; readonly editsText: string }
  | { readonly kind: 'write' };

/** What the land worker answers: one of a view, a patch or a written file, or why there is none. */
export interface LandAnswer {
  readonly ticket: number;
  readonly view?: LandView;
  readonly patch?: LandPatch;
  readonly written?: { readonly id: string; readonly text: string };
  readonly error?: string;
}

/** The land, worked in a worker so the page stays responsive while a continent takes seconds. */
export interface LandWorker {
  open(layoutText: string, id: string, editsText: string | null, keep: boolean): Promise<LandView>;
  dab(brush: Brush, point: readonly [number, number], starts: boolean): Promise<LandPatch>;
  settle(): Promise<LandView>;
  setEdits(editsText: string): Promise<LandView>;
  write(): Promise<{ readonly id: string; readonly text: string }>;
}

export function startLandWorker(): LandWorker {
  const worker = new Worker(new URL('./landWorker.ts', import.meta.url), { type: 'module' });
  const waiting = new Map<number, { resolve(answer: LandAnswer): void; reject(error: Error): void }>();
  let nextTicket = 0;
  worker.addEventListener('message', (event: MessageEvent<LandAnswer>) => {
    const caller = waiting.get(event.data.ticket);
    waiting.delete(event.data.ticket);
    if (event.data.error === undefined) caller?.resolve(event.data);
    else caller?.reject(new Error(event.data.error));
  });
  worker.addEventListener('error', (event) => {
    for (const caller of waiting.values()) caller.reject(new Error(event.message || 'the land worker stopped'));
    waiting.clear();
  });
  const ask = (request: LandRequest) =>
    new Promise<LandAnswer>((resolve, reject) => {
      const ticket = nextTicket++;
      waiting.set(ticket, { resolve, reject });
      worker.postMessage({ ticket, request });
    });
  const view = async (request: LandRequest) => {
    const answer = await ask(request);
    if (!answer.view) throw new Error('the land worker answered no view');
    return answer.view;
  };
  return {
    open: (layoutText, id, editsText, keep) => view({ kind: 'open', layoutText, id, editsText, keep }),
    dab: async (brush, point, starts) => {
      const { patch } = await ask({ kind: 'dab', brush, point, starts });
      if (!patch) throw new Error('the land worker answered no patch');
      return patch;
    },
    settle: () => view({ kind: 'settle' }),
    setEdits: (editsText) => view({ kind: 'setEdits', editsText }),
    write: async () => {
      const { written } = await ask({ kind: 'write' });
      if (!written) throw new Error('the land worker wrote nothing');
      return written;
    },
  };
}
