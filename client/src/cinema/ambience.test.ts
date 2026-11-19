import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Ambience, type SoundOut } from './ambience.ts';

/** A stand-in audio context that counts what it is asked to make and lets a test end every source by hand. */
function fakeAudio() {
  const made: string[] = [];
  const live = new Set<object>();
  const endings: (() => void)[] = [];
  const gains: { readonly gain: { readonly values: number[] } }[] = [];
  const param = () => {
    const values: number[] = [];
    const record = (value: number) => values.push(value);
    return {
      value: 0,
      values,
      setValueAtTime: record,
      linearRampToValueAtTime: record,
      setTargetAtTime: record,
      cancelScheduledValues: () => undefined,
    };
  };
  const node = (kind: string) => {
    made.push(kind);
    const created = {
      kind,
      gain: param(),
      frequency: param(),
      Q: param(),
      pan: param(),
      offset: param(),
      connect: (next: object) => {
        live.add(created);
        return next;
      },
      disconnect: () => live.delete(created),
      start: () => undefined,
      stop: () => undefined,
      addEventListener: (event: string, listener: () => void) => {
        if (event === 'ended') endings.push(listener);
      },
    };
    return created;
  };
  const audio = {
    currentTime: 0,
    sampleRate: 8000,
    createGain: () => {
      const gain = node('gain');
      gains.push(gain);
      return gain;
    },
    createBiquadFilter: () => node('filter'),
    createOscillator: () => node('oscillator'),
    createBufferSource: () => node('source'),
    createStereoPanner: () => node('panner'),
    createConstantSource: () => node('constant'),
    createBuffer: (channels: number, length: number, rate: number) => ({
      duration: length / rate,
      copyToChannel: () => undefined,
    }),
  };
  const out = node('out');
  return { audio, out, made, live, gains, endAll: () => endings.splice(0).forEach((end) => end()) };
}

const outputOf =
  (fake: ReturnType<typeof fakeAudio>, answering: () => boolean): SoundOut =>
  () =>
    answering() ? ({ audio: fake.audio, out: fake.out } as unknown as ReturnType<SoundOut> & object) : null;

test('nothing is made before the output answers, yet the levels glide on', () => {
  const fake = fakeAudio();
  let answering = false;
  const ambience = new Ambience(outputOf(fake, () => answering));
  ambience.set({ rain: 1, gulls: 0.5 }, 2);
  ambience.crash();
  ambience.thunder(1);
  const before = fake.made.length;
  ambience.frame(1);
  assert.equal(fake.made.length, before);
  assert.ok(Math.abs(ambience.levels().rain - 0.5) < 1e-9);
  answering = true;
  ambience.frame(1);
  assert.ok(fake.made.length > before);
  assert.equal(ambience.levels().rain, 1);
});

test('levels are clamped, and a bed builds only once it is heard', () => {
  const fake = fakeAudio();
  const ambience = new Ambience(outputOf(fake, () => true));
  ambience.set({ rain: 3, wind: -1, waves: Number.NaN }, 0);
  assert.deepEqual(ambience.levels(), { rain: 1, wind: 0, waves: 0, fire: 0, deep: 0, gulls: 0, creak: 0 });
  ambience.frame(0.016);
  const sources = fake.made.filter((kind) => kind === 'source').length;
  assert.equal(sources, 2, 'rain alone: its hiss and its roar');
  const writes = () => fake.gains.reduce((total, gain) => total + gain.gain.values.length, 0);
  const steady = writes();
  for (let frame = 0; frame < 60; frame++) ambience.frame(0.016);
  assert.equal(writes(), steady, 'a level that holds is not written again');
});

test('one-shots let go of their nodes once they have played', () => {
  const fake = fakeAudio();
  const ambience = new Ambience(outputOf(fake, () => true));
  ambience.frame(0);
  const before = fake.live.size;
  ambience.crash();
  ambience.splash(1);
  ambience.flash();
  ambience.thud();
  ambience.whoosh();
  ambience.ringing(3);
  assert.ok(fake.live.size > before);
  fake.endAll();
  assert.equal(fake.live.size, before);
});

