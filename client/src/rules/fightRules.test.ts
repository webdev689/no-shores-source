import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { FightOrders, ShotName } from './fightRules.ts';
import { startLand } from './landRules.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/land_wasm.wasm', import.meta.url);

/** The square continent the door's fight test opens (crates/land-wasm/src/fight_tests.rs SQUARE). */
const SQUARE = JSON.stringify({
  continents: [
    {
      id: 'square',
      outline: [
        [200_000, 300_000],
        [320_000, 300_000],
        [320_000, 420_000],
        [200_000, 420_000],
      ],
    },
  ],
  isles: [],
});

/** The fight the door's own test fights (FIGHT_LEGS): each leg's steer, climb, look's bearing and range (0 none),
 *  fire, brace, load (0 none, 2 grape), burst and ticks. */
const FIGHT_LEGS: readonly (readonly number[])[] = [
  [0, 1, 0, 0, 0, 0, 0, 0, 60],
  [0, 1, 0, 0, 0, 0, 0, 0, 60],
  [1, 0, 0, 0, 0, 0, 0, 1, 60],
  [0, 0, 90, 120, 1, 0, 0, 0, 60],
  [0, 0, -90, 60, 1, 0, 0, 0, 60],
  [0, 0, 0, 0, 0, 0, 2, 0, 60],
  [-1, 0, 0, 0, 0, 1, 0, 0, 60],
  [0, 0, 90, 40, 1, 0, 0, 0, 60],
  [0, -1, 0, 0, 0, 0, 0, 0, 60],
];

async function openSquare() {
  const bytes = await readFile(MODULE).catch(() => {
    throw new Error('land_wasm.wasm is not built: run `npm run wasm` first');
  });
  const rules = await startLand(bytes);
  rules.open(SQUARE, 'square', null);
  return rules;
}

function ordersOf(leg: readonly number[]): FightOrders {
  const [steer = 0, climb = 0, bearing = 0, range = 0, fire = 0, brace = 0, load = 0, boost = 0] = leg;
  const shot: ShotName | null = load === 2 ? 'grape' : null;
  return {
    helm: { steer, climb: climb > 0 ? 1 : climb < 0 ? -1 : 0 },
    aim: range > 0 ? { bearing, range } : null,
    fire: fire === 1,
    brace: brace === 1,
    load: shot,
    boost: boost === 1,
  };
}

test('a fight through WebAssembly fights to the same fingerprint as the door natively', async () => {
  const rules = await openSquare();
  let view = rules.fightBegin(new Float64Array([180_000, 360_000, 0, 0, 0, 0, 0, 0]), 7, 1000);
  let time = 1000;
  const [prints, bursts]: [string[], number[]] = [[], []];
  for (const leg of FIGHT_LEGS) {
    const ticks = leg[8] ?? 0;
    view = rules.fightStep(ordersOf(leg), time, ticks, 0);
    prints.push(view.fingerprint);
    bursts.push(view.player.boost[0]);
    time += ticks / 60;
  }
  assert.equal(view.player.guns.load, 'grape');
  assert.ok(Math.abs((bursts[2] ?? 0) - 0.75) < 0.01 && bursts[6] === 0, `the third leg's burst: ${bursts.join(' ')}`);
  assert.equal(
    prints.join(' '),
    'b14f9598cbf5b61b e397e5f02e7a84cc 2ad50820d6be449b aba545ec422d28f1 88a4d1fcc37df241 d804cb133e9748c9 ' +
      '02caed3cd7fd035f a5ab81f02b0b956c f10178758430a2b5',
  );
});

// Each hull's fight, as crates/land-wasm/src/fight_tests.rs HULL_FIGHTS pins it: its captain's rank, the hull they
// sail, and the last leg's fingerprint.
const HULL_FIGHTS = [
  [2, 0, '896c9ea4b9acae3c'],
  [3, 1, '8228aad2d3c4ddea'],
  [4, 2, 'f56ba4f8a141b009'],
  [5, 3, '239869e9d951c4cf'],
] as const;

test('a fight against each hull through WebAssembly fights to the same fingerprint as the door natively', async () => {
  const rules = await openSquare();
  for (const [rank, hull, print] of HULL_FIGHTS) {
    let view = rules.fightBegin(new Float64Array([180_000, 360_000, 0, 0, 0, 0, 0, 0]), 7, 1000, { rank });
    assert.deepEqual([view.captain.rank, view.captain.hull_kind, view.player.hull_kind], [rank, hull, 0]);
    let time = 1000;
    for (const leg of FIGHT_LEGS) {
      const ticks = leg[8] ?? 0;
      view = rules.fightStep(ordersOf(leg), time, ticks, 0);
      time += ticks / 60;
    }
    assert.equal(view.fingerprint, print, `rank ${rank}`);
  }
});

test('the fight door refuses a step with no fight and a look past its reach', async () => {
  const rules = await openSquare();
  rules.fightBegin(new Float64Array([180_000, 360_000, 0, 0, 0, 0, 0, 0]), 7, 1000);
  const far = { ...ordersOf([0, 0, 90, 0]), aim: { bearing: 90, range: 1e9 } };
  assert.throws(() => rules.fightStep(far, 1000, 1, 0), /100 km/);
  rules.fightEnd();
  assert.throws(() => rules.fightStep(ordersOf([]), 1000, 1, 0), /no fight/);
});

test('the fight door refuses a look whose ray is not numbers', async () => {
  const rules = await openSquare();
  rules.fightBegin(new Float64Array([180_000, 360_000, 0, 0, 0, 0, 0, 0]), 7, 1000);
  const looked = (ray: readonly number[]) => ({ ...ordersOf([]), aim: { bearing: 90, range: 80, ray } });
  assert.equal(rules.fightStep(looked([5, 3, 6, 1, 0, -0.1]), 1000, 1, 0).lay?.side, 'starboard');
  assert.throws(() => rules.fightStep(looked([5, 3, 6, 1, 0, Number.NaN]), 1000, 1, 0), /ray/);
});

test('a fight begun through WebAssembly with captains sets each where given and shows the rest in others', async () => {
  const rules = await openSquare();
  const captains = [
    { x: 180_300, y: 360_000, heading: 4.7, faction: 1, rank: 1 },
    { x: 179_700, y: 360_000, heading: 1.5, faction: 1, rank: 3 },
  ];
  const view = rules.fightBegin(new Float64Array([180_000, 360_000, 0, 0, 0, 0, 0, 0]), 7, 1000, { captains });
  assert.equal(view.captain.ship[0], 180_300);
  assert.deepEqual(
    view.others?.map((other) => [other.ship[0], other.faction, other.rank]),
    [[179_700, 1, 3]],
  );
  rules.fightEnd();
});
