import type { Brush, GroundPatch, LandPatch, LandView } from '../rules/landRules.ts';
import type { Block } from '../rules/movementRules.ts';
import type { ShoreField } from '../water/shore.ts';

/** What the page asks the land worker. */
export type LandRequest =
  | {
      readonly kind: 'open';
      readonly layoutText: string;
      readonly id: string;
      readonly editsText: string | null;
      readonly keep: boolean;
      readonly rmbText?: string | null;
    }
  | { readonly kind: 'city' }
  | { readonly kind: 'window'; readonly rect: readonly [number, number, number, number] }
  | { readonly kind: 'boxes'; readonly rect: readonly [number, number, number, number] }
  | { readonly kind: 'dab'; readonly brush: Brush; readonly point: readonly [number, number]; readonly starts: boolean }
  | { readonly kind: 'settle' }
  | { readonly kind: 'setEdits'; readonly editsText: string }
  | { readonly kind: 'write' }
  | {
      readonly kind: 'ground';
      readonly left: number;
      readonly top: number;
      readonly step: number;
      readonly width: number;
      readonly height: number;
    };

/** The exact ground round a point, and the breakers' field over it. */
export interface CloseGround {
  readonly patch: GroundPatch;
  readonly field: ShoreField;
}

/** What the land worker answers: one of a view, a patch or a written file, or why there is none. */
export interface LandAnswer {
  readonly ticket: number;
  readonly view?: LandView;
  readonly patch?: LandPatch;
  readonly written?: { readonly id: string; readonly text: string };
  readonly ground?: GroundPatch;
  /** A city's plan or a window of the ground, as JSON; null for a landmass with no city. */
  readonly text?: string | null;
  readonly boxes?: readonly Block[];
  readonly shore?: ShoreField;
  readonly error?: string;
}

/** The land, worked in a worker so the page stays responsive while a continent takes seconds. */
export interface LandWorker {
  /** Opens a landmass; kept, its city is settled on it, its blocks named from the RMB index's text if given. */
  open(
    layoutText: string,
    id: string,
    editsText: string | null,
    keep: boolean,
    rmbText?: string | null,
  ): Promise<LandView>;
  /** The open landmass's city plan as JSON, or null with none. */
  cityPlan(): Promise<string | null>;
  /** The open landmass's exact ground over a rect (west, north, east, south) as JSON, and the city's boxes there. */
  window(rect: readonly [number, number, number, number]): Promise<string>;
  boxes(rect: readonly [number, number, number, number]): Promise<readonly Block[]>;
  dab(brush: Brush, point: readonly [number, number], starts: boolean): Promise<LandPatch>;
  settle(): Promise<LandView>;
  setEdits(editsText: string): Promise<LandView>;
  write(): Promise<{ readonly id: string; readonly text: string }>;
  /** The exact ground over a grid, and the breakers' field over it (worked here too: it takes a while). */
  ground(left: number, top: number, step: number, width: number, height: number): Promise<CloseGround>;
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
    open: (layoutText, id, editsText, keep, rmbText) =>
      view({ kind: 'open', layoutText, id, editsText, keep, rmbText }),
    cityPlan: async () => (await ask({ kind: 'city' })).text ?? null,
    window: async (rect) => {
      const { text } = await ask({ kind: 'window', rect });
      if (typeof text !== 'string') throw new Error('the land worker answered no window');
      return text;
    },
    boxes: async (rect) => (await ask({ kind: 'boxes', rect })).boxes ?? [],
    dab: async (brush, point, starts) => {
      const { patch } = await ask({ kind: 'dab', brush, point, starts });
      if (!patch) throw new Error('the land worker answered no patch');
      return patch;
    },
    settle: () => view({ kind: 'settle' }),
    setEdits: (editsText) => view({ kind: 'setEdits', editsText }),
    ground: async (left, top, step, width, height) => {
      const { ground, shore } = await ask({ kind: 'ground', left, top, step, width, height });
      if (!ground || !shore) throw new Error('the land worker answered no ground');
      return { patch: ground, field: shore };
    },
    write: async () => {
      const { written } = await ask({ kind: 'write' });
      if (!written) throw new Error('the land worker wrote nothing');
      return written;
    },
  };
}
