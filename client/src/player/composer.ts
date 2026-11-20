import type { Colours, Strip } from '../forge/compose.ts';
import type { Rgb } from '../forge/dyes.ts';
import type { ForgeLooks } from '../forge/looks.ts';
import type { HairColours, RaceSkins } from '../forge/skins.ts';
import type { StripWhere } from '../forge/store.ts';
import { type ComposeJob, type ComposedCard, composeCard, stripsOf } from './composeJob.ts';
import type { ComposeAnswer, ComposeMessage } from './composeWorker.ts';

/** Whatever composes figures' frames: a frame a figure shows now (`urgent`) before any composed ahead. */
export interface Composer {
  compose(job: ComposeJob, urgent: boolean): Promise<ComposedCard | null>;
}

/** Composes on the page's own thread, in turn as asked: for tests, and where no worker can start. */
export class PageComposer implements Composer {
  private readonly looks: ForgeLooks;
  private readonly colours: Colours;
  private readonly strip: (path: string) => Promise<Strip | null>;

  constructor(looks: ForgeLooks, colours: Colours, strip: (path: string) => Promise<Strip | null>) {
    this.looks = looks;
    this.colours = colours;
    this.strip = strip;
  }

  compose(job: ComposeJob): Promise<ComposedCard | null> {
    return composeCard(job, this.looks, this.colours, this.strip);
  }
}

/** A worker given this many frames at once keeps busy while some wait for their strips, and a frame asked for now
 *  waits behind no more than these. */
const IN_FLIGHT = 4;

interface Waiting {
  readonly job: ComposeJob;
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
 * Composes in a worker, off the page's thread: a frame a figure shows now goes ahead of every frame composed ahead.
 * The page says where each of a frame's strips lies, so the worker needs no pack index. A worker that fails is let
 * go, and what it had and every frame after is composed on the page instead.
 */
export class WorkerComposer implements Composer {
  private worker: Worker | null;
  private readonly fallback: Composer;
  private readonly looks: ForgeLooks;
  private readonly where: (path: string) => StripWhere | null;
  private readonly urgent: Waiting[] = [];
  private readonly later: Waiting[] = [];
  private readonly sent = new Map<number, Waiting>();
  private nextId = 0;

  constructor(tables: ComposeTables, where: (path: string) => StripWhere | null, fallback: Composer) {
    this.looks = tables.looks;
    this.where = where;
    this.fallback = fallback;
    const worker = new Worker(new URL('./composeWorker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event: MessageEvent<ComposeAnswer>) => this.answered(event.data));
    worker.addEventListener('error', (event) => {
      event.preventDefault();
      this.failed();
    });
    const message: ComposeMessage = { kind: 'tables', ...tables };
    worker.postMessage(message);
    this.worker = worker;
  }

  compose(job: ComposeJob, urgent: boolean): Promise<ComposedCard | null> {
    if (!this.worker) return this.fallback.compose(job, urgent);
    return new Promise((done, failed) => {
      (urgent ? this.urgent : this.later).push({ job, done, failed });
      this.send();
    });
  }

  private send(): void {
    const worker = this.worker;
    while (worker && this.sent.size < IN_FLIGHT) {
      const waiting = this.urgent.shift() ?? this.later.shift();
      if (!waiting) return;
      const id = this.nextId++;
      this.sent.set(id, waiting);
      const where = Object.fromEntries(stripsOf(waiting.job, this.looks).map((path) => [path, this.where(path)]));
      const message: ComposeMessage = { kind: 'job', id, job: waiting.job, where };
      worker.postMessage(message);
    }
  }

  private answered({ id, card, failure }: ComposeAnswer): void {
    const waiting = this.sent.get(id);
    this.sent.delete(id);
    if (waiting) {
      if (failure === null) waiting.done(card);
      else waiting.failed(new Error(failure));
    }
    this.send();
  }

  private failed(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const waiting of [...this.sent.values(), ...this.urgent, ...this.later])
      this.fallback.compose(waiting.job, true).then(waiting.done, waiting.failed);
    this.sent.clear();
    this.urgent.length = 0;
    this.later.length = 0;
  }
}
