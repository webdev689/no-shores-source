import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { type Helm, startLand } from './landRules.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/land_wasm.wasm', import.meta.url);

/** The square continent the land's agreement test opens (crates/land-wasm/src/door_tests.rs SAIL_SQUARE). */
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

/** The voyage the door's own test sails (VOYAGE): each leg's helm and ticks. */
const VOYAGE: readonly (readonly [Helm, number])[] = [
  [{ steer: 0, crab: false, climb: 1 }, 30],
  [{ steer: 0, crab: false, climb: 1 }, 30],
  [{ steer: 1, crab: false, climb: 0 }, 60],
  [{ steer: 1, crab: false, climb: 0 }, 60],
  [{ steer: 1, crab: false, climb: 0 }, 60],
  [{ steer: 0, crab: false, climb: 0 }, 60],
  [{ steer: -1, crab: false, climb: 0 }, 60],
  [{ steer: 0, crab: false, climb: -1 }, 60],
  [{ steer: 1, crab: true, climb: 0 }, 60],
];

async function openSquare() {
  const bytes = await readFile(MODULE).catch(() => {
    throw new Error('land_wasm.wasm is not built: run `npm run wasm` first');
  });
  const rules = await startLand(bytes);
  rules.open(SQUARE, 'square', null);
  return rules;
}

/** FNV-1a over the numbers' bits, as crates/land/src/exact.rs fingerprint. */
function fingerprint(numbers: readonly number[]): string {
  const bytes = new Uint8Array(new Float64Array(numbers).buffer);
  let hash = 0xcbf2_9ce4_8422_2325n;
  for (const byte of bytes) hash = ((hash ^ BigInt(byte)) * 0x0100_0000_01b3n) & 0xffff_ffff_ffff_ffffn;
  return hash.toString(16).padStart(16, '0');
}

test('a voyage through WebAssembly sails to the same fingerprint as the door natively', async () => {
  const rules = await openSquare();
  let ship = new Float64Array([180_000, 360_000, 0, 0, 0, 0, 0, 0]);
  let time = 1000;
  const sailed: number[] = [];
  for (const [helm, ticks] of VOYAGE) {
    const answer = rules.sail(ship, helm, time, ticks);
    ship = answer.ship;
    const { heave, pitch, roll, aground } = answer.pose;
    sailed.push(...ship, heave, pitch, roll, aground ? 1 : 0);
    time += ticks / 60;
  }
  assert.equal(ship[7], 1, 'she ends on her oars');
  assert.equal(fingerprint(sailed), '94b2fdc71ffa3fa3');
});

test('the sail door refuses a ship that is not a ship, and answers aground on land', async () => {
  const rules = await openSquare();
  const still: Helm = { steer: 0, crab: false, climb: 0 };
  assert.throws(() => rules.sail(new Float64Array([Number.NaN, 0, 0, 0, 0, 0, 0, 0]), still, 0, 1), /finite/);
  assert.throws(() => rules.sail(new Float64Array([180_000, 360_000, 0, 0, 0, 0, 0, 0]), still, 0, 61), /ticks/);
  const beached = rules.sail(new Float64Array([260_000, 360_000, 0, 0, 0, 0, 0, 0]), still, 0, 0);
  assert.equal(beached.pose.aground, true);
});

test('a voyage onto the shore and off it sails to the same fingerprint as the door natively', async () => {
  const rules = await openSquare();
  // As crates/land-wasm/src/door_tests.rs shore_voyage: two minutes under sail onto the square's west shore, her
  // sails struck, then her oars astern.
  const legs: Helm[] = [
    ...Array.from({ length: 120 }, (): Helm => ({ steer: 0, crab: false, climb: 0 })),
    ...Array.from({ length: 3 }, (): Helm => ({ steer: 0, crab: false, climb: -1 })),
    ...Array.from({ length: 20 }, (): Helm => ({ steer: 0, crab: false, climb: 0 })),
  ];
  let ship = new Float64Array([199_750, 360_000, Math.PI / 2, 0, 0, 0, 0, 2]);
  let [time, touched] = [0, false];
  const sailed: number[] = [];
  for (const helm of legs) {
    const answer = rules.sail(ship, helm, time, 60);
    ship = answer.ship;
    touched ||= answer.pose.aground;
    const { heave, pitch, roll, aground } = answer.pose;
    sailed.push(...ship, heave, pitch, roll, aground ? 1 : 0);
    time += 1;
  }
  assert.ok(touched, 'she took the ground');
  assert.equal(fingerprint(sailed), '47228ab3b66e850c');
});
