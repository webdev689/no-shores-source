import type { Colours, Strip } from '../forge/compose.ts';
import type { Rgb } from '../forge/dyes.ts';
import type { ForgeLooks } from '../forge/looks.ts';
import type { HairColours, RaceSkins } from '../forge/skins.ts';
import type { StripWhere } from '../forge/store.ts';
import { type ComposeJob, type ComposedCard, composeCard, stripsOf } from './composeJob.ts';
import type { Haste } from './composeQueue.ts';
import type { ComposeAnswer, ComposeMessage } from './composeWorker.ts';

/** Whatever composes figures' frames, each kept by `key`: the frames shown now first, then those next in a move just
 *  shown, then those composed ahead of need. */
export interface Composer {
  /** Whether it composes off the page's thread, so warming may go as fast as it keeps up. */
  readonly offPage: boolean;
  compose(key: string, job: ComposeJob, haste: Haste): Promise<ComposedCard | null>;
  /** A frame under way that is now shown goes ahead of every frame not shown. */
  hurry(key: string): void;
}

/** Composes on the page's own thread, each frame as its strips come: for tests, and where no worker can start. */
export class PageComposer implements Composer {
  readonly offPage = false;
  private readonly looks: ForgeLooks;
  private readonly colours: Colours;
  private readonly strip: (path: string) => Promise<Strip | null>;

  constructor(looks: ForgeLooks, colours: Colours, strip: (path: string) => Promise<Strip | null>) {
    this.looks = looks;
    this.colours = colours;
    this.strip = strip;
  }

  compose(_key: string, job: ComposeJob): Promise<ComposedCard | null> {
    return composeCard(job, this.looks, this.colours, this.strip);
  }

  hurry(): void {}
}

interface Sent {
  readonly key: string;
  readonly job: ComposeJob;
  haste: Haste;
  readonly done: (card: ComposedCard | null) => void;
  readonly failed: (why: Error) => void;
}

/** The forge's tables a worker composes by. */
export interface ComposeTables {
  readonly looks: ForgeLooks;
  readonly skins: RaceSkins;
  readonly hair: HairColours;
  readonly palette: readonly Rgb[];
}

/**
 * Composes in a worker, off the page's thread, which orders the frames (`ComposeQueue`); each is sent as it is asked
 * for, as the cards ask for few at a time. The page says where each of a frame's strips lies, so the worker needs no
 * pack index. Where no worker starts, or one fails, what it had and every frame after is composed on the page.
 */
export class WorkerComposer implements Composer {
  private worker: Worker | null = null;
  private readonly fallback: Composer;
  private readonly looks: ForgeLooks;
  private readonly where: (path: string) => StripWhere | null;
  private readonly sent = new Map<number, Sent>();
  private readonly ids = new Map<string, number>();
  private nextId = 0;

  constructor(tables: ComposeTables, where: (path: string) => StripWhere | null, fallback: Composer) {
    this.looks = tables.looks;
    this.where = where;
    this.fallback = fallback;
    let worker: Worker;
    try {
      worker = new Worker(new URL('./composeWorker.ts', import.meta.url), { type: 'module' });
    } catch {
      // No worker here (none in this runtime, or the page's policy forbids one): the page composes.
      return;
    }
    worker.addEventListener('message', (event: MessageEvent<ComposeAnswer>) => this.answered(event.data));
    worker.addEventListener('error', (event) => {
      event.preventDefault();
      this.failed();
    });
    const message: ComposeMessage = { kind: 'tables', ...tables };
    worker.postMessage(message);
    this.worker = worker;
  }

  get offPage(): boolean {
    return this.worker !== null;
  }

  compose(key: string, job: ComposeJob, haste: Haste): Promise<ComposedCard | null> {
    const worker = this.worker;
    if (!worker) return this.fallback.compose(key, job, haste);
    return new Promise((done, failed) => {
      const id = this.nextId++;
      const where = Object.fromEntries(stripsOf(job, this.looks).map((path) => [path, this.where(path)]));
      const message: ComposeMessage = { kind: 'job', id, haste, job, where };
      worker.postMessage(message);
      this.sent.set(id, { key, job, haste, done, failed });
      this.ids.set(key, id);
    });
  }

  hurry(key: string): void {
    const id = this.ids.get(key);
    const sent = id === undefined ? undefined : this.sent.get(id);
    if (!this.worker || id === undefined || !sent || sent.haste === 'now') return;
    sent.haste = 'now';
    const message: ComposeMessage = { kind: 'hurry', id };
    this.worker.postMessage(message);
  }

  private answered({ id, card, failure }: ComposeAnswer): void {
    const sent = this.sent.get(id);
    if (!sent) return;
    this.sent.delete(id);
    if (this.ids.get(sent.key) === id) this.ids.delete(sent.key);
    if (failure === null) sent.done(card);
    else sent.failed(new Error(failure));
  }

  private failed(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const sent of this.sent.values())
      this.fallback.compose(sent.key, sent.job, sent.haste).then(sent.done, sent.failed);
    this.sent.clear();
    this.ids.clear();
  }
}
