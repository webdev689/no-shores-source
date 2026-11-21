import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Scores, MusicDirector, overlookScores, songOf, stingOf } from './director.ts';
import type { HeardFoe, Hearing } from './directorLaw.ts';
import { makeSong } from './score.ts';

const scores = overlookScores();
/** The scores with the green family's fight and Saltmere's theme unwritten. */
const unwritten: Scores = { ...scores, families: { ...scores.families, green: null }, social: [] };

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
    node({ start: (when: number) => starts.push(when), stop() {}, onended: null, ...more });
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

/** A director over a fake output, run frame by frame on its own clock; what it lowered the ambience to, each time. */
function directed(made: () => Scores = () => scores) {
  const { audio, starts } = fakeAudio();
  const ducks: number[] = [];
  let now = 0;
  const out = audio.createGain();
  const director = new MusicDirector({
    output: () => ({ audio, out }),
    duck: (level) => ducks.push(level),
    timed: false,
    clock: () => now,
    scores: made,
  });
  const frames = (hearing: Hearing, seconds: number) => {
    for (let spent = 0; spent < seconds; spent += 0.1) {
      now += 0.1;
      director.frame(hearing, 0.1);
      director.pump(now);
    }
  };
  return { frames, starts, ducks, clock: () => now };
}

const island: Hearing = {
  place: { kind: 'island', climate: 'highland', node: 'patrol' },
  dead: false,
  health: 1,
  struck: false,
  kills: 0,
  foes: [],
  sea: null,
  sky: null,
};
const brute = (more: Partial<HeardFoe>): HeardFoe => ({
  id: 1,
  name: 'Brute',
  rank: 1,
  alert: 2,
  distance: 10,
  health: 1,
  engaged: false,
  ...more,
});

test("a cue's song: a family's fight, Saltmere's theme, a boss score's last phase for its last stand", () => {
  assert.equal(songOf(scores, { kind: 'family', family: 'green' })?.name, 'green-fight');
  assert.equal(songOf(scores, { kind: 'family', family: 'dry' })?.name, 'dry-fight');
  assert.equal(songOf(scores, { kind: 'family', family: 'wet' })?.name, 'wet-fight');
  assert.equal(songOf(scores, { kind: 'family', family: 'cold' })?.name, 'cold-fight');
  assert.equal(songOf(scores, { kind: 'social', piece: 0 })?.name, 'saltmere');
  assert.equal(songOf(unwritten, { kind: 'family', family: 'green' }), null, 'a score not written is silence');
  assert.equal(songOf(unwritten, { kind: 'social', piece: 0 }), null);
  assert.equal(songOf(scores, { kind: 'none' }), null);
  assert.equal(songOf(scores, { kind: 'sea', song: 'storm' })?.name, 'sea-storm');
  assert.equal(songOf(scores, { kind: 'boss', boss: 'reckoning', part: 2 })?.name, 'reckoning-2');
  assert.equal(songOf(scores, { kind: 'boss', boss: 'reckoning', part: 'last' })?.name, 'reckoning-last');
  assert.equal(songOf(scores, { kind: 'boss', boss: 'wrath', part: 'last' })?.name, 'wrath-3');
});

test("a sting's song: a boss's wake, fall and the player's end where its score has one, else silence", () => {
  assert.equal(stingOf(scores, { kind: 'wake', boss: 'boarding' })?.name, 'boarding-wake');
  assert.equal(stingOf(scores, { kind: 'wake', boss: 'reckoning' }), null);
  assert.equal(stingOf(scores, { kind: 'fallen', boss: 'wrath' })?.name, 'wrath-fallen');
  assert.equal(stingOf(scores, { kind: 'fallen', boss: 'boarding' })?.name, 'boarding-hymn');
  const boarding = { kind: 'boss', boss: 'boarding', part: 2 } as const;
  assert.equal(stingOf(scores, { kind: 'defeat', cue: boarding })?.name, 'boarding-end');
  assert.equal(stingOf(scores, { kind: 'victory', cue: boarding }), null);
  const dry = { kind: 'family', family: 'dry' } as const;
  assert.equal(stingOf(scores, { kind: 'defeat', cue: dry })?.name, 'dry-defeat');
  assert.equal(stingOf(scores, { kind: 'victory', cue: dry })?.name, 'dry-victory');
  assert.equal(stingOf(scores, { kind: 'cadence', cue: dry })?.name, 'dry-cadence');
  const [song, cadence] = scores.bosses.wrath.phases;
  const written = { ...scores, families: { ...scores.families, dry: song && cadence ? { song, cadence } : null } };
  assert.equal(stingOf(written, { kind: 'cadence', cue: dry }), cadence);
  assert.equal(stingOf(written, { kind: 'victory', cue: dry }), null);
});

