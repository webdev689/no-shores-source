import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FIGHT_HOLD_S,
  type HeardFoe,
  type HeardSea,
  type Hearing,
  type Memory,
  NEAR_M,
  PEAK_HOLD_S,
  QUIET,
  TENSION_HOLD_S,
  type Verdict,
  bossPart,
  hear,
  seaSongFor,
} from './directorLaw.ts';

const ISLAND: Hearing['place'] = { kind: 'island', climate: 'swamp', node: 'patrol' };
const calm: Hearing = { place: ISLAND, dead: false, health: 1, struck: false, kills: 0, foes: [], sea: null };
const foe = (more: Partial<HeardFoe> = {}): HeardFoe => ({
  id: 1,
  name: 'Brute',
  rank: 1,
  alert: 0,
  distance: 20,
  health: 1,
  engaged: false,
  ...more,
});
const quietSea: HeardSea = { fighting: false, captains: 0, strongest: 0, hull: 1, hostilesNear: 0 };

/** The law run over frames of `seconds` each, from `memory`; the last verdict, with every sting met on the way. */
function run(frames: readonly Hearing[], memory: Memory = QUIET, seconds = 0.1) {
  let verdict: Verdict = { memory, mood: memory.mood, cue: memory.cue, sting: null };
  const stings: string[] = [];
  for (const hearing of frames) {
    verdict = hear(verdict.memory, hearing, seconds);
    if (verdict.sting) stings.push(verdict.sting.kind);
  }
  return { ...verdict, stings };
}
const times = (count: number, hearing: Hearing): Hearing[] => Array.from({ length: count }, () => hearing);

test('roaming is silent, and a foe near turning alert brings in the tension of the island family fight score', () => {
  assert.equal(run([calm]).mood, 'silent');
  assert.deepEqual(run([calm]).cue, { kind: 'none' });
  assert.equal(run([{ ...calm, foes: [foe({ alert: 1 })] }]).mood, 'silent', 'a stir is not yet danger');
  assert.equal(run([{ ...calm, foes: [foe({ alert: 2, distance: NEAR_M + 1 })] }]).mood, 'silent', 'too far');
  const near = run([{ ...calm, foes: [foe({ alert: 3 })] }]);
  assert.equal(near.mood, 'tension');
  assert.deepEqual(near.cue, { kind: 'family', family: 'wet' });
});

test('the player fighting brings the fight: a blow given or taken, or a foe engaging them', () => {
  assert.equal(run([{ ...calm, struck: true }]).mood, 'combat');
  assert.equal(run([{ ...calm, foes: [foe({ alert: 2, engaged: true })] }]).mood, 'combat');
});

test('several foes, an Elite or a Miniboss, or the player low on health bring the peak', () => {
  const engaged = (rank: number, id = 1) => foe({ id, rank, alert: 2, engaged: true });
  assert.equal(run([{ ...calm, foes: [engaged(1, 1), engaged(1, 2)] }]).mood, 'combat');
  assert.equal(run([{ ...calm, foes: [engaged(1, 1), engaged(1, 2), engaged(2, 3)] }]).mood, 'peak');
  assert.equal(run([{ ...calm, foes: [engaged(3)] }]).mood, 'peak', 'an Elite');
  assert.equal(run([{ ...calm, foes: [engaged(4)] }]).mood, 'peak', 'a Miniboss');
  assert.equal(run([{ ...calm, struck: true, health: 0.3 }]).mood, 'peak');
  assert.equal(run([{ ...calm, health: 0.3 }]).mood, 'silent', 'low health alone, with no fight, is no peak');
});

test('each mood outlives its cause: the peak falls to the fight, the fight to the tension, the tension to silence', () => {
  const peak = run([{ ...calm, foes: [foe({ rank: 3, alert: 2, engaged: true })] }]);
  const alert = { ...calm, foes: [foe({ alert: 2 })] };
  const after = (seconds: number, hearing: Hearing) => run(times(Math.round(seconds / 0.1), hearing), peak.memory);
  assert.equal(after(FIGHT_HOLD_S - 0.5, alert).mood, 'peak', 'the fight and its peak hold');
  assert.equal(after(FIGHT_HOLD_S + 0.5, alert).mood, 'tension', 'no foe engaged: the fight resolves');
  assert.equal(after(FIGHT_HOLD_S + 0.5, calm).mood, 'silent', 'no danger left: the fight resolves to silence');
  assert.equal(after(FIGHT_HOLD_S + TENSION_HOLD_S + 0.5, alert).mood, 'tension', 'while a foe stays alert');
  const stirred = run([{ ...calm, foes: [foe({ alert: 2 })] }]);
  assert.equal(run(times(Math.round((TENSION_HOLD_S - 0.5) / 0.1), calm), stirred.memory).mood, 'tension');
  assert.equal(run(times(Math.round((TENSION_HOLD_S + 0.5) / 0.1), calm), stirred.memory).mood, 'silent');
  const struck = { ...calm, struck: true };
  const fought = run(times(Math.round(PEAK_HOLD_S / 0.1) + 5, struck), peak.memory);
  assert.equal(fought.mood, 'combat', 'the peak gone, the fight goes on');
});

test('a fight won sounds its victory as it resolves; one that only parted, its cadence', () => {
  const engaged = { ...calm, foes: [foe({ alert: 2, engaged: true })] };
  const won = run([engaged, { ...engaged, kills: 1 }, ...times(Math.round((FIGHT_HOLD_S + 1) / 0.1), calm)]);
  assert.deepEqual(won.stings, ['victory']);
  const parted = run([engaged, ...times(Math.round((FIGHT_HOLD_S + 1) / 0.1), calm)]);
  assert.deepEqual(parted.stings, ['cadence']);
});

