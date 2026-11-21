import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Role, type Song, makeSong } from './score.ts';
import { fmVoice, noteToHz } from './fmBank.ts';
import { PARTIALS_HZ, SongPlayer, barLineAfter, depthOf, notesInWindow, songTail, unisonCents } from './songPlayer.ts';

/** An audio context that builds nothing, keeping when each source was asked to start and to stop. */
function fakeAudio() {
  const starts: number[] = [];
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    cancelScheduledValues() {},
  });
  const node = (more: object) => ({ connect: (to: unknown) => to, disconnect() {}, ...more });
  const source = (more: object) =>
    node({ start: (when: number) => starts.push(Math.round(when * 1000) / 1000), stop() {}, onended: null, ...more });
  const audio = {
    currentTime: 0,
    sampleRate: 44100,
    createGain: () => node({ gain: param() }),
    createOscillator: () => source({ frequency: param(), detune: param() }),
    createBufferSource: () => source({ buffer: null, loop: false }),
    createBiquadFilter: () => node({ frequency: param(), Q: param(), gain: param(), type: 'lowpass' }),
    createStereoPanner: () => node({ pan: param() }),
    createDynamicsCompressor: () =>
      node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
    createWaveShaper: () => node({ curve: null, oversample: 'none' }),
    createBuffer: (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
  };
  return { audio: audio as unknown as BaseAudioContext, starts };
}

/** Two bars at 120 a minute (a beat half a second): the lead on every beat, the pad half a beat into each bar, the
 *  kick a quarter beat into each. */
const SONG: Song = makeSong(
  {
    name: 'test',
    bpm: 120,
    bars: 2,
    tracks: {
      lead: { program: 73, volume: 100, pan: 64, role: 'lead' },
      pad: { program: 89, volume: 100, pan: 64, role: 'bed' },
    },
    kit: { volume: 100, role: 'combat', keys: { kick: 36 } },
  },
  (w) => {
    for (let beat = 0; beat < 8; beat++) w.note('lead', 0, beat, 0.5, 'C5', 100);
    for (let bar = 0; bar < 2; bar++) {
      w.note('pad', bar, 0.5, 3, 'C3', 80);
      w.hit('kick', bar, 0.25, 100);
    }
  },
);

/** The distinct times anything started, below `until`. */
const heard = (starts: readonly number[], until = Infinity) =>
  [...new Set(starts)].filter((when) => when < until).sort((a, b) => a - b);

function played(roles: readonly Role[], seconds: number, step = 0.1) {
  const { audio, starts } = fakeAudio();
  let now = 0;
  const player = new SongPlayer(audio, audio.createGain(), { timed: false, clock: () => now });
  player.play(SONG, 0, { roles: new Set(roles) });
  for (now = 0; now <= seconds; now += step) player.pump(now);
  return { player, starts, at: (time: number) => (now = time) };
}

test('the notes in a window are those from its start up to, not at, its end', () => {
  const ticks = notesInWindow(SONG.notes, 60, 240).map((note) => note.tick);
  assert.deepEqual(ticks, [60, 120, 180]);
  assert.deepEqual(
    notesInWindow(SONG.notes, 0, 31).map((note) => note.tick),
    [0, 15, 30],
  );
});

test('a unison spreads its copies evenly either side of the note; a bar line is found from any time', () => {
  assert.deepEqual(unisonCents(1, 10), [0]);
  assert.deepEqual(unisonCents(3, 12), [-12, 0, 12]);
  assert.deepEqual(unisonCents(2, 5), [-5, 5]);
  assert.equal(barLineAfter(1, 2, 0), 1);
  assert.equal(barLineAfter(1, 2, 1), 1);
  assert.equal(barLineAfter(1, 2, 1.01), 3);
  assert.equal(barLineAfter(1, 2, 4.99), 5);
});

test('only the layers playing are built: the lead alone, then the bed and the drums with it', () => {
  const lead = played(['lead'], 3.8);
  assert.deepEqual(heard(lead.starts), [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
  const all = played(['lead', 'bed', 'combat'], 1.8);
  assert.deepEqual(heard(all.starts, 2), [0, 0.125, 0.25, 0.5, 1, 1.5]);
});

test('a song loops on its bar line to the tick: its second pass begins as its first ends', () => {
  const { starts } = played(['bed'], 7.8);
  assert.deepEqual(heard(starts), [0.25, 2.25, 4.25, 6.25]);
});

test('layers change from the bar line asked for, never inside a bar', () => {
  const { audio, starts } = fakeAudio();
  let now = 0;
  const player = new SongPlayer(audio, audio.createGain(), { timed: false, clock: () => now });
  player.play(SONG, 0, { roles: new Set<Role>(['lead']) });
  for (now = 0; now < 0.6; now += 0.1) player.pump(now);
  const bar = player.nextBar(now);
  assert.equal(bar, 2, 'the next bar line past what is scheduled');
  player.setRoles(new Set<Role>(['bed', 'combat']), bar);
  for (; now < 3.9; now += 0.1) player.pump(now);
  assert.deepEqual(heard(starts), [0, 0.5, 1, 1.5, 2.125, 2.25]);
});

test('a page that stalls past the window skips the gap instead of playing it all at once', () => {
  const { audio, starts } = fakeAudio();
  let now = 0;
  const player = new SongPlayer(audio, audio.createGain(), { timed: false, clock: () => now });
  player.play(SONG, 0, { roles: new Set<Role>(['lead']) });
  now = 2.6;
  player.pump(now);
  assert.ok(
    heard(starts).every((when) => when < 0.3 || when >= 2.6),
    `nothing scheduled in the past: ${heard(starts)}`,
  );
});

test('a song played once is finished once its last note has rung out; a fade to nothing stops a song after it', () => {
  const { audio } = fakeAudio();
  let now = 0;
  const player = new SongPlayer(audio, audio.createGain(), { timed: false, clock: () => now });
  player.play(SONG, 0, { loop: false });
  assert.equal(songTail(SONG), 3.75 + 2, 'its last notes end at 3.75 s, then two seconds of ring');
  assert.equal(player.finished(5.7), false);
  assert.equal(player.finished(5.75), true);
  player.play(SONG, 0);
  player.fade(0, 1, 0.5);
  assert.equal(player.idle(1.4), false);
  now = 1.6;
  player.pump(now);
  assert.equal(player.song, null);
});

test('a high note dulls rather than rings: its partials stay under the ceiling, a low or middle note keeps its depth', () => {
  const bells = fmVoice(14);
  const reach = (hertz: number) => hertz * (bells.car + bells.mod) + depthOf(bells, hertz);
  for (const name of [45, 57, 69])
    assert.equal(depthOf(bells, noteToHz(name)), bells.index * noteToHz(name), `${name}`);
  for (const name of [81, 88]) assert.ok(reach(noteToHz(name)) <= PARTIALS_HZ + 1, `${name} under the ceiling`);
  for (const name of [96, 108])
    assert.equal(
      depthOf(bells, noteToHz(name)),
      1,
      `${name}: its carrier and modulator alone pass it, so it plays plain`,
    );
});
