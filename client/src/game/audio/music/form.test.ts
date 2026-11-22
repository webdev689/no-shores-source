import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Arranger, UNHEARD, hearing, makeForm, openingOf, takeAfter } from './form.ts';
import { TICKS_PER_BEAT, type Writer } from './score.ts';
import { SongPlayer } from './songPlayer.ts';

/** A die from a seed, the same rolls every run. */
function die(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const TRACKS = { lead: { program: 73, volume: 100, pan: 64, role: 'lead' } } as const;
const KIT = { volume: 100, role: 'combat', keys: { kick: 36 } } as const;
type Write = Writer<'lead', 'kick'>;

/** Three one-bar takes at 120 a minute (a bar two seconds): the first strikes beat 0, the second beat 1, the third
 *  beat 2; any may follow any other, and the first two open. */
const SONG = makeForm({ name: 'takes', bpm: 120, tracks: TRACKS, kit: KIT }, [
  { section: 'a', bars: 1, next: ['b', 'c'], opens: true, write: (w: Write) => w.note('lead', 0, 0, 0.5, 'C5', 90) },
  { section: 'b', bars: 1, next: ['a', 'c'], opens: true, write: (w: Write) => w.note('lead', 0, 1, 0.5, 'D5', 90) },
  { section: 'c', bars: 1, next: ['a', 'b'], write: (w: Write) => w.note('lead', 0, 2, 0.5, 'E5', 90) },
]);

test('a song made of takes lays them end to end, each with its section, the sections after it and whether it opens', () => {
  assert.equal(SONG.durationTicks, 3 * 4 * TICKS_PER_BEAT);
  assert.deepEqual(
    SONG.form?.takes.map(({ section, first, bars, opens }) => [section, first, bars, opens]),
    [
      ['a', 0, 1, true],
      ['b', 1, 1, true],
      ['c', 2, 1, false],
    ],
  );
  assert.deepEqual(
    SONG.notes.map((note) => note.tick / TICKS_PER_BEAT),
    [0, 5, 10],
  );
});

test("a take's notes stay in it: past its end one runs round to its start, or is dropped, and a held one stops there", () => {
  const write = (w: Write) => {
    w.note('lead', 1, 2, 4, 'C5', 90);
    w.note('lead', 0, 3, 4, 'D5', 90);
  };
  const takes = [
    { section: 'a', bars: 2, next: ['b'], opens: true, write },
    { section: 'b', bars: 2, next: ['a'], opens: true, write: () => undefined },
  ];
  const looped = makeForm({ name: 'looped', bpm: 120, tracks: TRACKS, kit: KIT }, takes);
  assert.deepEqual(
    looped.notes.map((note) => [note.tick / TICKS_PER_BEAT, note.duration / TICKS_PER_BEAT]),
    [
      [3, 4],
      [6, 2],
    ],
    'the held note stops at the take end',
  );
  const late = (w: Write) => w.note('lead', 2, 1, 1, 'C5', 90);
  const wrapped = makeForm({ name: 'wrapped', bpm: 120, tracks: TRACKS, kit: KIT }, [
    { ...takes[0]!, write: late },
    takes[1]!,
  ]);
  assert.deepEqual(
    wrapped.notes.map((note) => note.tick / TICKS_PER_BEAT),
    [1],
    'a note laid past the end sounds at the take start',
  );
  const clipped = makeForm(
    {
      name: 'clipped',
      bpm: 120,
      tracks: TRACKS,
      kit: KIT,
      edge: { wrap: false, clip: true, hold: true, restrike: true },
    },
    [{ ...takes[0]!, write: late }, takes[1]!],
  );
  assert.equal(clipped.notes.length, 0, 'or is dropped where the song does not wrap');
});

test('a form refuses a take nothing may follow, and a song with fewer than two openings', () => {
  const write = () => undefined;
  assert.throws(() =>
    makeForm({ name: 'stuck', bpm: 120, tracks: TRACKS, kit: KIT }, [
      { section: 'a', bars: 1, next: ['a'], opens: true, write },
      { section: 'b', bars: 1, next: ['a'], opens: true, write },
    ]),
  );
  assert.throws(() =>
    makeForm({ name: 'one way in', bpm: 120, tracks: TRACKS, kit: KIT }, [
      { section: 'a', bars: 1, next: ['b'], opens: true, write },
      { section: 'b', bars: 1, next: ['a'], write },
    ]),
  );
});

test('the arranger never plays a take twice running, and a pairing never heard comes before one heard', () => {
  const form = SONG.form!;
  let heard = hearing(UNHEARD, 0, true);
  let take = 0;
  const pairs: string[] = [];
  for (let i = 0; i < 6; i++) {
    const next = takeAfter(form, take, heard, die(i));
    assert.notEqual(next, take);
    pairs.push(`${take}${next}`);
    [heard, take] = [hearing(heard, next, false), next];
  }
  assert.equal(new Set(pairs).size, 6, `all six pairings before any again: ${pairs}`);
});

test("one fight's last take and the next fight's opening are no pairing heard", () => {
  const form = SONG.form;
  assert.ok(form);
  // One fight played a, c, b, c and ended on c; the next opened on a. At c, c then a was never heard (only across
  // the two fights), so it comes before c then b, which was.
  const played = [0, 2, 1, 2].reduce((heard, take, index) => hearing(heard, take, index === 0), UNHEARD);
  const heard = hearing(played, 0, true);
  const after = new Set(Array.from({ length: 40 }, (_unused, roll) => takeAfter(form, 2, heard, () => roll / 40)));
  assert.deepEqual([...after], [0]);
});

test('a song opens on a take that opens, never the one it opened on last', () => {
  const form = SONG.form!;
  let heard = UNHEARD;
  for (let i = 0; i < 8; i++) {
    const opening = openingOf(form, heard, die(i));
    assert.ok(form.takes[opening]?.opens);
    assert.notEqual(opening, heard.opened);
    heard = hearing(heard, opening, true);
  }
});

/** An audio context that builds nothing, keeping when each source was asked to start. */
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

test('the player plays the takes as the arranger chooses them, each from the bar line the last one ends on', () => {
  const { audio, starts } = fakeAudio();
  let now = 0;
  const player = new SongPlayer(audio, audio.createGain(), {
    timed: false,
    clock: () => now,
    arranger: new Arranger(die(7)),
  });
  player.play(SONG, 0);
  for (now = 0; now < 19.6; now += 0.1) player.pump(now);
  const same = new Arranger(die(7));
  const expected: number[] = [];
  let take = same.opening(SONG) ?? 0;
  for (let bar = 0; bar < 10; bar++) {
    expected.push(bar * 2 + (SONG.form?.takes[take]?.section === 'a' ? 0 : take === 1 ? 0.5 : 1));
    take = same.after(SONG, take);
  }
  assert.deepEqual([...new Set(starts)], expected);
  assert.equal(player.nextBar(now), 20, 'its bar lines stay every two seconds');
});
