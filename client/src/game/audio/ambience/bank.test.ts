import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Answered, Asked } from './ambienceWorker.ts';
import { Bank } from './bank.ts';
import { type Job, runJob } from './sounds.ts';

const owl: Job = { kind: 'sound', key: 'owl.deep', take: 0 };
const wind: Job = { kind: 'bed', key: 'wind.moan' };

/** A worker that answers each job as the ambience's worker does, when told to. */
function fakeWorker() {
  const listeners: { message: ((event: MessageEvent<Answered>) => void)[]; error: ((event: Event) => void)[] } = {
    message: [],
    error: [],
  };
  const asked: Asked[] = [];
  const worker = {
    addEventListener: (type: 'message' | 'error', listener: never) => listeners[type].push(listener),
    postMessage: (message: Asked) => asked.push(message),
    terminate: () => undefined,
  };
  const answer = () => {
    const next = asked.shift();
    if (!next) return;
    const made = runJob(next.job);
    const data: Answered = { id: next.id, rate: made?.rate ?? 0, samples: made?.samples ?? null };
    for (const listener of listeners.message) listener({ data } as MessageEvent<Answered>);
  };
  const fail = () => {
    for (const listener of listeners.error) listener({ preventDefault: () => undefined } as Event);
  };
  return { worker: worker as unknown as Worker, asked, answer, fail };
}

test('a job goes to the worker once, one at a time, and its sound is kept as it comes back', async () => {
  const fake = fakeWorker();
  const bank = new Bank(() => fake.worker);
  bank.want(owl);
  bank.want(owl);
  bank.want(wind);
  bank.pump();
  bank.pump();
  assert.equal(fake.asked.length, 1, 'one at a time');
  assert.deepEqual(fake.asked[0]?.job, owl);
  const made = bank.whenMade([owl, wind]);
  fake.answer();
  assert.ok(bank.has(owl));
  assert.equal(fake.asked.length, 1, 'the next is sent as the first comes back');
  fake.answer();
  await made;
  assert.ok(bank.has(wind));
  bank.want(owl);
  bank.pump();
  assert.equal(fake.asked.length, 0, 'a sound kept is never asked for again');
});

test('with no worker, jobs are made on the page one a pump; a worker that fails leaves them to the page', async () => {
  const bank = new Bank(() => null);
  bank.want(owl);
  bank.want(wind);
  bank.pump();
  assert.ok(bank.has(owl) && !bank.has(wind));
  bank.pump();
  assert.ok(bank.has(wind));
  const fake = fakeWorker();
  const failing = new Bank(() => fake.worker);
  failing.want(owl);
  failing.want(wind);
  failing.pump();
  fake.fail();
  failing.pump();
  assert.ok(failing.has(wind), 'made on the page once the worker failed');
  failing.want(owl);
  failing.pump();
  assert.ok(!failing.has(owl), 'the job the worker failed on is not asked again');
  await failing.whenMade([owl, wind]);
});

test('only the sounds of the places still sounding are kept', () => {
  const bank = new Bank(() => null);
  bank.want(owl);
  bank.want(wind);
  bank.pump();
  bank.pump();
  assert.equal(bank.held.sounds, 2);
  bank.keepOnly(new Set(['bed:wind.moan']));
  assert.equal(bank.held.sounds, 1);
  assert.ok(bank.has(wind) && !bank.has(owl));
  assert.ok(bank.held.bytes > 0);
});
