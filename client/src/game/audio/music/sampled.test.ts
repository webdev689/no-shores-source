import assert from 'node:assert/strict';
import { test } from 'node:test';
import listed from '../../../../../content/audio/freesound.json' with { type: 'json' };
import { type Recording, ROOTS, SAMPLE_TOP_HZ, playsOf, rateOf, rootsOf } from './sampled.ts';
import { type Sample, makeSong, midiNote } from './score.ts';
import { SongPlayer } from './songPlayer.ts';

/** An audio context that builds nothing, counting what it builds: oscillators (the FM bank), buffer sources (the
 *  recordings, with their rates and offsets) and lowpasses. */
function fakeAudio() {
  const built = {
    oscillators: 0,
    sources: [] as { rate: number; offset: number; start: number }[],
    lowpasses: [] as number[],
  };
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    setValueCurveAtTime() {},
    cancelScheduledValues() {},
  });
  const node = (more: object) => ({ connect: (to: unknown) => to, disconnect() {}, ...more });
  const audio = {
    currentTime: 0,
    sampleRate: 44100,
    createGain: () => node({ gain: param() }),
    createOscillator: () => {
      built.oscillators++;
      return node({ frequency: param(), detune: param(), start() {}, stop() {}, onended: null });
    },
    createBufferSource: () => {
      const rate = param();
      return node({
        buffer: null,
        playbackRate: rate,
        start: (start: number, offset = 0) => built.sources.push({ rate: rate.value, offset, start }),
        stop() {},
        onended: null,
      });
    },
    createBiquadFilter: () => {
      const frequency = param();
      const filter = node({ frequency, Q: param(), gain: param(), type: 'lowpass' });
      queueMicrotask(() => filter.type === 'lowpass' && built.lowpasses.push(frequency.value));
      return filter;
    },
    createStereoPanner: () => node({ pan: param() }),
    createDynamicsCompressor: () =>
      node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
    createWaveShaper: () => node({ curve: null, oversample: 'none' }),
    createBuffer: (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
  };
  return { audio: audio as unknown as BaseAudioContext, built };
}

/** A recording `seconds` long. */
const recording = (seconds: number): Recording => ({ buffer: { duration: seconds } as AudioBuffer, level: 0.5 });

/** One bar at 60 a minute: a cello on A3 for `beats`, and a taiko struck on the one. */
const songOf = (sample: Sample, beats = 1) =>
  makeSong(
    {
      name: 'sampled',
      bpm: 60,
      bars: 1,
      tracks: { cello: { program: 42, volume: 100, pan: 64, role: 'bed', sample } },
      kit: { volume: 100, role: 'combat', keys: { taiko: 36 }, samples: { taiko: { cue: 'music.taiko', shift: -12 } } },
    },
    (w) => {
      w.note('cello', 0, 0, beats, 'A3', 100);
      w.hit('taiko', 0, 0, 100);
    },
  );

function heard(sample: Sample, have: Readonly<Record<string, Recording>>, beats = 1) {
  const { audio, built } = fakeAudio();
  const player = new SongPlayer(audio, audio.createGain(), {
    timed: false,
    clock: () => 0,
    recordings: (unused, cue) => have[cue] ?? null,
  });
  player.play(songOf(sample, beats), 0.1, { loop: false });
  player.pump(0);
  return built;
}

test("a pitched voice plays at its root's rate, a textural one from its home, and none while a pitched cue has no root", () => {
  const roots = new Map([['music.cello', midiNote('C3')]]);
  assert.equal(rateOf({ cue: 'music.cello' }, midiNote('C4'), roots), 2);
  assert.ok(Math.abs((rateOf({ cue: 'music.cello' }, midiNote('A3'), roots) ?? 0) - 2 ** (9 / 12)) < 1e-12);
  assert.equal(rateOf({ cue: 'music.bowl', home: midiNote('D3') }, midiNote('D2'), roots), 0.5);
  assert.equal(rateOf({ cue: 'music.horn' }, 60, roots), null);
  assert.deepEqual(
    [...rootsOf([{ id: 'music.cello', root: 'C#3' }, { id: 'amb.wind', root: 'C3' }, { id: 'music.bowl' }])],
    [['music.cello', midiNote('C#3')]],
  );
});

test('every root written in freesound.json is a note, on a music cue', () => {
  for (const cue of listed.cues as readonly { id: string; root?: string }[])
    if (cue.root !== undefined) {
      assert.ok(cue.id.startsWith('music.'), `${cue.id} has a root but is no music cue`);
      assert.doesNotThrow(() => midiNote(cue.root ?? ''), `${cue.id}: ${cue.root}`);
    }
  for (const [cue, note] of ROOTS) assert.ok(note >= 24 && note <= 96, `${cue}: ${note}`);
});

test('a note longer than its recording carries on in plays of its middle, each crossfaded into the last', () => {
  assert.deepEqual(playsOf(4, 1, 3), [{ at: 0, offset: 0, length: 4, fadeIn: 0, fadeOut: 0 }]);
  const plays = playsOf(2, 2, 5);
  assert.equal(plays[0]?.length, 1, 'played an octave up it lasts half as long');
  for (let i = 1; i < plays.length; i++) {
    const [before, play] = [plays[i - 1], plays[i]];
    assert.ok(before && play);
    assert.equal(play.offset, 0.5, 'past its attack');
    assert.ok(Math.abs(before.at + before.length - before.fadeOut - play.at) < 1e-9, 'it begins as the last fades');
    assert.equal(play.fadeIn, before.fadeOut, 'the two fades are one crossfade');
  }
  const last = plays[plays.length - 1];
  assert.ok(last && last.at + last.length >= 5, 'the note is played through');
});

test("until a voice's recording has come, or while its cue has no root, the track plays its FM program", async () => {
  const cello: Sample = { cue: 'music.cello', home: midiNote('A3') };
  const synthesised = heard(cello, {});
  assert.ok(synthesised.oscillators > 0, 'no recording: the FM cello');
  const unrooted = heard({ cue: 'music.horn' }, { 'music.horn': recording(4) });
  assert.ok(unrooted.oscillators > 0, 'a pitched cue with no root plays the FM program');
  const sampled = heard(cello, { 'music.cello': recording(4), 'music.taiko': recording(1) });
  assert.equal(sampled.oscillators, 0, 'the recordings play in its place');
  assert.deepEqual(
    sampled.sources.map((source) => source.rate).sort(),
    [0.5, 1],
    'the taiko an octave down, the cello at its home',
  );
  await Promise.resolve();
  assert.ok(sampled.lowpasses.includes(SAMPLE_TOP_HZ), 'every sampled voice passes the lowpass');
  const tap = heard(cello, { 'music.cello': recording(4), 'music.taiko': recording(0.1) });
  assert.equal(tap.sources.filter((source) => source.rate === 0.5).length, 1, 'a short drum sounds once, not twice');
  const long = heard(cello, { 'music.cello': recording(1.5) }, 4);
  assert.ok(long.sources.length > 2 && long.sources.slice(1).every((source) => source.offset > 0), 'played on');
});
