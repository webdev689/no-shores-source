import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { type BreachSeen, RIFT, STONE } from '../network/breachMessages.ts';
import { breachPlanOf } from './breachPlan.ts';
import {
  ENCOUNTER,
  breachCall,
  encounterOn,
  gateBanner,
  gateLine,
  insideWords,
  runBanner,
  runPlaceWords,
  stoneWords,
  ticksWords,
} from './breachWords.ts';

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
  ...{ marked: [], raising: [], chests: 0, encounter: 0, stage: 0, stageTicks: 0, counts: [], bells: [] },
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
  assert.equal(banner.objective, 'Round 2 · Rings in 0:08 · Font lit');
  assert.deepEqual(banner.bar, { share: 0.25, label: 'Bells broken 1 of 4' });
  assert.equal(banner.elsewhere, 'Lodestone borne by Ada · charge 50% · 3 revives left');
  const scrivener = { ...choir, stage: 2, warded: true, markedDesk: 2, deskTicks: 4 * 60, writeTicks: 20 * 60 };
  assert.equal(
    runBanner(plan, scrivener, names).objective,
    'The Scrivener is warded: ground the Lodestone beside it · Desk 3 marked: blot it from its step · 0:04 · Writes in 0:20',
  );
  const between = runBanner(plan, RUN, names);
  assert.deepEqual([between.tone, between.title, between.objective], ['next', 'The Mending', '']);
});

test('the Ways, the Shores and the Steward each say what their room counts', () => {
  const ways = { ...RUN, tier: 1, encounter: ENCOUNTER.ways, seen: true, wipeTicks: 3 * 60 };
  assert.equal(
    runBanner(plan, ways, names).objective,
    'Seen: the company is unwritten in 0:03 · reach the Broken Stair',
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
    'Rift of what was opening 50% · Rift of what is open · Keepers fallen 1 of 2 · Tolls in 0:21 · Fused 2',
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
    'Takings 2 · Takes in 0:40 · Taken to what is: Ada, Ben · the way back is open · Bells broken 5 of 5',
  );
});

test('the Lodestone lying says the time before the company is unwritten', () => {
  assert.equal(stoneWords({ ...RUN, stone: STONE.plinth }, names), 'Lodestone on its plinth');
  assert.equal(
    stoneWords({ ...RUN, stone: STONE.lying, lyingTicks: 240 }, names),
    'Lodestone lying · unwritten in 0:04',
  );
  assert.equal(stoneWords(RUN, names), '');
});

test("the place line names the run's tier, its encounter and its revives; the call is the player's own mark", () => {
  assert.equal(
    runPlaceWords(plan, { ...RUN, tier: 1, revives: 0 }, 1),
    'Breach · Hard · The Mending · No revives left',
  );
  assert.equal(runPlaceWords(plan, null, 0), 'Breach · Normal');
  assert.equal(encounterOn({ ...RUN, encounter: ENCOUNTER.ways }), ENCOUNTER.ways);
  const marked = { ...RUN, marked: [{ player: 7, ticks: 60 * 9 }] };
  assert.equal(breachCall(marked, 7), 'Rewritten: unwritten in 0:09');
  assert.equal(breachCall(marked, 8), null, "another's mark is theirs");
  assert.equal(breachCall({ ...marked, lyingTicks: 120 }, 8), 'The Lodestone lies: the company is unwritten in 0:02');
});
