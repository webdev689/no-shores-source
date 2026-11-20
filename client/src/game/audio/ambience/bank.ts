// The ambience's made sounds, on the page's side: each job sent to the worker once, one at a time, its samples turned
// into a buffer as they come and kept under its name (kept as samples where the page has no buffers, as in a test). Where no worker can be had (a test, a
// browser that refuses one) a job is made on the page's thread instead, one a frame. A job that fails is not asked
// again. Only the places sounding keep their sounds; the rest are let go.

import type { Answered, Asked } from './ambienceWorker.ts';
import { type Job, type Made, jobName, runJob } from './sounds.ts';

/** Starts the worker, or answers null where none can be had. */
function startWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./ambienceWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
}

export class Bank {
  private readonly made = new Map<string, Made>();
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly failed = new Set<string>();
  private readonly queue: Job[] = [];
  private readonly queued = new Set<string>();
  private readonly start: () => Worker | null;
  private worker: Worker | null | undefined;
  private asking: { readonly id: number; readonly name: string } | null = null;
  private nextId = 1;
  private readonly waiting: { readonly names: readonly string[]; readonly done: () => void }[] = [];

  constructor(start: () => Worker | null = startWorker) {
    this.start = start;
  }

  /** Asks for a job, once; it is made in turn. */
  want(job: Job): void {
    const name = jobName(job);
    if (this.holds(name) || this.queued.has(name) || this.failed.has(name) || this.asking?.name === name) return;
    this.queued.add(name);
    this.queue.push(job);
  }

  /** Whether a job's sound is here. */
  has(job: Job): boolean {
    return this.holds(jobName(job));
  }

  /** A job's buffer; null until it has come. */
  buffer(job: Job): AudioBuffer | null {
    return this.buffers.get(jobName(job)) ?? null;
  }

  /** Sends the next job to be made, if none is being made. */
  pump(): void {
    if (this.asking || this.queue.length === 0) return;
    if (this.worker === undefined) this.startWorker();
    const job = this.queue.shift();
    if (!job) return;
    const name = jobName(job);
    this.queued.delete(name);
    if (!this.worker) {
      this.settle(name, runJob(job));
      return;
    }
    this.asking = { id: this.nextId++, name };
    this.worker.postMessage({ id: this.asking.id, job } satisfies Asked);
  }

  /** Resolves once every one of `jobs` is made (or has failed). */
  whenMade(jobs: readonly Job[]): Promise<void> {
    const names = jobs.map(jobName);
    return new Promise((done) => {
      this.waiting.push({ names, done });
      this.checkWaiting();
    });
  }

  /** Lets go of everything but the jobs named in `keep`. */
  keepOnly(keep: ReadonlySet<string>): void {
    for (const name of [...this.made.keys()]) if (!keep.has(name)) this.made.delete(name);
    for (const name of [...this.buffers.keys()]) if (!keep.has(name)) this.buffers.delete(name);
    for (let nth = this.queue.length - 1; nth >= 0; nth--) {
      const name = jobName(this.queue[nth] as Job);
      if (!keep.has(name)) {
        this.queue.splice(nth, 1);
        this.queued.delete(name);
      }
    }
  }

  /** How many sounds are kept, and their bytes. */
  get held(): { readonly sounds: number; readonly bytes: number } {
    let bytes = 0;
    for (const made of this.made.values()) bytes += made.samples.byteLength;
    for (const buffer of this.buffers.values()) bytes += buffer.length * buffer.numberOfChannels * 4;
    return { sounds: this.made.size + this.buffers.size, bytes };
  }

  private holds(name: string): boolean {
    return this.made.has(name) || this.buffers.has(name);
  }

  private startWorker(): void {
    const worker = this.start();
    this.worker = worker;
    if (!worker) return;
    worker.addEventListener('message', (event: MessageEvent<Answered>) => {
      const { id, rate, samples } = event.data;
      if (!this.asking || this.asking.id !== id) return;
      const name = this.asking.name;
      this.asking = null;
      this.settle(name, samples ? { rate, samples } : null);
      this.pump();
    });
    // A worker that will not load leaves the jobs to the page's thread, the one asked of it first.
    worker.addEventListener('error', (event) => {
      event.preventDefault();
      worker.terminate();
      this.worker = null;
      if (this.asking) this.failed.add(this.asking.name);
      this.asking = null;
    });
  }

  private settle(name: string, made: Made | null): void {
    if (made && typeof AudioBuffer !== 'undefined') {
      const buffer = new AudioBuffer({ length: made.samples.length, sampleRate: made.rate, numberOfChannels: 1 });
      buffer.copyToChannel(made.samples as Float32Array<ArrayBuffer>, 0);
      this.buffers.set(name, buffer);
    } else if (made) this.made.set(name, made);
    else this.failed.add(name);
    this.checkWaiting();
  }

  private checkWaiting(): void {
    for (let nth = this.waiting.length - 1; nth >= 0; nth--) {
      const waiter = this.waiting[nth];
      if (waiter && waiter.names.every((name) => this.holds(name) || this.failed.has(name))) {
        this.waiting.splice(nth, 1);
        waiter.done();
      }
    }
  }
}
