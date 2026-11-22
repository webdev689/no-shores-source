import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Fetched } from './contentCache.ts';
import { CHUNK_BYTES, fetchedAtWake, Samples } from './soundSamples.ts';

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
  assert.equal(samples.play(audio as unknown as AudioContext, out, 'amb.land.breeze'), null, 'silent until it comes');
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
