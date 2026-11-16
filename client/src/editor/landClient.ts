import type { FightOrders, FightView } from '../rules/fightRules.ts';
import type { Brush, GroundPatch, Helm, LandPatch, LandView, Pose, ShipFloats } from '../rules/landRules.ts';
import type { ShoreField } from '../water/shore.ts';

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
  | { readonly kind: 'write' }
  | {
      readonly kind: 'ground';
      readonly left: number;
      readonly top: number;
      readonly step: number;
      readonly width: number;
      readonly height: number;
    }
  | {
      readonly kind: 'sail';
      readonly ship: ShipFloats;
      readonly helm: Helm;
      readonly time: number;
      readonly ticks: number;
    }
  | { readonly kind: 'fight-begin'; readonly ship: ShipFloats; readonly seed: number; readonly time: number }
  | { readonly kind: 'fight-step'; readonly orders: FightOrders; readonly time: number; readonly ticks: number }
  | { readonly kind: 'fight-end' };

/** A ship after her ticks, and how she lies. */
export interface Sailed {
  readonly ship: ShipFloats;
  readonly pose: Pose;
}

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
  readonly shore?: ShoreField;
  readonly sailed?: Sailed;
  readonly fight?: FightView;
  readonly error?: string;
}

/** The land, worked in a worker so the page stays responsive while a continent takes seconds. */
export interface LandWorker {
  open(layoutText: string, id: string, editsText: string | null, keep: boolean): Promise<LandView>;
  dab(brush: Brush, point: readonly [number, number], starts: boolean): Promise<LandPatch>;
  settle(): Promise<LandView>;
  setEdits(editsText: string): Promise<LandView>;
  write(): Promise<{ readonly id: string; readonly text: string }>;
  /** The exact ground over a grid, and the breakers' field over it (worked here too: it takes a while). */
  ground(left: number, top: number, step: number, width: number, height: number): Promise<CloseGround>;
  /** A ship sailed over the open landmass. */
  sail(ship: ShipFloats, helm: Helm, time: number, ticks: number): Promise<Sailed>;
  /** A fight begun round the ship over the open landmass, stepped by the player's orders, and ended. */
  fightBegin(ship: ShipFloats, seed: number, time: number): Promise<FightView>;
  fightStep(orders: FightOrders, time: number, ticks: number): Promise<FightView>;
  fightEnd(): Promise<void>;
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
  const fought = (answer: LandAnswer) => {
    if (!answer.fight) throw new Error('the land worker answered no fight');
    return answer.fight;
  };
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
    ground: async (left, top, step, width, height) => {
      const { ground, shore } = await ask({ kind: 'ground', left, top, step, width, height });
      if (!ground || !shore) throw new Error('the land worker answered no ground');
      return { patch: ground, field: shore };
    },
    fightBegin: async (ship, seed, time) => fought(await ask({ kind: 'fight-begin', ship, seed, time })),
    fightStep: async (orders, time, ticks) => fought(await ask({ kind: 'fight-step', orders, time, ticks })),
    fightEnd: async () => {
      await ask({ kind: 'fight-end' });
    },
    sail: async (ship, helm, time, ticks) => {
      const { sailed } = await ask({ kind: 'sail', ship, helm, time, ticks });
      if (!sailed) throw new Error('the land worker answered no ship');
      return sailed;
    },
    write: async () => {
      const { written } = await ask({ kind: 'write' });
      if (!written) throw new Error('the land worker wrote nothing');
      return written;
    },
  };
}
