import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type HeardSea,
  type HeardSky,
  type Hearing,
  type Memory,
  QUIET,
  REST_S,
  type SongClock,
  fairForSong,
  hear,
  voyageSongFor,
} from './directorLaw.ts';

const fair: HeardSky = { falling: 0, storm: 0, fog: 0, windMS: 7, night: false };
const quietSea: HeardSea = { fighting: false, captains: 0, strongest: 0, hull: 1, hostilesNear: 0, landfall: false };
const sailing: Hearing = {
  place: { kind: 'sea' },
  dead: false,
  health: 1,
  struck: false,
  kills: 0,
  foes: [],
  sea: quietSea,
  sky: fair,
};
const ashore: Hearing = { ...sailing, place: { kind: 'island', climate: 'swamp', node: 'patrol' }, sea: null };
/** Every song a hundred seconds long; every rest the middle of its range; the sea's songs alone written. */
const songs: SongClock = { lengthOf: () => 100, pieces: () => 0, random: () => 0.5 };
const MIDDLE_REST_S = (REST_S[0] + REST_S[1]) / 2;

/** Already at sea: no arrival's wait. */
const AT_SEA: Memory = { ...QUIET, where: 'sea' };
/** The law run a second a frame for `seconds`: what played each second, its last memory. */
function sail(seconds: number, hearing: (second: number) => Hearing, memory: Memory = AT_SEA) {
  const heard: string[] = [];
  for (let second = 0; second < seconds; second++) {
    const verdict = hear(memory, hearing(second), 1, songs);
    memory = verdict.memory;
    heard.push(verdict.cue.kind === 'sea' ? verdict.cue.song : verdict.cue.kind);
  }
  return { heard, memory };
}
/** How many seconds of each run of the same cue, in order: ['open', 100] and so on. */
const runs = (heard: readonly string[]) =>
  heard.reduce<[string, number][]>((all, cue) => {
    const last = all[all.length - 1];
    if (last && last[0] === cue) last[1]++;
    else all.push([cue, 1]);
    return all;
  }, []);

test('the sea song for the sky: the night after dusk, the still sea in a light wind, the open sea otherwise', () => {
  assert.equal(voyageSongFor(fair), 'open');
  assert.equal(voyageSongFor({ ...fair, windMS: 3 }), 'calm');
  assert.equal(voyageSongFor({ ...fair, windMS: 3, night: true }), 'night');
  assert.equal(voyageSongFor(null), 'open');
  assert.ok(fairForSong(fair) && fairForSong(null));
  for (const foul of [{ falling: 0.3 }, { storm: 0.5 }, { fog: 0.6 }])
    assert.equal(fairForSong({ ...fair, ...foul }), false, JSON.stringify(foul));
});

test('a sea song plays once through, then minutes of silence before another may come', () => {
  const { heard } = sail(1100, () => sailing);
  assert.deepEqual(runs(heard).slice(0, 5), [
    ['swell', 100],
    ['none', MIDDLE_REST_S],
    ['open', 100],
    ['none', MIDDLE_REST_S],
    ['swell', 100],
  ]);
  const still = sail(800, () => ({ ...sailing, sky: { ...fair, windMS: 2 } })).heard;
  assert.deepEqual(
    runs(still)
      .filter(([cue]) => cue !== 'none')
      .map(([cue]) => cue),
    ['glass', 'calm'],
    "each sky's two pieces in turn",
  );
  const night = sail(800, () => ({ ...sailing, sky: { ...fair, night: true } })).heard;
  assert.deepEqual(
    runs(night)
      .filter(([cue]) => cue !== 'none')
      .map(([cue]) => cue),
    ['lantern', 'night'],
  );
  assert.deepEqual(REST_S, [4 * 60, 8 * 60]);
  const lowest = { ...songs, random: () => 0 };
  let memory = AT_SEA;
  const heardLowest: string[] = [];
  for (let second = 0; second < 600; second++) {
    const verdict = hear(memory, sailing, 1, lowest);
    memory = verdict.memory;
    heardLowest.push(verdict.cue.kind === 'sea' ? verdict.cue.song : verdict.cue.kind);
  }
  assert.deepEqual(runs(heardLowest)[1], ['none', REST_S[0]], 'never under four minutes');
});

test("a voyage broken by stops ashore, a death or the story still hears the sky's other piece next", () => {
  const ashoreWithPieces = { ...songs, pieces: () => 4 };
  let memory = AT_SEA;
  const begun: string[] = [];
  const run = (seconds: number, hearing: Hearing) => {
    for (let second = 0; second < seconds; second++) {
      const verdict = hear(memory, hearing, 1, ashoreWithPieces);
      if (verdict.cue.kind === 'sea' && memory.cue.kind !== 'sea') begun.push(verdict.cue.song);
      memory = verdict.memory;
    }
  };
  const silence = { ...sailing, story: { kind: 'silence', cut: false } } as const;
  // The death and the story each follow a voyage that ended on the swell, which the die would pick again.
  for (const between of [{ ...ashore, dead: true }, ashore, silence]) {
    run(400, sailing);
    run(400, ashore);
    run(5, between);
  }
  run(400, sailing);
  assert.deepEqual(begun, ['swell', 'open', 'swell', 'open']);
});

test('never in rain, a storm or fog: a sky turning foul ends the song, and none comes while it stays foul', () => {
  const rain = { ...sailing, sky: { ...fair, falling: 0.4 } };
  const { heard } = sail(700, (second) => (second < 30 ? sailing : rain));
  assert.deepEqual(runs(heard), [
    ['swell', 30],
    ['none', 670],
  ]);
  assert.ok(sail(100, () => ({ ...sailing, sky: { ...fair, fog: 0.8 } })).heard.every((cue) => cue === 'none'));
});

test('danger takes over from a sea song, and after it the sea is quiet a while', () => {
  const closing = { ...sailing, sea: { ...quietSea, hostilesNear: 1, strongest: 2 } };
  const { heard } = sail(400, (second) => (second >= 20 && second < 40 ? closing : sailing));
  const played = runs(heard);
  assert.deepEqual(played[0], ['swell', 20]);
  assert.equal(played[1]?.[0], 'fight');
  assert.equal(played[2]?.[0], 'none');
  assert.ok((played[2]?.[1] ?? 0) >= REST_S[0], 'a rest after the danger');
});

test('landfall plays once as it comes off a coast, whatever the rest or the sky; never on sailing out', () => {
  const rain = { ...sailing, sky: { ...fair, falling: 0.5 } };
  const offCoast = { ...rain, sea: { ...quietSea, landfall: true } };
  const { heard } = sail(400, (second) => (second < 50 ? rain : offCoast));
  assert.deepEqual(runs(heard), [
    ['none', 50],
    ['landfall', 100],
    ['none', 250],
  ]);
  const leaving = sail(60, (second) => (second < 10 ? ashore : { ...offCoast, sky: fair }));
  assert.ok(!leaving.heard.includes('landfall'), 'putting out from the coast is no landfall');
  assert.ok(
    sail(30, () => ashore).heard.every((cue) => cue === 'none'),
    'no sea song ashore',
  );
  const tacking = sail(REST_S[0] + 5, (second) => (second % 20 < 10 ? rain : offCoast));
  assert.equal(runs(tacking.heard).filter(([cue]) => cue === 'landfall').length, 1, 'once along a coast');
});
