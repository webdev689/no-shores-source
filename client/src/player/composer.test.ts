import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ForgeLooks } from '../forge/looks.ts';
import type { ComposeJob, ComposedCard } from './composeJob.ts';
import type { ComposeMessage } from './composeWorker.ts';
import { type Composer, WorkerComposer } from './composer.ts';

const looks: ForgeLooks = { bodies: {} };
const tables = { looks, skins: { bodies: {} }, hair: { bodies: {} }, palette: [] };
const job = (frame: number): ComposeJob => ({
  figure: { body: 'male', gear: [] } as unknown as ComposeJob['figure'],
  anim: 'walk',
  view: 0,
  frame,
  ramps: {},
  glow: 0,
});

/** A stand-in for the browser's Worker, keeping what it was sent and letting a test answer or fail it. */
class FakeWorker {
  static last: FakeWorker | null = null;
  readonly posted: ComposeMessage[] = [];
  readonly listeners = new Map<string, (event: unknown) => void>();
  terminated = false;
  constructor() {
    FakeWorker.last = this;
  }
  postMessage(message: ComposeMessage): void {
    this.posted.push(message);
  }
  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(type, listener);
  }
  terminate(): void {
    this.terminated = true;
  }
}

function started() {
  const onPage: ComposeJob[] = [];
  const fallback: Composer = {
    offPage: false,
    compose: (_key, each) => {
      onPage.push(each);
      return Promise.resolve(null);
    },
    hurry: () => undefined,
    prefetch: () => undefined,
  };
  const global = globalThis as { Worker?: unknown };
  const before = global.Worker;
  global.Worker = FakeWorker;
  const composer = new WorkerComposer(tables, () => null, fallback);
  global.Worker = before;
  const worker = FakeWorker.last as FakeWorker;
  const jobs = () => worker.posted.filter((message) => message.kind === 'job');
  return { composer, worker, onPage, jobs };
}

test('every frame is sent as it is asked for, however many are under way', () => {
  const { composer, jobs } = started();
  for (let frame = 0; frame < 8; frame++) void composer.compose(`k${frame}`, job(frame), frame === 7 ? 'now' : 'ahead');
  assert.equal(jobs().length, 8);
  assert.equal(jobs()[7]?.kind === 'job' && jobs()[7]?.haste, 'now');
});

test('a frame under way that is shown is hurried once; its answer settles it', async () => {
  const { composer, worker, jobs } = started();
  const card = composer.compose('warm', job(0), 'later');
  composer.hurry('warm');
  composer.hurry('warm');
  composer.hurry('unknown');
  assert.deepEqual(
    worker.posted.filter((message) => message.kind === 'hurry'),
    [{ kind: 'hurry', id: (jobs()[0] as { id: number }).id }],
  );
  const composed: ComposedCard = { width: 1, height: 1, root: [0, 0], pixels: new Uint8Array(4), field: null };
  worker.listeners.get('message')?.({ data: { id: (jobs()[0] as { id: number }).id, card: composed, failure: null } });
  assert.equal(await card, composed);
});

test('a worker that fails hands what it had to the page, and every frame after', async () => {
  const { composer, worker, onPage } = started();
  void composer.compose('a', job(0), 'now');
  void composer.compose('b', job(1), 'later');
  assert.equal(composer.offPage, true);
  worker.listeners.get('error')?.({ preventDefault: () => undefined });
  assert.equal(worker.terminated, true);
  assert.equal(composer.offPage, false);
  assert.deepEqual(
    onPage.map((each) => each.frame),
    [0, 1],
  );
  await composer.compose('c', job(2), 'now');
  assert.equal(onPage.length, 3);
});

test('where no worker can start, the page composes', async () => {
  const fallback: Composer = {
    offPage: false,
    compose: () => Promise.resolve(null),
    hurry: () => undefined,
    prefetch: () => undefined,
  };
  const global = globalThis as { Worker?: unknown };
  const before = global.Worker;
  global.Worker = class {
    constructor() {
      throw new Error('forbidden');
    }
  };
  const composer = new WorkerComposer(tables, () => null, fallback);
  global.Worker = before;
  assert.equal(composer.offPage, false);
  assert.equal(await composer.compose('a', job(0), 'now'), null);
});
