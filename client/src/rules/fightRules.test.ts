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
    view = rules.fightStep(ordersOf(leg), time, ticks, 0);
    prints.push(view.fingerprint);
    time += ticks / 60;
  }
  assert.equal(view.player.guns.load, 'grape');
  assert.equal(
    prints.join(' '),
    'd2fc521c1ce4f11a 4af906e5d52e9ad0 b04eee21ccbcae11 efa31ce7dc377a70 d6dc40b4bc1d764f d328a1c060b924de ' +
      '4e2fc938b416de0e a9a11e2712db64a0 62d84f29f5297440',
  );
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
    { x: 180_300, y: 360_000, heading: 4.7, faction: 2, rank: 1 },
    { x: 179_700, y: 360_000, heading: 1.5, faction: 1, rank: 3 },
  ];
  const view = rules.fightBegin(new Float64Array([180_000, 360_000, 0, 0, 0, 0, 0, 0]), 7, 1000, captains);
  assert.equal(view.captain.ship[0], 180_300);
  assert.deepEqual(
    view.others?.map((other) => [other.ship[0], other.faction, other.rank]),
    [[179_700, 1, 3]],
  );
  rules.fightEnd();
});
