import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Fetched } from './contentCache.ts';
import { CHUNK_BYTES, fetchedAtWake, Samples } from './soundSamples.ts';
import { standIns } from './standIns.ts';

/** A context whose decoded buffers hold a second of mono samples per decoded byte, its clock moved by hand. */
function fakeAudio() {
  const audio = {
    currentTime: 0,
    decoded: 0,
    decodeAudioData: (bytes: ArrayBuffer) => {
      audio.decoded++;
      const samples = new Float32Array(bytes.byteLength).fill(0.1);
      return Promise.resolve({
        length: samples.length,
        numberOfChannels: 1,
        sampleRate: 1000,
        getChannelData: () => samples,
      });
    },
    createBufferSource: () => ({
      buffer: null,
      playbackRate: { value: 1 },
      connect: (next: unknown) => next,
      start() {},
    }),
    createGain: () => ({ gain: { value: 1 }, connect: (next: unknown) => next }),
  };
  return audio;
}

/** Files read as asked: each file's size by name, a range answered with its part and the whole file's size. */
function reading(sizes: Readonly<Record<string, number>>) {
  const asked: string[] = [];
  const read = (url: string, range?: readonly [number, number]): Promise<Fetched> => {
    const file = url.replace('https://r2/', '');
    const size = sizes[file] ?? 100;
    asked.push(range && size > CHUNK_BYTES ? `${file} ${range[0]}` : file);
    const [first, last] = range ?? [0, size - 1];
    return Promise.resolve({ bytes: new ArrayBuffer(Math.max(0, Math.min(size - 1, last) - first + 1)), total: size });
  };
  return { asked, read };
}

const settled = () => new Promise((done) => setTimeout(done, 0));
const sounds = {
  base: 'https://r2/',
  sounds: {
    'hit.blade': { key: 'hit.mp3' },
    'step.stone': { keys: ['step1.mp3', 'step2.mp3'] },
    'amb.land.breeze': { key: 'breeze.mp3' },
    'story.creak': { key: 'creak.mp3' },
  },
};

test("the sound's waking fetches the short sounds of play, and the ambience and story only once each is asked for", async () => {
  const { asked, read } = reading({});
  const samples = new Samples(sounds, read);
  const audio = fakeAudio();
  samples.wake(audio as unknown as AudioContext);
  await settled();
  assert.deepEqual(asked.sort(), ['hit.mp3', 'step1.mp3', 'step2.mp3']);
  assert.ok(fetchedAtWake('ui.press') && !fetchedAtWake('amb.sea.rain') && !fetchedAtWake('story.wind'));
  const out = {} as AudioNode;
  standIns();
  assert.equal(samples.play(audio as unknown as AudioContext, out, 'amb.land.breeze'), null, 'silent until it comes');
  assert.deepEqual(standIns(), ['sounds'], 'standing in for it meanwhile');
  await settled();
  assert.deepEqual(asked.slice(3), ['breeze.mp3']);
  assert.ok(samples.play(audio as unknown as AudioContext, out, 'amb.land.breeze'), 'played once it has come');
});

test('a long recording is held a chunk at a time, the next fetched as one plays, never more than two at once', async () => {
  const { asked, read } = reading({ 'breeze.mp3': CHUNK_BYTES * 12 });
  const samples = new Samples(sounds, read);
  const audio = fakeAudio();
  const out = {} as AudioNode;
  samples.play(audio as unknown as AudioContext, out, 'amb.land.breeze');
  await settled();
  assert.deepEqual(asked, ['breeze.mp3 0'], 'its first chunk, not its whole');
  assert.equal(samples.bytes, CHUNK_BYTES * 4, 'a chunk decoded, not the file');
  for (let play = 0; play < 6; play++) {
    audio.currentTime += 60;
    assert.ok(samples.play(audio as unknown as AudioContext, out, 'amb.land.breeze'));
    await settled();
  }
  assert.equal(asked.length, 7, 'a chunk fetched for each play');
  assert.ok(samples.bytes <= CHUNK_BYTES * 4 * 2, 'two chunks held at most');
});

test('over its budget, the bank lets go of the ambience played least lately, never a sound of play or one just played', async () => {
  const { read } = reading({});
  const budget = 450 * 4;
  const samples = new Samples(sounds, read, budget);
  const audio = fakeAudio();
  const out = {} as AudioNode;
  samples.wake(audio as unknown as AudioContext);
  await settled();
  const play = (id: string) => samples.play(audio as unknown as AudioContext, out, id);
  play('amb.land.breeze');
  await settled();
  audio.currentTime = 500;
  play('story.creak');
  await settled();
  assert.ok(play('story.creak'), 'the one just come and played is kept');
  assert.ok(play('hit.blade') && play('step.stone'), 'the sounds of play are kept');
  assert.equal(play('amb.land.breeze'), null, 'the breeze, not heard for minutes, was let go to make room');
  await settled();
  assert.ok(play('amb.land.breeze'), 'and comes back once asked for again');
});

