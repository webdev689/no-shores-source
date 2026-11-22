import assert from 'node:assert/strict';
import { test } from 'node:test';
import listed from '../../../content/audio/freesound.json' with { type: 'json' };
import { Ambience, RECORDED_BEDS, RECORDED_SHOTS, type SoundOut } from './ambience.ts';
import type { playSample } from '../soundSamples.ts';

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
      setValueCurveAtTime: () => undefined,
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
  const played: { readonly cue: string; readonly when: number }[] = [];
  /** Plays every recording as come, ten seconds long. */
  const play = ((...args: unknown[]) => {
    const [cue, how] = [args[2] as string, args[4] as { when?: number }];
    played.push({ cue, when: how.when ?? 0 });
    return Object.assign(node('source'), { buffer: { duration: 10 } });
  }) as unknown as typeof playSample;
  return { audio, out, made, live, gains, played, play, endAll: () => endings.splice(0).forEach((end) => end()) };
}

const outputOf =
  (fake: ReturnType<typeof fakeAudio>, answering: () => boolean): SoundOut =>
  () =>
    answering() ? ({ audio: fake.audio, out: fake.out } as unknown as ReturnType<SoundOut> & object) : null;

const ambienceOn = (fake: ReturnType<typeof fakeAudio>, answering = () => true) =>
  new Ambience(outputOf(fake, answering), fake.play);
const cues = (fake: ReturnType<typeof fakeAudio>) => fake.played.map((each) => each.cue);

test('nothing plays before the output answers, yet the levels glide on', () => {
  const fake = fakeAudio();
  let answering = false;
  const ambience = ambienceOn(fake, () => answering);
  ambience.set({ rain: 1, gulls: 0.5 }, 2);
  ambience.crash();
  ambience.thunder(1);
  ambience.frame(1);
  assert.equal(fake.played.length, 0);
  assert.ok(Math.abs(ambience.levels().rain - 0.5) < 1e-9);
  answering = true;
  ambience.frame(1);
  assert.deepEqual(cues(fake), ['amb.sea.rain']);
  assert.equal(ambience.levels().rain, 1);
});

test('levels are clamped, a bed plays only once it is heard, and each play fades into the next', () => {
  const fake = fakeAudio();
  const ambience = ambienceOn(fake);
  ambience.set({ rain: 3, wind: -1, waves: Number.NaN }, 0);
  assert.deepEqual(ambience.levels(), { rain: 1, wind: 0, waves: 0, fire: 0, deep: 0, gulls: 0, creak: 0 });
  ambience.frame(0.016);
  assert.deepEqual(cues(fake), ['amb.sea.rain'], 'rain alone');
  const writes = () => fake.gains.reduce((total, gain) => total + gain.gain.values.length, 0);
  const steady = writes();
  for (let frame = 0; frame < 60; frame++) ambience.frame(0.016);
  assert.equal(writes(), steady, 'a level that holds is not written again');
  assert.equal(fake.played.length, 1, 'one play while it lasts');
  fake.audio.currentTime = 7.5;
  ambience.frame(0.016);
  assert.equal(fake.played.length, 2, 'the next play comes in before the last ends');
});

test('a bed whose recording has not come makes no new node each frame while it waits', () => {
  const fake = fakeAudio();
  let come = false;
  const play = ((...args: unknown[]) =>
    come ? (fake.play as (...all: unknown[]) => unknown)(...args) : null) as unknown as typeof playSample;
  const ambience = new Ambience(
    outputOf(fake, () => true),
    play,
  );
  ambience.set({ rain: 1 }, 0);
  ambience.frame(0.016);
  const waiting = fake.made.length;
  for (let frame = 0; frame < 120; frame++) ambience.frame(0.016);
  assert.equal(fake.made.length, waiting, 'two seconds of waiting made nothing more');
  come = true;
  ambience.frame(0.016);
  assert.deepEqual(cues(fake), ['amb.sea.rain'], 'it plays once it has come');
});

test('every one-shot plays its recording and lets go of its nodes once it has played', () => {
  const fake = fakeAudio();
  const ambience = ambienceOn(fake);
  ambience.frame(0);
  const before = fake.live.size;
  ambience.crash();
  ambience.splash(1);
  ambience.flash();
  ambience.thud();
  ambience.whoosh();
  ambience.ringing();
  ambience.thunder(1);
  ambience.thunder(5);
  assert.deepEqual(cues(fake), [
    'story.crash',
    'story.splash',
    'story.flash',
    'story.thud',
    'story.whoosh',
    'story.ringing',
    'amb.thunder.crack',
    'amb.thunder.roll',
  ]);
  assert.ok(Math.abs((fake.played.at(-1)?.when ?? 0) - 5 / 0.343) < 1e-9, 'a far strike is heard after its flash');
  assert.ok(fake.live.size > before);
  fake.endAll();
  assert.equal(fake.live.size, before);
});

