// Composes figures' frames off the page's thread: each takes a few milliseconds, and a crowd's dresses ask for
// thousands. It keeps the strips it has fetched, as the page's store does, and is told where each one lies.
import type { Strip } from '../forge/compose.ts';
import { PaletteSnap, type Rgb } from '../forge/dyes.ts';
import type { ForgeLooks } from '../forge/looks.ts';
import type { HairColours, RaceSkins } from '../forge/skins.ts';
import { type StripWhere, stripAt } from '../forge/store.ts';
import { StripCache } from '../forge/stripCache.ts';
import { type ComposeJob, type ComposedCard, composeCard } from './composeJob.ts';

/** What the page tells the worker: the forge's tables once, then each frame to compose with where its strips lie. */
export type ComposeMessage =
  | {
      readonly kind: 'tables';
      readonly looks: ForgeLooks;
      readonly skins: RaceSkins;
      readonly hair: HairColours;
      readonly palette: readonly Rgb[];
    }
  | {
      readonly kind: 'job';
      readonly id: number;
      readonly job: ComposeJob;
      readonly where: Readonly<Record<string, StripWhere | null>>;
    };

/** A frame composed, or none where the forge drew nothing, or why it failed. */
export type ComposeAnswer = {
  readonly id: number;
  readonly card: ComposedCard | null;
  readonly failure: string | null;
};

const scope = globalThis as unknown as {
  addEventListener(type: 'message', listener: (event: MessageEvent<ComposeMessage>) => void): void;
  postMessage(message: ComposeAnswer, transfer: Transferable[]): void;
};

let tables: Extract<ComposeMessage, { kind: 'tables' }> | null = null;
let snap: PaletteSnap | null = null;
/** The decoded strips the worker keeps: a few dresses' moves, each sheet used for every view and frame of its move,
 *  which the frames composed ahead take in turn. */
export const WORKER_STRIP_BYTES = 128 * 1024 * 1024;
const strips = new StripCache(WORKER_STRIP_BYTES);

const stripOf = (path: string, where: StripWhere | null | undefined): Promise<Strip | null> =>
  strips.get(path, () => (where ? stripAt(where) : Promise.resolve(null)));

scope.addEventListener('message', (event) => {
  const message = event.data;
  if (message.kind === 'tables') {
    tables = message;
    snap = new PaletteSnap(message.palette);
    return;
  }
  const { id, job, where } = message;
  const own = tables;
  if (!own) {
    scope.postMessage({ id, card: null, failure: 'the worker has no tables yet' }, []);
    return;
  }
  const colours = { skins: own.skins, hair: own.hair, snap: snap ?? undefined };
  composeCard(job, own.looks, colours, (path) => stripOf(path, where[path]))
    .then((card) => {
      const transfer = card ? [card.pixels.buffer, ...(card.field ? [card.field.data.buffer] : [])] : [];
      scope.postMessage({ id, card, failure: null }, transfer);
    })
    .catch((error: unknown) => {
      scope.postMessage({ id, card: null, failure: error instanceof Error ? error.message : String(error) }, []);
    });
});
