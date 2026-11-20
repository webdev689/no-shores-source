import { startRoomDoor } from '../../../server/roomDoor.ts';

/** An island as the page builds it: its plan's JSON in its own frame (crates/room-wasm/src/isle_door.rs) and its
 *  ground's numbers with its middle where the sea rolled it, as `movement::Heights` gives them. */
export interface IsleBuilt {
  readonly json: string;
  readonly heights: Float64Array;
}

/** Builds islands through the room module, the same rules the island's room stands on, so the page predicts the
 *  player on the room's own ground: null for a climate the islands' contract does not dress. */
export function islePlanner(
  module: WebAssembly.Module,
): (seed: string, climate: string, at: readonly [number, number]) => IsleBuilt | null {
  const door = startRoomDoor(module);
  return (seed, climate, middle) => {
    const json = door.islePlan(seed, climate);
    if (!json) return null;
    return { json, heights: door.isleHeights(seed, climate, middle) };
  };
}

/** What the page asks the island worker: first the room module, then each island by its seed, climate and middle. */
export type IslePlanAsk =
  | { readonly module: WebAssembly.Module }
  | {
      readonly ticket: number;
      readonly seed: string;
      readonly climate: string;
      readonly at: readonly [number, number];
    };

/** The island worker's answer to an island asked of it: what it built, or why not. */
export type IslePlanAnswer =
  { readonly ticket: number; readonly built: IsleBuilt | null } | { readonly ticket: number; readonly error: string };

/** Builds islands as `islePlanner` does, in a worker of their own, so a build (tens of milliseconds for an isle) never
 *  holds up a frame. */
export function islePlanWorker(
  module: Promise<WebAssembly.Module>,
): (seed: string, climate: string, at: readonly [number, number]) => Promise<IsleBuilt | null> {
  const worker = new Worker(new URL('./islePlanWorker.ts', import.meta.url), { type: 'module' });
  const waiting = new Map<number, { resolve(built: IsleBuilt | null): void; reject(error: Error): void }>();
  let nextTicket = 0;
  // A worker that failed answers nothing more; every later ask is refused at once with why.
  let failed: Error | null = null;
  const sent = module.then((compiled) => worker.postMessage({ module: compiled } satisfies IslePlanAsk));
  worker.addEventListener('message', (event: MessageEvent<IslePlanAnswer>) => {
    const answer = event.data;
    const caller = waiting.get(answer.ticket);
    waiting.delete(answer.ticket);
    if ('built' in answer) caller?.resolve(answer.built);
    else caller?.reject(new Error(answer.error));
  });
  worker.addEventListener('error', (event) => {
    failed = new Error(event.message || 'the island worker stopped');
    for (const caller of waiting.values()) caller.reject(failed);
    waiting.clear();
  });
  return async (seed, climate, middle) => {
    await sent;
    return new Promise<IsleBuilt | null>((resolve, reject) => {
      if (failed) return reject(failed);
      const ticket = nextTicket++;
      waiting.set(ticket, { resolve, reject });
      worker.postMessage({ ticket, seed, climate, at: middle } satisfies IslePlanAsk);
    });
  };
}