test('death is a moment: the defeat sting in the score that played, then silence until the player stands again', () => {
  const fighting = run([{ ...calm, struck: true }]);
  const dead = hear(fighting.memory, { ...calm, dead: true }, 0.1);
  assert.deepEqual(dead.sting, { kind: 'defeat', cue: { kind: 'family', family: 'wet' } });
  assert.equal(dead.mood, 'silent');
  assert.equal(hear(dead.memory, { ...calm, dead: true }, 0.1).sting, null, 'once');
});

test('a Boss engaged plays its own score, its phase by its health, the last stand in its last tenth', () => {
  assert.deepEqual([1, 0.7, 0.66, 0.4, 0.3, 0.1, 0.05].map(bossPart), [1, 1, 2, 2, 3, 'last', 'last']);
  const thule = (health: number, more: Partial<HeardFoe> = {}) =>
    foe({ id: 9, name: 'Captain Brannoc Thule', rank: 5, alert: 2, engaged: true, health, ...more });
  const woke = run([{ ...calm, foes: [thule(1)] }]);
  assert.equal(woke.mood, 'boss');
  assert.deepEqual(woke.cue, { kind: 'boss', boss: 'boarding', part: 1 });
  assert.deepEqual(woke.stings, ['wake']);
  const later = run(
    [
      { ...calm, foes: [thule(0.5)] },
      { ...calm, foes: [thule(0.2)] },
    ],
    woke.memory,
  );
  assert.deepEqual(later.cue, { kind: 'boss', boss: 'boarding', part: 3 });
  assert.deepEqual(later.stings, [], 'one wake a boss');
  const corvane = run([
    { ...calm, foes: [foe({ name: 'High Assessor Corvane', rank: 5, engaged: true, health: 0.05 })] },
  ]);
  assert.deepEqual(corvane.cue, { kind: 'boss', boss: 'reckoning', part: 'last' });
  const stranger = run([{ ...calm, foes: [foe({ name: 'A Boss to Come', rank: 5, engaged: true })] }]);
  assert.deepEqual(stranger.cue, { kind: 'boss', boss: 'wrath', part: 1 });
});

test("a boss's fall is its sting; a boss that lets the player go resolves like any fight", () => {
  const thule = foe({ id: 9, name: 'Captain Brannoc Thule', rank: 5, alert: 2, engaged: true, health: 0.2 });
  const fighting = run([{ ...calm, foes: [thule] }]);
  const fell = run([{ ...calm, foes: [{ ...thule, health: 0 }] }], fighting.memory);
  assert.deepEqual(fell.stings, ['fallen']);
  assert.notEqual(fell.mood, 'boss');
  const gone = run([{ ...calm, foes: [] }], fighting.memory);
  assert.deepEqual(gone.stings, ['fallen'], 'dissolved where it fell');
  const felled = run(
    [{ ...calm, struck: true, kills: 1, foes: [{ ...thule, health: 0 }] }, calm, calm],
    fighting.memory,
  );
  assert.equal(felled.mood, 'silent', 'the blow that felled him is no fight to hold');
  const guard = foe({ id: 3, alert: 2, engaged: true });
  assert.equal(
    run([{ ...calm, foes: [{ ...thule, health: 0 }, guard] }], fighting.memory).mood,
    'combat',
    'his crew fights on',
  );
  const leashed = run(
    times(Math.round((FIGHT_HOLD_S + 1) / 0.1), { ...calm, foes: [{ ...thule, alert: 0, engaged: false }] }),
    fighting.memory,
  );
  assert.deepEqual(leashed.stings, []);
  assert.notEqual(leashed.mood, 'boss');
});

test("the social space plays Saltmere's theme while nothing threatens", () => {
  const social = { ...calm, place: { kind: 'social', climate: 'temperate-coast' } as const };
  assert.deepEqual(run([social]).cue, { kind: 'social' });
  assert.equal(run([social]).mood, 'silent');
});

test('sailing is ambience alone; a hostile ship closing brings the tension, a fight the fight, held in one sea song', () => {
  const sailing: Hearing = { ...calm, place: { kind: 'sea' }, sea: quietSea };
  assert.equal(run([sailing]).mood, 'silent');
  const closing = run([{ ...sailing, sea: { ...quietSea, hostilesNear: 1, strongest: 2 } }]);
  assert.equal(closing.mood, 'tension');
  assert.deepEqual(closing.cue, { kind: 'sea', song: 'fight' });
  const fighting = run(
    [{ ...sailing, sea: { ...quietSea, fighting: true, captains: 1, strongest: 2 } }],
    closing.memory,
  );
  assert.equal(fighting.mood, 'combat');
  const second = { ...quietSea, fighting: true, captains: 2, strongest: 2, hostilesNear: 2 };
  const grown = run([{ ...sailing, sea: second }], fighting.memory);
  assert.equal(grown.mood, 'peak');
  assert.deepEqual(grown.cue, { kind: 'sea', song: 'fight' }, 'the encounter keeps its song');
  assert.equal(run([{ ...sailing, sea: { ...quietSea, fighting: true, captains: 1, hull: 0.2 } }]).mood, 'peak');
});

test("the sea's law: its storm for two hostile ships or an Elite, else its fight", () => {
  assert.equal(seaSongFor({ ...quietSea, hostilesNear: 1, strongest: 2 }), 'fight');
  assert.equal(seaSongFor({ ...quietSea, hostilesNear: 2, strongest: 1 }), 'storm');
  assert.equal(seaSongFor({ ...quietSea, hostilesNear: 1, strongest: 3 }), 'storm');
  assert.equal(seaSongFor({ ...quietSea, fighting: true, captains: 2 }), 'storm');
});
