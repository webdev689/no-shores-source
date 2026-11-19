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
 *  fire, brace, load (0 none, 2 grape) and ticks. */
const FIGHT_LEGS: readonly (readonly number[])[] = [
  [0, 1, 0, 0, 0, 0, 0, 60],
  [0, 1, 0, 0, 0, 0, 0, 60],
  [1, 0, 0, 0, 0, 0, 0, 60],
  [0, 0, 90, 120, 1, 0, 0, 60],
  [0, 0, -90, 60, 1, 0, 0, 60],
  [0, 0, 0, 0, 0, 0, 2, 60],
  [-1, 0, 0, 0, 0, 1, 0, 60],
  [0, 0, 90, 40, 1, 0, 0, 60],
  [0, -1, 0, 0, 0, 0, 0, 60],
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
  const [steer = 0, climb = 0, bearing = 0, range = 0, fire = 0, brace = 0, load = 0] = leg;
  const shot: ShotName | null = load === 2 ? 'grape' : null;
  return {
    helm: { steer, crab: false, climb: climb > 0 ? 1 : climb < 0 ? -1 : 0 },
    aim: range > 0 ? { bearing, range } : null,
    fire: fire === 1,
    brace: brace === 1,
    load: shot,
  };
}

test('a fight through WebAssembly fights to the same fingerprint as the door natively', async () => {
  const rules = await openSquare();
  let view = rules.fightBegin(new Float64Array([180_000, 360_000, 0, 0, 0, 0, 0, 0]), 7, 1000);
  let time = 1000;
  const prints: string[] = [];
  for (const leg of FIGHT_LEGS) {
    const ticks = leg[7] ?? 0;
    view = rules.fightStep(ordersOf(leg), time, ticks);
    prints.push(view.fingerprint);
    time += ticks / 60;
  }
  assert.equal(view.player.guns.load, 'grape');
  assert.equal(
    prints.join(' '),
    'f7ba7663f1a5a8f5 32cf95fe62a0a453 e4ab140683ed4d79 a3c91988b6f46a93 b6429b7c94d58b60 36f3fdf574d0a3bc ' +
      '59a9408c4c2455d0 23017c1a3a61a784 3ffe4b1dc14aa2f2',
  );
});

// Each hull's fight, as crates/land-wasm/src/fight_tests.rs HULL_FIGHTS pins it: her captain's rank, the hull she
// sails, and the last leg's fingerprint.
const HULL_FIGHTS = [
  [2, 0, '3ffe4b1dc14aa2f2'],
  [3, 1, 'db32dd8e2a3be2f2'],
  [4, 2, '3d910e311ef93da0'],
  [5, 3, 'e1bbe847d399ac62'],
] as const;

test('a fight against each hull through WebAssembly fights to the same fingerprint as the door natively', async () => {
  const rules = await openSquare();
  for (const [rank, hull, print] of HULL_FIGHTS) {
    let view = rules.fightBegin(new Float64Array([180_000, 360_000, 0, 0, 0, 0, 0, 0]), 7, 1000, rank);
    assert.deepEqual([view.captain.rank, view.captain.hull_kind, view.player.hull_kind], [rank, hull, 0]);
    let time = 1000;
    for (const leg of FIGHT_LEGS) {
      const ticks = leg[7] ?? 0;
      view = rules.fightStep(ordersOf(leg), time, ticks);
      time += ticks / 60;
    }
    assert.equal(view.fingerprint, print, `rank ${rank}`);
  }
});

test('the fight door refuses a step with no fight and a look past its reach', async () => {
  const rules = await openSquare();
  rules.fightBegin(new Float64Array([180_000, 360_000, 0, 0, 0, 0, 0, 0]), 7, 1000);
  const far = { ...ordersOf([0, 0, 90, 0]), aim: { bearing: 90, range: 1e9 } };
  assert.throws(() => rules.fightStep(far, 1000, 1), /100 km/);
  rules.fightEnd();
  assert.throws(() => rules.fightStep(ordersOf([]), 1000, 1), /no fight/);
});

test('the fight door refuses a look whose ray is not numbers', async () => {
  const rules = await openSquare();
  rules.fightBegin(new Float64Array([180_000, 360_000, 0, 0, 0, 0, 0, 0]), 7, 1000);
  const looked = (ray: readonly number[]) => ({ ...ordersOf([]), aim: { bearing: 90, range: 80, ray } });
  assert.equal(rules.fightStep(looked([5, 3, 6, 1, 0, -0.1]), 1000, 1).lay?.side, 'starboard');
  assert.throws(() => rules.fightStep(looked([5, 3, 6, 1, 0, Number.NaN]), 1000, 1), /ray/);
});