test('with no fight score for the family, a fight on an island is silent and the ambience left whole', () => {
  const { frames, starts, ducks } = directed(() => unwritten);
  frames({ ...island, foes: [brute({ engaged: true })], struck: true }, 3);
  assert.equal(starts.length, 0);
  assert.deepEqual(ducks, []);
});

test('a family score leads into the fight: its tension quietly, its fight on the bar line, the ambience lowered', () => {
  const { frames, starts, ducks, clock } = directed();
  frames(island, 1);
  assert.equal(starts.length, 0, 'roaming is silent');
  frames({ ...island, foes: [brute({})] }, 2);
  assert.ok(starts.length > 0, 'the tension plays');
  assert.deepEqual(ducks, [0.85]);
  const before = starts.length;
  frames({ ...island, foes: [brute({ engaged: true })], struck: true }, 4);
  assert.ok(starts.length > before);
  assert.deepEqual(ducks, [0.85, 0.6]);
  frames(island, 16);
  assert.deepEqual(ducks, [0.85, 0.6, 1], 'resolved, its cadence played: the ambience let back');
  const quiet = starts.length;
  frames(island, 6);
  assert.ok(starts.filter((when) => when > clock() - 3).length === 0 && starts.length === quiet, 'and silence after');
});

test("a piece of the social space's plays a while after arriving there, the ambience a little under it", () => {
  const { frames, starts, ducks } = directed();
  frames(island, 1);
  frames({ ...island, place: { kind: 'social', climate: 'temperate-coast' } }, 2);
  assert.equal(starts.length, 0, 'not at once');
  frames({ ...island, place: { kind: 'social', climate: 'temperate-coast' } }, 30);
  assert.ok(starts.length > 0);
  assert.deepEqual(ducks, [0.8]);
});

test("a boss plays its own score from its wake, lowering the ambience most, and its fall's sting after", () => {
  const { frames, starts, ducks } = directed();
  const thule = brute({ id: 7, name: 'Captain Brannoc Thule', rank: 5, engaged: true });
  frames({ ...island, foes: [thule] }, 3);
  assert.ok(starts.length > 0);
  assert.deepEqual(ducks, [0.4]);
  const before = starts.length;
  frames({ ...island, foes: [{ ...thule, health: 0 }] }, 0.5);
  frames(island, 4);
  assert.ok(starts.length > before, 'the hymn plays as he falls');
});

test('with nowhere to play (no sound woken, or the music silenced) the director plays nothing and fails nothing', () => {
  const director = new MusicDirector({ output: () => null, duck: () => assert.fail('nothing to lower'), timed: false });
  director.frame({ ...island, struck: true }, 0.1);
  director.pump(1);
});

test("a boss's wake holds the song it leads into, though that song played before it (the wreck's waves, then Thule)", () => {
  const lead = { lead: { program: 0, volume: 100, pan: 64, role: 'bed' } } as const;
  const kit = { volume: 100, role: 'combat', keys: {} } as const;
  const beats = makeSong({ name: 'beats', bpm: 120, bars: 2, tracks: lead, kit }, (w) => {
    for (let beat = 0; beat < 8; beat++) w.note('lead', Math.floor(beat / 4), beat % 4, 0.5, 'A4', 90);
  });
  const wake = makeSong({ name: 'wake', bpm: 120, bars: 2, tracks: lead, kit }, () => undefined);
  const made = (): Scores => ({
    ...scores,
    bosses: { ...scores.bosses, boarding: { phases: [beats, beats, beats], wake } },
  });
  const { frames, starts, clock } = directed(made);
  const wreck: Hearing = {
    ...island,
    place: { kind: 'sea' },
    story: { kind: 'fight', score: 'boarding', least: 'tension' },
  };
  frames({ ...wreck, foes: [brute({ engaged: true })] }, 3);
  const woke = clock();
  frames({ ...wreck, foes: [brute({ id: 7, name: 'Captain Brannoc Thule', rank: 5, engaged: true })] }, 7);
  // The wake begins on the next bar line, within 2 s, and lasts two bars (4 s); the song it cut fades over a beat.
  assert.deepEqual(
    starts.filter((when) => when > woke + 2.7 && when < woke + 4),
    [],
    'nothing under the wake',
  );
  assert.ok(
    starts.some((when) => when >= woke + 4),
    'the first phase once the wake has played',
  );
});
