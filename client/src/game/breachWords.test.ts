import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { EVENT } from '../combat/cues.ts';
import { type BreachSeen, RIFT, STONE } from '../network/breachMessages.ts';
import { breachPlanOf } from './breachPlan.ts';
import {
  ENCOUNTER,
  NO_COUNTS,
  breachCall,
  encounterOn,
  gateBanner,
  gateLine,
  insideWords,
  runBanner,
  momentWords,
  revivesWords,
  runPlaceWords,
  shutOutWords,
  stoneWords,
  ticksWords,
  unwrittenBy,
} from './breachWords.ts';
import { BREACH_EVENT } from '../network/breachMessages.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const plan = breachPlanOf(
  new WebAssembly.Module(
    await readFile(MODULE).catch(() => {
      throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
    }),
  ),
);

/** A run's word with nothing under way: Normal, the Waking won, the rest waiting, the Lodestone away. */
const RUN: BreachSeen = {
  ...{ gate: false, tier: 0, phases: [2, 0, 0, 0, 0, 0], reached: 1, seals: 0, revives: -1 },
  ...{ stone: STONE.away, bearer: 0, stoneAt: [0, 0, 0], charge: 1, held: 0, lyingTicks: 0 },
  ...{ marked: [], chests: 0, encounter: 0, stage: 0, stageTicks: 0, counts: [], bells: [] },
  ...{ bellFoes: [], broken: 0, ringTicks: 0, fontTicks: 0, boss: 0, warded: false, desk: 0, markedDesk: -1 },
  ...{ deskTicks: 0, writeTicks: 0, seen: false, wipeTicks: 0, rifts: [], riftHeld: [], kept: 0, takings: 0 },
  ...{ takingTicks: 0, awayShore: -1, away: [], wayBack: false, bareTicks: 0, heldBy: false, fill: 0 },
  ...{ woken: false, claims: 0, openTo: [], holders: [], inside: [] },
};
const GATE: BreachSeen = { ...RUN, gate: true, phases: [] };
const names = (player: number) => ['you', 'Ada', 'Ben'][player] ?? 'a companion';

test('ticks read as a clock to the second, rounded up; none is empty', () => {
  assert.deepEqual(
    [ticksWords(0), ticksWords(1), ticksWords(60 * 12), ticksWords(60 * 65)],
    ['', '0:01', '0:12', '1:05'],
  );
});

test("the gate's banner says the Waking, its Spire and moorings, and the companies inside, to the whole zone", () => {
  const idle = gateBanner(plan, GATE, 'The Sunken Gate', ['free', 'free', 'free'], false);
  assert.deepEqual(
    [idle.tone, idle.title, idle.place, idle.objective],
    ['next', 'The Drowned Vale', 'The Sunken Gate', 'No company holds the gate'],
  );
  const waking = { ...GATE, heldBy: true, tier: 1, fill: 0.4, inside: [{ name: 'Ada', tier: 1, encounter: 2 }] };
  const held = gateBanner(plan, waking, 'The Sunken Gate', ['held', 'claimed', 'free'], false);
  assert.equal(held.objective, 'The Waking · Hard · Moorings held 1 of 3 · 1 claimed');
  assert.deepEqual(held.bar, { share: 0.4, label: 'Spire 40%' });
  assert.equal(held.elsewhere, 'Inside: Ada · Hard · The Choir');
  const open = gateBanner(plan, { ...waking, woken: true, openTo: [4] }, '', ['held', 'held', 'held'], true);
  assert.deepEqual(
    [open.tone, open.objective, open.bar],
    ['won', 'The gate is open to your company: enter at the gate', null],
  );
  assert.equal(gateLine(plan, waking), 'The Drowned Vale: the Waking, Spire 40% · Inside: Ada · Hard · The Choir');
  assert.equal(gateLine(plan, GATE), '', 'nothing stirring, nothing said');
});

test('a company past the last encounter reads as cleared inside', () => {
  const done = { ...GATE, inside: [{ name: 'Ben', tier: 0, encounter: plan.encounters.length }] };
  assert.deepEqual(insideWords(plan, done), ['Ben · Normal · Cleared']);
});