test('a cue fetched ahead of its first play is held whatever the budget, so a one-shot heard minutes on still plays', async () => {
  const { asked, read } = reading({});
  const samples = new Samples(sounds, read, 450 * 4);
  const audio = fakeAudio();
  const out = {} as AudioNode;
  samples.wake(audio as unknown as AudioContext);
  samples.prefetch(audio as unknown as AudioContext, ['story.creak']);
  await settled();
  assert.ok(asked.includes('creak.mp3'), 'fetched before anything asks to play it');
  const play = (id: string) => samples.play(audio as unknown as AudioContext, out, id);
  audio.currentTime = 500;
  play('amb.land.breeze');
  await settled();
  assert.ok(play('story.creak'), 'still held, minutes on, though the bank went over its budget');
});

test('a cue released is held under the budget as any other again, and let go to make room', async () => {
  const { read } = reading({});
  const samples = new Samples(sounds, read, 450 * 4);
  const audio = fakeAudio();
  const out = {} as AudioNode;
  samples.wake(audio as unknown as AudioContext);
  samples.prefetch(audio as unknown as AudioContext, ['story.creak']);
  await settled();
  samples.release(['story.creak']);
  const play = (id: string) => samples.play(audio as unknown as AudioContext, out, id);
  audio.currentTime = 500;
  play('amb.land.breeze');
  await settled();
  assert.equal(play('story.creak'), null, 'its story over, let go for the breeze');
});

test('a long recording plays each chunk it fetches, never one twice in a row, and none is let go unplayed', async () => {
  const { asked, read } = reading({ 'breeze.mp3': CHUNK_BYTES * 12 });
  const samples = new Samples(sounds, read);
  const audio = fakeAudio();
  const out = {} as AudioNode;
  samples.play(audio as unknown as AudioContext, out, 'amb.land.breeze');
  await settled();
  const played: unknown[] = [];
  for (let play = 0; play < 8; play++) {
    audio.currentTime += 60;
    const source = samples.play(audio as unknown as AudioContext, out, 'amb.land.breeze');
    played.push(source?.buffer);
    await settled();
  }
  for (let play = 1; play < played.length; play++) assert.notEqual(played[play], played[play - 1], `play ${play}`);
  assert.equal(new Set(played).size, played.length, 'each play a chunk not heard before, while new ones come');
  assert.equal(asked.length, played.length + 1, 'each chunk fetched once');
});

test("a long recording's last part, shorter than a chunk, is fetched and played too", async () => {
  const { asked, read } = reading({ 'breeze.mp3': Math.round(CHUNK_BYTES * 1.9) });
  const samples = new Samples(sounds, read);
  const audio = fakeAudio();
  const out = {} as AudioNode;
  samples.play(audio as unknown as AudioContext, out, 'amb.land.breeze');
  await settled();
  samples.play(audio as unknown as AudioContext, out, 'amb.land.breeze');
  await settled();
  assert.deepEqual(asked, ['breeze.mp3 0', `breeze.mp3 ${CHUNK_BYTES}`]);
});

test('a long recording plays its chunks in order, its last part included, then from the first again', async (t) => {
  t.mock.method(Math, 'random', () => 0.999);
  const { asked, read } = reading({ 'breeze.mp3': Math.round(CHUNK_BYTES * 3.5) });
  const samples = new Samples(sounds, read);
  const audio = fakeAudio();
  const out = {} as AudioNode;
  const played: number[] = [];
  for (let play = 0; play < 9; play++) {
    audio.currentTime += 60;
    const source = samples.play(audio as unknown as AudioContext, out, 'amb.land.breeze');
    if (source) played.push(Math.round(((source.buffer?.length ?? 0) / CHUNK_BYTES) * 10));
    await settled();
  }
  const chunks = [0, 1, 2, 3, 0, 1, 2, 3];
  assert.deepEqual(
    asked.slice(0, 5),
    [...chunks.slice(0, 5)].map((chunk) => `breeze.mp3 ${chunk * CHUNK_BYTES}`),
  );
  assert.deepEqual(played, [10, 10, 10, 5, 10, 10, 10, 5], 'in order, the short last part fourth, then again');
});

test('a recording that failed to come is asked for again only after a wait, not every tick', async () => {
  let reads = 0;
  const read = (): Promise<Fetched> => {
    reads++;
    return Promise.reject(new Error('offline'));
  };
  const samples = new Samples(sounds, read);
  const audio = fakeAudio();
  const out = {} as AudioNode;
  for (let tick = 0; tick < 20; tick++) {
    audio.currentTime += 0.1;
    samples.play(audio as unknown as AudioContext, out, 'amb.land.breeze');
    await settled();
  }
  assert.equal(reads, 1, 'asked once in two seconds');
  standIns();
  samples.play(audio as unknown as AudioContext, out, 'amb.land.breeze');
  assert.deepEqual(standIns(), [], 'a recording that failed holds up no veil while it waits');
  audio.currentTime += 31;
  samples.play(audio as unknown as AudioContext, out, 'amb.land.breeze');
  await settled();
  assert.equal(reads, 2, 'and again once the wait has passed');
});
