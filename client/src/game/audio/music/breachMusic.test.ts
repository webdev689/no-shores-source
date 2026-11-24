import assert from 'node:assert/strict';
import { test } from 'node:test';
import { askedSting, overlookScores, songOf, stingOf } from './director.ts';
import {
  type HeardBreach,
  type HeardFoe,
  type Hearing,
  type Memory,
  QUIET,
  type Verdict,
  hear,
} from './directorLaw.ts';
import { BREACH_EVENT } from '../../../network/breachMessages.ts';
import { hearBreach, momentOf } from './breachHearing.ts';

/** A Breach's run as the page hears it: the Gullwing Vale's climate, no sky underground. */
const RUN: Hearing = {
  place: { kind: 'island', climate: 'temperate-coast', node: 'node-gullwing-vale--breach' },
  dead: false,
  health: 1,
  struck: false,
  kills: 0,
  foes: [],
  sea: null,
  sky: null,
};
const inRun = (breach: Partial<HeardBreach>, more: Partial<Hearing> = {}): Hearing => ({
  ...RUN,
  breach: { run: true, song: null, boss: null, piece: 2, ...breach },
  ...more,
});
const foe = (more: Partial<HeardFoe>): HeardFoe => ({
  id: 1,
  name: 'Husk',
  rank: 1,
  alert: 2,
  distance: 10,
  health: 1,
  engaged: false,
  ...more,
});
/** The pieces a run has: the Descent's, the Stair's and After the Bells. */
const SONGS = { lengthOf: () => 100, pieces: (where: string) => (where === 'breach' ? 3 : 2), random: () => 0.5 };

function run(frames: readonly Hearing[], memory: Memory = QUIET, seconds = 0.1) {
  let verdict: Verdict = { memory, mood: memory.mood, cue: memory.cue, sting: null, cut: false };
  const stings: string[] = [];
  for (const hearing of frames) {
    verdict = hear(verdict.memory, hearing, seconds, SONGS);
    if (verdict.sting) stings.push(verdict.sting.kind);
  }
  return { ...verdict, stings };
}
const times = (count: number, hearing: Hearing) => Array.from({ length: count }, () => hearing);

/** What the room shows of a Breach: none of it running. */
const SEEN = { gate: false, encounter: 0, boss: 0, seen: false, heldBy: false, woken: false };
const PLAN = {
  encounters: [
    { space: null },
    { space: 'mending' },
    { space: 'choir' },
    { space: 'ways' },
    { space: 'hall' },
    { space: 'court' },
  ],
};

test("the run hears its encounter's song: the one under way, else the one fought where the player stands", () => {
  assert.deepEqual(hearBreach({ ...SEEN, encounter: 1 }, PLAN, 'descent', true), {
    run: true,
    song: 'mending',
    boss: null,
    piece: 0,
  });
  assert.equal(hearBreach(SEEN, PLAN, 'hall', true)?.song, 'shores', 'the hall, before its encounter');
  assert.equal(hearBreach(SEEN, PLAN, 'stair', true)?.piece, 1, "the Broken Stair's piece on its slabs");
  assert.equal(hearBreach(SEEN, PLAN, null, true)?.song, 'waking', 'between spaces');
  assert.equal(hearBreach({ ...SEEN, encounter: 2 }, PLAN, 'choir', true)?.boss, null, 'the bells before it');
  assert.equal(hearBreach({ ...SEEN, encounter: 2, boss: 40 }, PLAN, 'choir', true)?.boss, 'scrivener');
  assert.equal(hearBreach({ ...SEEN, encounter: 5 }, PLAN, 'court', true)?.boss, 'steward');
  assert.equal(hearBreach({ ...SEEN, encounter: 3 }, PLAN, 'ways', true)?.least, undefined);
  assert.equal(hearBreach({ ...SEEN, encounter: 3, seen: true }, PLAN, 'ways', true)?.least, 'peak', 'seen');
});

test('at the Sunken Gate the Waking is heard only by the company holding it, until the Spire wakes', () => {
  const gate = { ...SEEN, gate: true, heldBy: true };
  assert.deepEqual(hearBreach(gate, PLAN, null, true), { run: false, song: 'waking', boss: null, piece: 2 });
  assert.equal(hearBreach(gate, PLAN, null, false).song, null, 'another company holds it');
  assert.equal(hearBreach({ ...gate, woken: true }, PLAN, null, true).song, null, 'the Spire woken');
  assert.equal(hearBreach({ ...gate, heldBy: false }, PLAN, null, true).song, null, 'no one holds it');
});

test("an encounter's foes bring its own song's layers, not the island family's, and the run's moments are its own", () => {
  const fighting = run(times(5, inRun({ song: 'choir' }, { foes: [foe({ engaged: true })] })));
  assert.equal(fighting.mood, 'combat');
  assert.deepEqual(fighting.cue, { kind: 'breach', song: 'choir' });
  const held = run(times(5, inRun({ song: 'choir' }, { least: 'tension' })));
  assert.deepEqual([held.mood, held.cue.kind], ['tension', 'breach'], 'an encounter running holds the tension');
  const over = run([
    ...times(5, inRun({ song: 'mending' }, { foes: [foe({ engaged: true })] })),
    ...times(80, inRun({ song: 'mending' })),
  ]);
  assert.deepEqual(over.stings, ['cadence']);
  const scores = overlookScores();
  assert.equal(
    stingOf(scores, { kind: 'cadence', cue: { kind: 'breach', song: 'mending' } })?.name,
    'vale-mending-cadence',
  );
  assert.equal(songOf(scores, { kind: 'breach', song: 'ways' })?.name, 'vale-ways');
  const gate = { ...RUN, place: { kind: 'island', climate: 'temperate-coast', node: 'node-gullwing-vale' } } as const;
  const waking = run(
    times(5, { ...gate, breach: { run: false, song: 'waking', boss: null, piece: 2 }, least: 'tension' }),
  );
  assert.deepEqual(waking.cue, { kind: 'breach', song: 'waking' }, 'the Waking at the gate');
});