test("the run's banner names the encounter under way with its countdown, the Lodestone and the revives left", () => {
  const choir = {
    ...RUN,
    tier: 1,
    revives: 3,
    encounter: ENCOUNTER.choir,
    stage: 1,
    counts: [1],
    bells: [3, 1, 5, 2],
    broken: 1,
    ringTicks: 8 * 60,
    stone: STONE.borne,
    bearer: 1,
    charge: 0.5,
  };
  const banner = runBanner(plan, choir, names);
  assert.deepEqual(
    [banner.tone, banner.kicker, banner.title, banner.clock],
    ['running', 'Breach · Hard', 'The Choir', '0:08'],
  );
  assert.equal(banner.objective, 'Round 2 of 5 · Rings in 0:08 · Font lit');
  assert.deepEqual(banner.bar, { share: 0.25, label: 'Bells broken 1 of 4' });
  const waking = runBanner(plan, { ...choir, bells: [3, 1] }, names).bar;
  assert.deepEqual(waking, { share: 0.25, label: 'Bells broken 1 of 4' }, "the round's bells, woken or not");
  assert.equal(banner.elsewhere, 'Lodestone borne by Ada · charge 50% · 3 revives left');
  const scrivener = { ...choir, stage: 2, warded: true, markedDesk: 2, deskTicks: 4 * 60, writeTicks: 20 * 60 };
  assert.equal(
    runBanner(plan, scrivener, names).objective,
    'The Scrivener is warded: ground the Lodestone beside it · A desk is marked: stand on it within 0:04 · A bell rings in 0:08 · Writes in 0:20',
  );
  const between = runBanner(plan, RUN, names);
  assert.deepEqual([between.tone, between.title, between.objective], ['next', 'The Mending', '']);
  const mending = { ...RUN, encounter: ENCOUNTER.mending, stage: 1, counts: [1, 0, 1] };
  assert.equal(
    runBanner(plan, mending, names).objective,
    'The west and east seams open · Fused 2 of 4: north 1 · west 0 · east 1',
  );
  assert.match(runBanner(plan, { ...mending, tier: 1 }, names).objective, /Fused 2 of 3/, "Hard's fewer");
  assert.match(runBanner(plan, { ...choir, revives: 1 }, names).elsewhere ?? '', /· 1 revive left$/);
});

test('the Ways, the Shores and the Steward each say what their room counts', () => {
  const ways = { ...RUN, tier: 1, encounter: ENCOUNTER.ways, seen: true, wipeTicks: 3 * 60 };
  assert.equal(
    runBanner(plan, ways, names).objective,
    'Seen: the company is unwritten in 0:03 · Reach the Broken Stair',
  );
  assert.equal(runBanner(plan, ways, names).urgent, true);
  const shores = {
    ...RUN,
    encounter: ENCOUNTER.shores,
    stage: 1,
    rifts: [RIFT.opening, RIFT.open],
    riftHeld: [0.5, 1],
    kept: 0b01,
    counts: [2],
    writeTicks: 60 * 21,
  };
  assert.equal(
    runBanner(plan, shores, names).objective,
    'Rift of What Was opening 50% · Rift of What Is open · Keepers fallen 1 of 2 · Tolls in 0:21 · Fused 2 of 4',
  );
  const steward = {
    ...RUN,
    encounter: ENCOUNTER.steward,
    takings: 2,
    takingTicks: 60 * 40,
    awayShore: 1,
    away: [1, 2],
    wayBack: true,
    bells: [1, 2, 3, 4, 5],
    broken: 5,
  };
  assert.equal(
    runBanner(plan, steward, names).objective,
    'Takings 2 of 4 · Takes in 0:40 · Taken to What Is: Ada, Ben · Bells broken 5 of 5 · The way back is open',
  );
  const last = { ...steward, takings: 4, awayShore: -1 };
  assert.equal(runBanner(plan, last, names).objective, 'Takings 4 of 4 · The company is unwritten in 0:40');
});

test("the Steward's banner tells the taken their order to break and the court its mooring to hold", () => {
  const away = { ...RUN, encounter: ENCOUNTER.steward, takings: 1, awayShore: 0, away: [1, 2], bells: [3, 1, 4, 0, 2] };
  const taken = { ...NO_COUNTS, own: 1 };
  assert.equal(
    runBanner(plan, { ...away, broken: 2 }, names, taken).objective,
    'Taken to What Was · Break the bells in the order the court calls · Bells broken 2 of 5',
  );
  const back = { ...away, broken: 5, wayBack: true };
  assert.equal(
    runBanner(plan, back, names, taken).objective,
    'Taken to What Was · The way back is open · Bells broken 5 of 5',
  );
  const court = { ...NO_COUNTS, own: 0, mooring: { at: [0, 0, 0] as const, held: 1, needed: 2 } };
  assert.match(
    runBanner(plan, back, names, court).objective,
    /The way back is open · Mooring of What Was held 1 of 2$/,
  );
  const empty = { ...court, mooring: { ...court.mooring, needed: 0 } };
  assert.doesNotMatch(runBanner(plan, back, names, empty).objective, /mooring/, 'none left in the court to hold it');
});