test('the gulls cry on a seeded clock while their level is up, one flock at a time, fewer while lower, and stop', () => {
  const cries = (level: number, glideS: number) => {
    const fake = fakeAudio();
    const ambience = ambienceOn(fake);
    ambience.set({ gulls: level }, glideS);
    for (let frame = 0; frame < 1800; frame++) {
      fake.audio.currentTime += 1 / 60;
      ambience.frame(1 / 60);
    }
    const starts = fake.played.filter((each) => each.cue === 'amb.sea.gull').map((each) => each.when);
    // The fake's every recording lasts 10 s.
    assert.ok(
      starts.every((when, index) => index === 0 || when >= starts[index - 1] + 10),
      'each flock starts once the last has ended',
    );
    const crying = starts.length;
    ambience.set({ gulls: 0 }, 0);
    for (let frame = 0; frame < 600; frame++) ambience.frame(1 / 60);
    return { crying, after: cues(fake).filter((cue) => cue === 'amb.sea.gull').length };
  };
  const first = cries(1, 2);
  assert.deepEqual(cries(1, 2), first, 'the same every run');
  assert.ok(first.crying >= 2, 'thirty seconds of ten-second flocks, faded in over two');
  assert.equal(first.after, first.crying, 'silent gulls cry no more');
  assert.ok(cries(0.2, 0).crying < cries(1, 0).crying);
});

test('nonsense numbers are taken as nothing, and thunder too far away is not heard', () => {
  const fake = fakeAudio();
  const ambience = ambienceOn(fake);
  ambience.set({ rain: 1 }, Number.NaN);
  ambience.frame(Number.NaN);
  ambience.frame(Number.POSITIVE_INFINITY);
  assert.equal(ambience.levels().rain, 1);
  const written = fake.gains.flatMap((gain) => gain.gain.values);
  assert.ok(written.every(Number.isFinite));
  const before = fake.played.length;
  ambience.thunder(Number.POSITIVE_INFINITY);
  ambience.thunder(Number.NaN);
  ambience.thunder(500);
  assert.equal(fake.played.length, before);
});

test('the output moving to a new context carries the beds and the heart over', () => {
  const first = fakeAudio();
  const second = fakeAudio();
  let current = first;
  const play = ((...args: Parameters<typeof playSample>) => current.play(...args)) as typeof playSample;
  const ambience = new Ambience(
    () => ({ audio: current.audio, out: current.out }) as unknown as ReturnType<SoundOut>,
    play,
  );
  ambience.set({ rain: 1 }, 0);
  ambience.heartbeat(true);
  first.audio.currentTime = 500;
  ambience.frame(0.1);
  current = second;
  ambience.frame(0.1);
  assert.ok(cues(second).includes('amb.sea.rain'), 'the rain on the new context');
  assert.ok(
    second.played.some((each) => each.cue === 'story.heartbeat' && each.when < 1),
    'the heart on the new clock',
  );
  first.endAll();
  assert.equal(first.live.size, 0, 'the old context let go');
});

test('the heart beats while asked, and stops when told', () => {
  const fake = fakeAudio();
  const ambience = ambienceOn(fake);
  ambience.heartbeat(true);
  for (let frame = 0; frame < 4; frame++) {
    fake.audio.currentTime += 0.8;
    ambience.frame(0.8);
  }
  const beats = () => cues(fake).filter((cue) => cue === 'story.heartbeat').length;
  const beating = beats();
  assert.ok(beating >= 4, 'a beat every 0.8 s');
  ambience.heartbeat(false);
  fake.audio.currentTime += 2;
  ambience.frame(2);
  assert.equal(beats(), beating);
});

test('stop silences every bed and the next sound starts afresh', () => {
  const fake = fakeAudio();
  const ambience = ambienceOn(fake);
  ambience.set({ rain: 1, wind: 1, fire: 1, deep: 1, waves: 1 }, 0);
  ambience.frame(0.1);
  ambience.stop();
  assert.deepEqual(Object.values(ambience.levels()), [0, 0, 0, 0, 0, 0, 0]);
  const master = fake.gains[0];
  assert.deepEqual(master?.gain.values, [0], 'it fades out rather than cutting off');
  fake.endAll();
  assert.equal(fake.live.size, 0, 'nothing left connected once the fade is done');
});

test("the world's own soundscape takes the sea, the weather, the timbers and the gulls, never the fire or the deep", () => {
  const ambience = ambienceOn(fakeAudio());
  ambience.set({ rain: 1, wind: 1, waves: 1, creak: 0.5, gulls: 1, fire: 1, deep: 1 }, 0);
  ambience.handOver(true);
  ambience.frame(0.75);
  assert.equal(ambience.levels().rain, 0.5, 'half handed over');
  ambience.frame(1);
  assert.deepEqual(ambience.levels(), { rain: 0, wind: 0, waves: 0, fire: 1, deep: 1, gulls: 0, creak: 0 });
  ambience.handOver(false);
  ambience.frame(1.5);
  assert.deepEqual(ambience.levels(), { rain: 1, wind: 1, waves: 1, fire: 1, deep: 1, gulls: 1, creak: 0.5 });
});

test("every story cue the Freesound list holds is one of the story's sounds, and every sound a picked recording", () => {
  const recordings = [...Object.values(RECORDED_BEDS), ...Object.values(RECORDED_SHOTS)];
  const played = recordings.map((recorded) => recorded.cue).filter((cue) => cue.startsWith('story.'));
  const searched = listed.cues.map((cue) => cue.id).filter((id) => id.startsWith('story.'));
  assert.deepEqual([...searched].sort(), [...played].sort());
  const picked = new Set(listed.cues.filter((cue) => 'picked' in cue).map((cue) => cue.id));
  for (const recorded of recordings) {
    assert.ok(picked.has(recorded.cue), `${recorded.cue} is picked`);
    assert.ok(recorded.loudness.loud > 0 && recorded.loudness.peak >= recorded.loudness.loud, `${recorded.cue}`);
  }
});