test('a bed faded in carries its spot sounds, fewer while it is quieter', () => {
  const callsAt = (level: number, glideS: number) => {
    const fake = fakeAudio();
    const ambience = new Ambience(outputOf(fake, () => true));
    ambience.set({ gulls: level }, glideS);
    for (let frame = 0; frame < 1800; frame++) ambience.frame(1 / 60);
    return fake.made.filter((kind) => kind === 'panner').length;
  };
  assert.ok(callsAt(1, 2) >= 10, 'thirty seconds of gulls faded in over two');
  assert.ok(callsAt(0.2, 0) < callsAt(1, 0));
});

test('nonsense numbers are taken as nothing, and thunder too far away is not heard', () => {
  const fake = fakeAudio();
  const ambience = new Ambience(outputOf(fake, () => true));
  ambience.set({ rain: 1 }, Number.NaN);
  ambience.frame(Number.NaN);
  ambience.frame(Number.POSITIVE_INFINITY);
  assert.equal(ambience.levels().rain, 1);
  const written = fake.gains.flatMap((gain) => gain.gain.values);
  assert.ok(written.every(Number.isFinite));
  const before = fake.made.length;
  ambience.thunder(Number.POSITIVE_INFINITY);
  ambience.thunder(Number.NaN);
  ambience.thunder(500);
  assert.equal(fake.made.length, before);
  ambience.ringing(Number.NaN);
  assert.ok(fake.made.length > before, 'a ringing of no length still rings briefly');
});

test('the output moving to a new context carries the beds and the heart over', () => {
  const first = fakeAudio();
  const second = fakeAudio();
  let current = first;
  const ambience = new Ambience(() => ({ audio: current.audio, out: current.out }) as unknown as ReturnType<SoundOut>);
  ambience.set({ rain: 1 }, 0);
  ambience.heartbeat(true);
  first.audio.currentTime = 500;
  ambience.frame(0.1);
  current = second;
  ambience.frame(0.1);
  assert.equal(second.made.filter((kind) => kind === 'source').length, 2, 'the rain on the new context');
  assert.ok(second.made.includes('oscillator'), 'the heart beats on the new clock at once');
  first.endAll();
  assert.equal(first.live.size, 0, 'the old context let go');
});

test('spot sounds fall on a seeded clock while their bed plays, and stop with it', () => {
  const count = () => {
    const fake = fakeAudio();
    const ambience = new Ambience(outputOf(fake, () => true));
    ambience.set({ gulls: 1, creak: 1 }, 0);
    for (let frame = 0; frame < 600; frame++) ambience.frame(1 / 60);
    const calls = fake.made.length;
    ambience.set({ gulls: 0, creak: 0 }, 0);
    for (let frame = 0; frame < 600; frame++) ambience.frame(1 / 60);
    return { calls, after: fake.made.length };
  };
  const first = count();
  assert.deepEqual(count(), first, 'the same every run');
  assert.ok(first.calls > 20, 'ten seconds of gulls and timbers is busy');
  assert.equal(first.after, first.calls, 'silent beds make nothing');
});

test('the heart beats while asked, and stops when told', () => {
  const fake = fakeAudio();
  const ambience = new Ambience(outputOf(fake, () => true));
  ambience.heartbeat(true);
  for (let frame = 0; frame < 4; frame++) {
    fake.audio.currentTime += 0.8;
    ambience.frame(0.8);
  }
  const beating = fake.made.filter((kind) => kind === 'oscillator').length;
  assert.ok(beating >= 8, 'two beats a heartbeat');
  ambience.heartbeat(false);
  fake.audio.currentTime += 2;
  ambience.frame(2);
  assert.equal(fake.made.filter((kind) => kind === 'oscillator').length, beating);
});

test('stop silences every bed and the next sound starts afresh', () => {
  const fake = fakeAudio();
  const ambience = new Ambience(outputOf(fake, () => true));
  ambience.set({ rain: 1, wind: 1, fire: 1, deep: 1, waves: 1 }, 0);
  ambience.frame(0.1);
  ambience.stop();
  assert.deepEqual(Object.values(ambience.levels()), [0, 0, 0, 0, 0, 0, 0]);
  const master = fake.gains[0];
  assert.deepEqual(master?.gain.values, [0], 'it fades out rather than cutting off');
  fake.endAll();
  assert.equal(fake.live.size, 0, 'nothing left connected once the fade is done');
});