test("the run's banner counts what the page counts: those on the Stair, the Scrivener's lone bell and its fury", () => {
  const ways = { ...RUN, encounter: ENCOUNTER.ways };
  const stair = { ...NO_COUNTS, stair: { on: 2, living: 5 } };
  assert.equal(runBanner(plan, ways, names, stair).objective, 'Unseen · On the Broken Stair 2 of 5');
  const scrivener = { ...RUN, encounter: ENCOUNTER.choir, stage: 2, ringTicks: 5 * 60 };
  const fury = (ticks: number | null) => runBanner(plan, scrivener, names, { ...NO_COUNTS, fury: ticks }).objective;
  assert.equal(
    fury(null),
    'The Scrivener · A bell rings in 0:05',
    'its fury unknown where its stage was not seen begin',
  );
  assert.equal(fury(60 * 72), 'The Scrivener · A bell rings in 0:05 · Fury in 1:12');
  assert.equal(fury(0), 'The Scrivener · A bell rings in 0:05 · In its fury');
});

test("the player's own countdown leads the banner, its clock urgent, while the call only points to it", () => {
  const marked = {
    ...RUN,
    encounter: ENCOUNTER.choir,
    stage: 1,
    ringTicks: 60 * 8,
    marked: [{ player: 7, ticks: 60 * 9 }],
  };
  const own = runBanner(plan, marked, names, { ...NO_COUNTS, own: 7 });
  assert.deepEqual([own.clock, own.urgent, own.elsewhere], ['0:09', true, 'Rewritten: unwritten in 0:09']);
  const theirs = runBanner(plan, marked, names, { ...NO_COUNTS, own: 8 });
  assert.deepEqual([theirs.clock, theirs.urgent, theirs.elsewhere], ['0:08', false, '']);
  const shore = { ...RUN, encounter: ENCOUNTER.shores, stage: 1, rifts: [RIFT.shut, RIFT.open], writeTicks: 60 * 20 };
  const stranded = runBanner(plan, shore, names, { ...NO_COUNTS, own: 7, stranded: 60 * 6 });
  assert.deepEqual(
    [stranded.clock, stranded.urgent, stranded.elsewhere],
    ['0:06', true, 'Stranded: unwritten in 0:06'],
  );
  const lying = runBanner(plan, { ...RUN, stone: STONE.lying, lyingTicks: 240 }, names);
  assert.deepEqual([lying.clock, lying.urgent], ['0:04', true]);
});

test('the Lodestone lying says the time before the company is unwritten', () => {
  assert.equal(stoneWords({ ...RUN, stone: STONE.plinth }, names), 'Lodestone on its plinth');
  assert.equal(
    stoneWords({ ...RUN, stone: STONE.lying, lyingTicks: 240 }, names),
    'Lodestone lying · unwritten in 0:04',
  );
  assert.equal(stoneWords(RUN, names), '');
});

test("the place line names the run's tier, its encounter and its revives; the call is a few words that stand", () => {
  assert.equal(
    runPlaceWords(plan, { ...RUN, tier: 1, revives: 0 }, 1),
    'Breach · Hard · The Mending · No revives left',
  );
  assert.equal(runPlaceWords(plan, null, 0), 'Breach · Normal');
  assert.equal(encounterOn({ ...RUN, encounter: ENCOUNTER.ways }), ENCOUNTER.ways);
  const marked = { ...RUN, encounter: ENCOUNTER.choir, stage: 1, marked: [{ player: 7, ticks: 60 * 9 }] };
  const call = (seen: BreachSeen, own = 7, stranded = 0) => breachCall(seen, { own, stranded });
  assert.equal(call(marked), 'To the font!');
  assert.equal(call({ ...marked, marked: [{ player: 7, ticks: 60 * 8 }] }), 'To the font!', 'the same as it counts');
  assert.equal(call(marked, 8), null, "another's mark is theirs");
  assert.equal(call({ ...marked, fontTicks: 60 }), 'Take the stone!', 'the font resting, and no one bearing it');
  const borne = { ...marked, fontTicks: 60, stone: STONE.borne, bearer: 2 };
  assert.deepEqual([call(borne), call({ ...borne, bearer: 7 })], ['To the bearer!', 'Hold True!']);
  assert.equal(call({ ...marked, lyingTicks: 120 }, 8), 'Take the stone!');
  assert.equal(call({ ...RUN, encounter: ENCOUNTER.ways, wipeTicks: 120 }), 'Seen!');
  assert.equal(call(RUN, 7, 300), 'Stranded!');
  assert.equal(call({ ...RUN, encounter: ENCOUNTER.choir, stage: 2, markedDesk: 1 }, 8), 'Onto the desk!');
  assert.equal(call(RUN), null);
  // A call stands large and unwrapped: fifteen letters fit a phone's view (390 px wide) with room either side.
  const calls = [
    call(marked),
    call(borne),
    call({ ...borne, bearer: 7 }),
    call(RUN, 7, 300),
    call({ ...marked, lyingTicks: 9 }),
  ];
  for (const each of calls) assert.ok((each?.length ?? 0) <= 15, `${each}`);
  const waits = { ...marked, encounter: ENCOUNTER.steward, marked: [{ player: 7, ticks: 0 }] };
  assert.equal(
    runBanner(plan, waits, names, { ...NO_COUNTS, own: 7 }).elsewhere,
    'Rewritten: unwritten at the next toll',
  );
  const writing = { ...waits, encounter: ENCOUNTER.choir };
  assert.equal(
    runBanner(plan, writing, names, { ...NO_COUNTS, own: 7 }).elsewhere,
    'Rewritten: unwritten at the next writing',
  );
  assert.deepEqual(
    [revivesWords(1), revivesWords(2), revivesWords(0), revivesWords(-1)],
    ['1 revive left', '2 revives left', 'No revives left', ''],
  );
  assert.equal(runPlaceWords(plan, { ...RUN, tier: 1, revives: 1 }, 1), 'Breach · Hard · The Mending · 1 revive left');
});

