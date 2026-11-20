// Composes figures' frames off the page's thread: each takes a few milliseconds, and a crowd's dresses ask for
// thousands. It keeps the strips it has fetched, as the page's store does, and is told where each one lies.
import type { Strip } from '../forge/compose.ts';
import { PaletteSnap, type Rgb } from '../forge/dyes.ts';
import type { ForgeLooks } from '../forge/looks.ts';
import type { HairColours, RaceSkins } from '../forge/skins.ts';
import { type StripWhere, decodeStrip, joinedRange, stripBytes } from '../forge/store.ts';
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
  | { readonly kind: 'hurry'; readonly id: number }
  | { readonly kind: 'fetch'; readonly where: Readonly<Record<string, StripWhere | null>> };

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
/** The strips' bytes as fetched, not yet decoded: every move of each dress shown, fetched as it first shows, so a move
 *  first played waits only for its decoding, not for the network. A tenth or less of their decoded size. */
const fetchedBytes = new StripCache<ArrayBuffer>(96 * 1024 * 1024, (bytes) => bytes.byteLength);

/** Where each strip a message names lies, as the page told it. */
type Places = Readonly<Record<string, StripWhere | null>>;

/** The path of a strip's depth (`_z`), or of the strip a depth belongs to. */
const twinOf = (path: string): string =>
  path.endsWith('_z.png') ? path.replace(/_z\.png$/, '.png') : path.replace(/\.png$/, '_z.png');

/** A strip's bytes, kept or fetched. A strip and its depth are fetched as one range where the pack lays them side by
 *  side, as it lays every strip it holds, so a frame's layers take half the fetches. */
function bytesOf(path: string, places: Places): Promise<ArrayBuffer | null> {
  const where = places[path];
  const twin = twinOf(path);
  const twinWhere = places[twin];
  const joined =
    where && twinWhere && !fetchedBytes.has(path) && !fetchedBytes.has(twin) && joinedRange(where, twinWhere);
  if (joined) {
    const both = stripBytes(joined.where);
    const [first, second] = joined.oneFirst ? [path, twin] : [twin, path];
    fetchedBytes.get(first, () => both.then((bytes) => bytes.slice(0, joined.split)));
    fetchedBytes.get(second, () => both.then((bytes) => bytes.slice(joined.split)));
  }
  return fetchedBytes.get(path, () => (where ? stripBytes(where) : Promise.resolve(null)));
}
/** How many strips are fetched ahead at once: as many as a browser fetches at a time from one place over HTTP/1.1,
 *  so a strip a frame waits for queues behind no more than one round of them. */
const AHEAD_AT_ONCE = 6;
/** The strips asked for ahead, a list for each dress in the order its moves are likeliest shown, with how far along it
 *  the fetching is. */
const ahead: { readonly strips: readonly string[]; readonly places: Places; next: number }[] = [];
let aheadNow = 0;
/** Fetches the strips asked for ahead, each dress's next in turn, so a crowd's dresses all have their first moves
 *  soon, while fewer than `AHEAD_AT_ONCE` are on their way. A strip that fails here is fetched again when a frame
 *  asks for it. */
function fetchAhead(): void {
  while (aheadNow < AHEAD_AT_ONCE) {
    const dress = ahead.shift();
    if (!dress) return;
    const strip = dress.strips[dress.next++];
    if (dress.next < dress.strips.length) ahead.push(dress);
    if (!strip) continue;
    aheadNow += 1;
    bytesOf(strip, dress.places)
      .catch(() => undefined)
      .finally(() => {
        aheadNow -= 1;
        fetchAhead();
      });
  }
}
const stripOf = (path: string, places: Places): Promise<Strip | null> =>
  strips.get(path, async () => {
    const where = places[path];
    const bytes = await bytesOf(path, places);
    return bytes && where ? decodeStrip(bytes, where.type) : null;
  });

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
  if (message.kind === 'fetch') {
    ahead.push({ strips: Object.keys(message.where), places: message.where, next: 0 });
    fetchAhead();
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
  const fetched = Promise.all(paths.map((path) => stripOf(path, where)));
  // Composed from the strips in hand, so none let go from the cache meanwhile is fetched again out of turn.
  queue.add(id, haste, fetched, () =>
    fetched
      .then((loaded) => {
        const held = new Map(paths.map((path, index) => [path, loaded[index] ?? null]));
        return composeCard(job, own.looks, colours, (path) =>
          held.has(path) ? Promise.resolve(held.get(path) ?? null) : stripOf(path, where),
        );
      })
      .then(
        (card) => answer(id, card),
        (error: unknown) => fail(id, error),
      ),
  );
});
