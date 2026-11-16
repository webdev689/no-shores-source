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
    'a5c0d39eeb17893c 74506578b683e8a2 aeaf36b6ca60c8cc 9aff61ffcc9e671a 8cb013d3ab3702b7 7b58f4772709c29e ' +
      '5615a0179dc1b60e 53b0562d4c9edb37 567b4bddda81f749',
  );
});

test('the fight door refuses a step with no fight and a look past its reach', async () => {
  const rules = await openSquare();
  rules.fightBegin(new Float64Array([180_000, 360_000, 0, 0, 0, 0, 0, 0]), 7, 1000);
  const far = { ...ordersOf([0, 0, 90, 0]), aim: { bearing: 90, range: 1e9 } };
  assert.throws(() => rules.fightStep(far, 1000, 1), /100 km/);
  rules.fightEnd();
  assert.throws(() => rules.fightStep(ordersOf([]), 1000, 1), /no fight/);
});