test("the room's moments are said: the company fallen and why, one seen by a Watcher, but a revive (the game's)", () => {
  const moment = (kind: number, amount = 0, striker = 0, defender = 0) => ({ kind, amount, striker, defender });
  assert.equal(momentWords(moment(BREACH_EVENT.wiped, 2), names), 'Your company fell.');
  const lay = 'the Lodestone lay too long';
  assert.equal(
    momentWords(moment(BREACH_EVENT.wiped, 2), names, lay),
    'Your company fell: the Lodestone lay too long.',
  );
  assert.equal(momentWords(moment(EVENT.revived, 2, 1, 0), names), null, 'told by footRevive.ts');
  assert.equal(momentWords(moment(BREACH_EVENT.unwritten, 3), names, lay), 'The company is unwritten.');
  assert.equal(momentWords(moment(BREACH_EVENT.unwritten, 1), names), null, 'a writing, or one mark come due');
  assert.equal(momentWords(moment(BREACH_EVENT.seen, 1), names), 'A Watcher saw Ada.');
  assert.equal(momentWords(moment(BREACH_EVENT.seen, 0), names), 'A Watcher saw you.');
  assert.equal(momentWords(moment(BREACH_EVENT.bellRang), names), null);
});

test('the company is unwritten whole only as the rules unwrite it, whoever already lay fallen', () => {
  const steward = { ...RUN, encounter: ENCOUNTER.steward, takings: 4, takingTicks: 3 };
  assert.equal(unwrittenBy({ ...RUN, stone: STONE.lying, lyingTicks: 2 }, RUN), 'the Lodestone lay too long');
  assert.equal(unwrittenBy({ ...RUN, encounter: ENCOUNTER.ways, wipeTicks: 2 }, RUN), 'seen by a Watcher');
  const mending = { ...RUN, encounter: ENCOUNTER.mending, tier: 1, counts: [2, 0, 1] };
  assert.equal(unwrittenBy(mending, mending), 'the seams fused 3 times');
  const shores = { ...RUN, encounter: ENCOUNTER.shores, counts: [4] };
  assert.equal(unwrittenBy(shores, shores), 'the Seam fused 4 times');
  assert.equal(unwrittenBy(steward, { ...steward, takingTicks: 1200 }), 'the Steward unwrote you');
  assert.equal(unwrittenBy({ ...steward, takingTicks: 600 }, steward), null, 'a toll writing the Rewritten');
  const choir = { ...RUN, encounter: ENCOUNTER.choir, marked: [{ player: 1, ticks: 1 }] };
  assert.equal(unwrittenBy(choir, choir), null, 'one mark come due');
  assert.equal(unwrittenBy(null, RUN), null);
});

test('the gate shutting a member of its company out says why, as the room tells it', () => {
  assert.equal(shutOutWords(plan, 0, 1), 'The gate shut you out: your company holds eight already.');
  assert.equal(shutOutWords(plan, 1, 2), 'The gate shut you out: Hard opens at level 28.');
  assert.equal(shutOutWords(plan, 1, 3), 'The gate shut you out: Hard opens once the Drowned Vale is won at Normal.');
});
