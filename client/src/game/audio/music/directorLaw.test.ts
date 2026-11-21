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
  RESTS,
  type SongClock,
  TENSION_HOLD_S,
  type Verdict,
  bossPart,
  hear,
  seaSongFor,
} from './directorLaw.ts';

const ISLAND: Hearing['place'] = { kind: 'island', climate: 'swamp', node: 'patrol' };
const calm: Hearing = {
  place: ISLAND,
  dead: false,
  health: 1,
  struck: false,
  kills: 0,
  foes: [],
  sea: null,
  sky: null,
};
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
const quietSea: HeardSea = { fighting: false, captains: 0, strongest: 0, hull: 1, hostilesNear: 0, landfall: false };

/** The law run over frames of `seconds` each, from `memory`; the last verdict, with every sting met on the way. */
function run(frames: readonly Hearing[], memory: Memory = QUIET, seconds = 0.1) {
  let verdict: Verdict = { memory, mood: memory.mood, cue: memory.cue, sting: null, cut: false };
  const stings: string[] = [];
  for (const hearing of frames) {
    verdict = hear(verdict.memory, hearing, seconds);
    if (verdict.sting) stings.push(verdict.sting.kind);
  }
  return { ...verdict, stings };
}
const times = (count: number, hearing: Hearing): Hearing[] => Array.from({ length: count }, () => hearing);

test('arriving is silent, and a foe near turning alert brings in the tension of the island family fight score', () => {
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

/** Each piece a hundred seconds long, three to a place, every rest the middle of its range. */
const pieces: SongClock = { lengthOf: () => 100, pieces: () => 3, random: () => 0.5 };
/** What played each second for `seconds`, from `memory`, and the memory after. */
function heard(seconds: number, hearing: (second: number) => Hearing, memory: Memory = QUIET, songs = pieces) {
  const cues: string[] = [];
  for (let second = 0; second < seconds; second++) {
    const verdict = hear(memory, hearing(second), 1, songs);
    memory = verdict.memory;
    cues.push(JSON.stringify(verdict.cue));
  }
  return { cues, memory };
}
const SOCIAL = { ...calm, place: { kind: 'social', climate: 'temperate-coast' } as const };
const none = JSON.stringify({ kind: 'none' });

test("the social space's pieces come a little after arriving, once through, with minutes of silence between", () => {
  const { cues } = heard(700, (second) => (second < 10 ? calm : SOCIAL));
  const playedAt = cues.findIndex((cue, second) => second >= 10 && cue !== none);
  assert.equal(playedAt, 10 + RESTS.social.least, 'its first after the least wait');
  assert.equal(JSON.parse(cues[playedAt] ?? '{}').kind, 'social');
  const quietFor = cues.slice(playedAt + 100).findIndex((cue) => cue !== none);
  const [lowest, highest] = RESTS.social.after;
  assert.equal(quietFor, (lowest + highest) / 2, 'then a rest');
  const pieceOf = (cue: string | undefined) => JSON.parse(cue ?? '{}').piece;
  assert.notEqual(
    pieceOf(cues[playedAt + 100 + quietFor]),
    pieceOf(cues[playedAt]),
    'never the same piece twice running',
  );
});

test("an island plays its family's calm pieces now and then; danger ends one, and the wait begins again", () => {
  const { cues } = heard(200, () => calm, { ...QUIET, where: 'wet', restUntil: RESTS.island.least });
  // The clock reads a second at the first frame.
  const first = RESTS.island.least - 1;
  assert.equal(
    cues.findIndex((cue) => cue !== none),
    first,
  );
  assert.equal(JSON.parse(cues[first] ?? '{}').kind, 'roam');
  assert.equal(JSON.parse(cues[first] ?? '{}').family, 'wet');
  const brute = { ...calm, foes: [foe({ alert: 3 })] };
  const fight = heard(300, (second) => (second >= 130 && second < 140 ? brute : calm), {
    ...QUIET,
    where: 'wet',
    restUntil: RESTS.island.least,
  });
  assert.equal(JSON.parse(fight.cues[135] ?? '{}').kind, 'family', 'danger plays the fight score');
  const after = fight.cues.slice(140).findIndex((cue) => JSON.parse(cue).kind === 'roam');
  assert.ok(after === -1 || after >= RESTS.island.least - TENSION_HOLD_S, 'no calm piece soon after');
});

test('no calm piece in rain, a storm or fog, nor where none is written', () => {
  const rain = { ...SOCIAL, sky: { falling: 0.4, storm: 0, fog: 0, windMS: 5, night: false } };
  assert.ok(heard(300, () => rain).cues.every((cue) => cue === none));
  assert.ok(heard(300, () => SOCIAL, QUIET, { ...pieces, pieces: () => 0 }).cues.every((cue) => cue === none));
});

test('at sea a hostile ship closing brings the tension, a fight the fight, held in one sea song', () => {
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

test("the story's own song plays in the layers of the mood it asks, keeping no fight, and its cut stops everything", () => {
  const engaged = run(times(5, { ...calm, struck: true, foes: [foe({ alert: 2, engaged: true })] }));
  assert.equal(engaged.mood, 'combat');
  const told = run([{ ...calm, story: { kind: 'song', song: 'storm', mood: 'tension' } }], engaged.memory);
  assert.deepEqual([told.cue, told.mood, told.cut], [{ kind: 'story', song: 'storm' }, 'tension', false]);
  assert.equal(told.memory.lastFight, -Infinity, 'the fight before it is not held through it');
  const cut = run([{ ...calm, story: { kind: 'silence', cut: true } }], told.memory);
  assert.deepEqual([cut.cue, cut.mood, cut.cut], [{ kind: 'none' }, 'silent', true]);
  const rung = run([{ ...calm, story: { kind: 'silence', cut: false } }], told.memory);
  assert.equal(rung.cut, false, 'a silence let ring out fades as a fight does');
});

test("the wreck's fights play the Boarding's first part, tense at least, until Thule wakes his own, and his win ends it", () => {
  const wreck: Hearing = {
    ...calm,
    place: { kind: 'sea' },
    story: { kind: 'fight', score: 'boarding', least: 'tension' },
  };
  const waiting = run([wreck]);
  assert.deepEqual([waiting.mood, waiting.cue], ['tension', { kind: 'boss', boss: 'boarding', part: 1 }]);
  const fighting = run(times(3, { ...wreck, struck: true, foes: [foe({ alert: 2, engaged: true })] }));
  assert.deepEqual([fighting.mood, fighting.cue], ['combat', { kind: 'boss', boss: 'boarding', part: 1 }]);
  const thule = foe({ id: 9, name: 'Captain Brannoc Thule', rank: 5, alert: 2, engaged: true });
  const woke = run([{ ...wreck, foes: [thule] }], fighting.memory);
  assert.deepEqual([woke.mood, woke.stings], ['boss', ['wake']]);
  const beaten = run([{ ...wreck, dead: true, foes: [thule] }], woke.memory);
  assert.deepEqual(beaten.stings, ['defeat']);
  assert.deepEqual(beaten.sting, { kind: 'defeat', cue: { kind: 'boss', boss: 'boarding', part: 1 } });
  const atSea = run([
    {
      ...calm,
      place: { kind: 'sea' },
      sea: { ...quietSea, fighting: true, captains: 3 },
      story: { kind: 'fight', score: null, least: 'silent' },
    },
  ]);
  assert.deepEqual(atSea.cue, { kind: 'sea', song: 'storm' }, "the fight at sea is the sea's own");
});
