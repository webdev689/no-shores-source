// Composes figures' frames off the page's thread: each takes a few milliseconds, and a crowd's dresses ask for
// thousands. It keeps the strips it has fetched, as the page's store does, and is told where each one lies.
import type { Strip } from '../forge/compose.ts';
import { PaletteSnap, type Rgb } from '../forge/dyes.ts';
import type { ForgeLooks } from '../forge/looks.ts';
import type { HairColours, RaceSkins } from '../forge/skins.ts';
import { type StripWhere, stripAt } from '../forge/store.ts';
import { StripCache } from '../forge/stripCache.ts';
import { type ComposeJob, type ComposedCard, composeCard, stripsOf } from './composeJob.ts';
import { ComposeQueue, type Haste } from './composeQueue.ts';

/** What the page tells the worker: the forge's tables once, then each frame to compose with how soon it is wanted and
 *  where its strips lie, and any of those that is now shown. */
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
      readonly haste: Haste;
      readonly job: ComposeJob;
      readonly where: Readonly<Record<string, StripWhere | null>>;
    }
  | { readonly kind: 'hurry'; readonly id: number };

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
const strips = new StripCache(128 * 1024 * 1024);

/** A strip by where the page said it lies; one the page said nothing of is not kept as missing, since it may be
 *  drawn after all. */
const stripOf = (path: string, where: StripWhere | null | undefined): Promise<Strip | null> =>
  where === undefined
    ? Promise.resolve(null)
    : strips.get(path, () => (where ? stripAt(where) : Promise.resolve(null)));

// A turn is a message to itself, so messages that came meanwhile are read first; a timer's turns slow to 4 ms apart.
const turns = new MessageChannel();
let turned: (() => void) | null = null;
turns.port1.onmessage = () => turned?.();
const queue = new ComposeQueue((next) => {
  turned = next;
  turns.port2.postMessage(null);
});

const answer = (id: number, card: ComposedCard | null) => {
  const transfer = card ? [card.pixels.buffer, ...(card.field ? [card.field.data.buffer] : [])] : [];
  scope.postMessage({ id, card, failure: null }, transfer);
};
const fail = (id: number, error: unknown) =>
  scope.postMessage({ id, card: null, failure: error instanceof Error ? error.message : String(error) }, []);

scope.addEventListener('message', (event) => {
  const message = event.data;
  if (message.kind === 'tables') {
    tables = message;
    snap = new PaletteSnap(message.palette);
    return;
  }
  if (message.kind === 'hurry') {
    queue.hurry(message.id);
    return;
  }
  const { id, haste, job, where } = message;
  const own = tables;
  if (!own) {
    fail(id, 'the worker has no tables yet');
    return;
  }
  const colours = { skins: own.skins, hair: own.hair, snap: snap ?? undefined };
  const paths = stripsOf(job, own.looks);
  const fetched = Promise.all(paths.map((path) => stripOf(path, where[path])));
  // Composed from the strips in hand, so none let go from the cache meanwhile is fetched again out of turn.
  queue.add(id, haste, fetched, () =>
    fetched
      .then((loaded) => {
        const held = new Map(paths.map((path, index) => [path, loaded[index] ?? null]));
        return composeCard(job, own.looks, colours, (path) =>
          held.has(path) ? Promise.resolve(held.get(path) ?? null) : stripOf(path, where[path]),
        );
      })
      .then(
        (card) => answer(id, card),
        (error: unknown) => fail(id, error),
      ),
  );
});