test('the Scrivener and the Steward play their own scores, the Steward even before it is engaged', () => {
  const scrivener = run(
    times(
      5,
      inRun({ song: 'choir', boss: 'scrivener' }, { foes: [foe({ name: 'The Scrivener', rank: 5, engaged: true })] }),
    ),
  );
  assert.deepEqual(scrivener.cue, { kind: 'boss', boss: 'scrivener', part: 1 });
  assert.deepEqual(scrivener.stings, ['wake']);
  const court = run(times(5, inRun({ song: 'shores', boss: 'steward' }, { least: 'peak' })));
  assert.deepEqual(court.cue, { kind: 'boss', boss: 'steward', part: 1 });
  const steward = foe({ id: 9, name: 'The Steward', rank: 5, health: 0.5, alert: 2 });
  const later = run(times(5, inRun({ song: 'shores', boss: 'steward' }, { least: 'peak', foes: [steward] })));
  assert.deepEqual(later.cue, { kind: 'boss', boss: 'steward', part: 2 }, 'its phase by its health, unengaged');
  const scores = overlookScores();
  assert.equal(songOf(scores, { kind: 'boss', boss: 'steward', part: 'last' })?.name, 'vale-steward-last');
  assert.equal(stingOf(scores, { kind: 'fallen', boss: 'steward' })?.name, 'vale-steward-cleared');
  assert.equal(stingOf(scores, { kind: 'wake', boss: 'scrivener' })?.name, 'vale-scrivener-wake');
});

test("the Ways' peak is its seen moment", () => {
  assert.equal(run(times(5, inRun({ song: 'ways' }, { least: 'tension' }))).mood, 'tension');
  assert.equal(run(times(5, inRun({ song: 'ways', least: 'peak' }, { least: 'tension' }))).mood, 'peak');
});

test("between encounters the run's own calm piece comes, its space's, after a rest shorter than an island's", () => {
  const descent = inRun({ song: 'waking', piece: 0 });
  assert.equal(run(times(150, descent)).cue.kind, 'none', 'not at once on arriving');
  const later = run(times(250, descent));
  assert.deepEqual(later.cue, { kind: 'vale', piece: 0 }, 'the Descent plays its own within half a minute');
  const island = run(times(250, RUN));
  assert.equal(island.cue.kind, 'none', "an island's first piece waits two minutes");
  assert.equal(songOf(overlookScores(), { kind: 'vale', piece: 1 })?.name, 'vale-stair');
});

const told = (kind: number, amount: number) => ({ kind, amount });

test("a Breach's moment plays the sting of the encounter it is of, not of where the player stands", () => {
  assert.equal(momentOf([told(BREACH_EVENT.won, 3)]), 3);
  assert.equal(momentOf([told(BREACH_EVENT.won, 5), told(BREACH_EVENT.cleared, 0)]), 'cleared');
  assert.equal(momentOf([told(BREACH_EVENT.rewritten, 2)]), null, 'no encounter in it');
  const gate = { ...RUN, place: { kind: 'island', climate: 'temperate-coast', node: 'node-gullwing-vale' } } as const;
  // The Spire woken, or the holders gone, on the very frame the room tells the Waking won or wiped.
  const won = hearBreach({ ...SEEN, gate: true, heldBy: true, woken: true }, PLAN, null, true, [
    told(BREACH_EVENT.won, 0),
  ]);
  assert.deepEqual(askedSting('victory', { ...gate, breach: won }), {
    kind: 'victory',
    cue: { kind: 'breach', song: 'waking' },
  });
  const wiped = hearBreach({ ...SEEN, gate: true }, PLAN, null, true, [told(BREACH_EVENT.wiped, 0)]);
  assert.deepEqual(askedSting('defeat', { ...gate, breach: wiped }), {
    kind: 'defeat',
    cue: { kind: 'breach', song: 'waking' },
  });
  // The Ways won with every living player on the Stair.
  const ways = hearBreach(SEEN, PLAN, 'stair', true, [told(BREACH_EVENT.won, 3)]);
  assert.deepEqual(askedSting('victory', inRun({}, { breach: ways })), {
    kind: 'victory',
    cue: { kind: 'breach', song: 'ways' },
  });
  const cleared = hearBreach(SEEN, PLAN, 'court', true, [told(BREACH_EVENT.won, 5), told(BREACH_EVENT.cleared, 0)]);
  assert.deepEqual(askedSting('victory', inRun({}, { breach: cleared })), { kind: 'fallen', boss: 'steward' });
  assert.equal(stingOf(overlookScores(), { kind: 'fallen', boss: 'steward' })?.name, 'vale-steward-cleared');
  // A public event's moment in the hollow, while the company holds the Waking, is the island's.
  const holding = hearBreach({ ...SEEN, gate: true, heldBy: true }, PLAN, null, true);
  assert.deepEqual(askedSting('victory', { ...gate, breach: holding }), {
    kind: 'victory',
    cue: { kind: 'family', family: 'green' },
  });
});

test('lingering in one space, the next calm piece is another than the one begun last', () => {
  const descent = inRun({ song: 'waking', piece: 0 });
  const first = run(times(250, descent));
  assert.deepEqual(first.cue, { kind: 'vale', piece: 0 });
  const next = run(times(1900, descent), first.memory);
  assert.equal(next.cue.kind, 'vale', 'a second piece after its rest');
  assert.notDeepEqual(next.cue, { kind: 'vale', piece: 0 }, 'not the Descent again');
});
