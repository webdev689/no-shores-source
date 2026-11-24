import assert from 'node:assert/strict';
import { test } from 'node:test';
import listed from '../../../../../content/audio/freesound.json' with { type: 'json' };
import bank from '../../../../../content/audio/sounds.json' with { type: 'json' };
import { LOWPASS_HZ, type Recording, ROOTS, playsOf, rateOf, rootNote, rootsOf } from './sampled.ts';
import { type Sample, makeSong, midiNote } from './score.ts';
import { SongPlayer } from './songPlayer.ts';

/** An audio context that builds nothing, counting what it builds: oscillators (the FM bank), buffer sources (the
 *  recordings, with their rates and offsets) and lowpasses. */
function fakeAudio() {
  const built = {
    oscillators: 0,
    sources: [] as { rate: number; offset: number; start: number; stop: number }[],
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
      const played = { rate: 0, offset: 0, start: 0, stop: Infinity };
      return node({
        buffer: null,
        playbackRate: rate,
        start: (start: number, offset = 0) => {
          Object.assign(played, { rate: rate.value, offset, start });
          built.sources.push(played);
        },
        stop: (stop: number) => (played.stop = stop),
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

/** One bar at 60 a minute: a cello on A3 for `beats` (and C4 and E4 after it), a taiko on the one, a riser
 *  landing on beat 2. */
const songOf = (sample: Sample, beats = 1) =>
  makeSong(
    {
      name: 'sampled',
      bpm: 60,
      bars: 1,
      tracks: { cello: { program: 42, volume: 100, pan: 64, role: 'bed', sample } },
      kit: {
        volume: 100,
        role: 'combat',
        keys: { taiko: 36, riser: 55 },
        drums: { riser: { attack: 1.6, decay: 0.1 } },
        samples: { taiko: { cue: 'music.taiko', shift: -12 }, riser: { cue: 'music.riser', lands: 1.6 } },
      },
    },
    (w) => {
      w.note('cello', 0, 0, beats, 'A3', 100);
      w.note('cello', 0, 1, 1, 'C4', 100);
      w.note('cello', 0, 2, 1, 'E4', 100);
      w.hit('taiko', 0, 0, 100);
      w.hit('riser', 0, 0.4, 100);
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
  for (let now = 0; now < 4; now += 0.1) player.pump(now);
  return built;
}

test("a pitched voice plays at its root's rate, a textural one from its home, and none while a pitched cue has no root", () => {
  const roots = new Map([['music.cello', midiNote('C3')]]);
  assert.equal(rateOf({ cue: 'music.cello' }, midiNote('C4'), roots), 2);
  assert.ok(Math.abs((rateOf({ cue: 'music.cello' }, midiNote('A3'), roots) ?? 0) - 2 ** (9 / 12)) < 1e-12);
  assert.equal(rateOf({ cue: 'music.bowl', home: midiNote('D3') }, midiNote('D2'), roots), 0.5);
  assert.equal(rateOf({ cue: 'music.horn' }, 60, roots), null);
  assert.deepEqual(
    [...rootsOf({ 'music.cello': { root: 'C#3' }, 'amb.wind': { root: 'C3' }, 'music.bowl': {} })],
    [['music.cello', midiNote('C#3')]],
  );
});

test("a root keeps its cents: a pick 38 cents flat of C3 plays C3 38 cents sharp of the recording's own", () => {
  assert.equal(rootNote('C3'), midiNote('C3'));
  assert.ok(Math.abs(rootNote('C3-38') - (midiNote('C3') - 0.38)) < 1e-9);
  assert.ok(Math.abs(rootNote('F#2+12') - (midiNote('F#2') + 0.12)) < 1e-9);
  assert.throws(() => rootNote('C3 -38 cents'));
  const rate = rateOf({ cue: 'music.cello' }, midiNote('C3'), new Map([['music.cello', rootNote('C3-38')]]));
  assert.ok(Math.abs((rate ?? 0) - 2 ** (0.38 / 12)) < 1e-12);
});

test('every root written, in freesound.json and on the published sounds, is a note on a music cue', () => {
  const written = [
    ...(listed.cues as readonly { id: string; root?: string }[]).map((cue) => [cue.id, cue.root] as const),
    ...Object.entries(bank.sounds as Readonly<Record<string, { root?: string }>>).map(
      ([id, sound]) => [id, sound.root] as const,
    ),
  ];
  for (const [id, root] of written)
    if (root !== undefined) {
      assert.ok(id.startsWith('music.'), `${id} has a root but is no music cue`);
      assert.doesNotThrow(() => rootNote(root), `${id}: ${root}`);
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
    sampled.sources
      .map((source) => source.rate)
      .filter((rate) => rate > 0)
      .sort(), // the FM riser's noise has none
    [0.5, 1, 1.189207115002721, 1.4983070768766815],
    'the taiko an octave down, the cello at its home and over it',
  );
  await Promise.resolve();
  // Two in a row for the cello's three notes, and two for the drums.
  assert.deepEqual(sampled.lowpasses, Array(4).fill(LOWPASS_HZ), 'one lowpass a channel, not one a note');
  const tap = heard(cello, { 'music.cello': recording(4), 'music.taiko': recording(0.1) });
  assert.equal(tap.sources.filter((source) => source.rate === 0.5).length, 1, 'a short drum sounds once, not twice');
  const long = heard(cello, { 'music.cello': recording(1.5) }, 4).sources.filter((source) => source.rate === 1);
  assert.ok(long.length > 2 && long.slice(1).every((source) => source.offset > 0), 'the long A3 played on');
});

test("a sampled drum lasts no longer than its kit's drum, and a riser's recording ends on the beat it lands on", () => {
  const cello: Sample = { cue: 'music.cello', home: midiNote('A3') };
  const taiko = heard(cello, { 'music.taiko': recording(5) }).sources.find((source) => source.rate === 0.5);
  // The bank's bass drum, key 36: 2 ms to its peak, a quarter second to die.
  assert.ok(taiko && taiko.stop <= 0.1 + 0.002 + 0.24 + 0.021, `the taiko stops at ${taiko?.stop}`);
  const hit = 0.1 + 0.4;
  const long = heard(cello, { 'music.riser': recording(4) }).sources.find((source) => source.rate === 1);
  assert.ok(long && Math.abs(long.start - hit) < 1e-9 && Math.abs(long.offset - 2.4) < 1e-9, 'entered late');
  assert.ok(long && Math.abs(long.stop - (hit + 1.6 + 0.02)) < 1e-9, 'ending as it lands');
  const short = heard(cello, { 'music.riser': recording(1) }).sources.find((source) => source.rate === 1);
  assert.ok(short && Math.abs(short.start - (hit + 0.6)) < 1e-9, 'begun late, so it ends as it lands');
});
