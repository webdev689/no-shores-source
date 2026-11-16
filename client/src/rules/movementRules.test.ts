import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { type Block, type Body, type Controls, type Mode, floatsOf, startMovementRules } from './movementRules.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/movement_wasm.wasm', import.meta.url);

async function movement() {
  const bytes = await readFile(MODULE).catch(() => {
    throw new Error('movement_wasm.wasm is not built: run `npm run wasm` first');
  });
  return startMovementRules(bytes);
}

/** The movement crate's agreement test holds the same fingerprint, course and script (crates/movement/tests/agree.rs). */
const RUN_HASH = '1319303fd957617b';

/** A ledge to catch and climb, a low thin wall to vault, a tower to climb, and a step. */
const COURSE: readonly Block[] = [
  { minX: -5, minY: -4, maxX: 5, maxY: -1, top: 2.3 },
  { minX: -12, minY: 6, maxX: -6, maxY: 6.3, top: 1 },
  { minX: 8, minY: 2, maxX: 9, maxY: 9, top: 4 },
  { minX: -2, minY: 3, maxX: 2, maxY: 5, top: 0.4 },
];

/** Ticks, then forward, sideways, yaw, run, jump and crouch (on the first tick only) and mounted. */
type Phase = readonly [number, number, number, number, boolean, boolean, boolean, boolean];

const SCRIPT: readonly Phase[] = [
  [20, 1, 0, 0.05, false, false, false, false],
  [7, 1, 0, 0.05, false, true, false, false],
  [40, 0, 1, 0.05, false, false, false, false],
  [60, 1, 0, 0.05, false, false, false, false],
  [60, 1, 0.2, 3.1, true, false, false, false],
  [40, 1, 0, -Math.PI / 2, false, false, true, false],
  [60, 1, 0, -Math.PI / 2, true, false, true, false],
  [12, 1, 0, Math.PI, false, false, false, false],
  [40, 1, 0, Math.PI, false, true, false, false],
  [150, 1, 0, Math.PI / 2, true, false, false, false],
  [20, 0, 1, Math.PI / 2, false, false, false, false],
  [200, 1, 0, Math.PI / 2, false, false, false, false],
  [30, 0, -1, Math.PI / 2, false, false, false, false],
  [60, 1, 0, 0.7, true, true, false, true],
];

async function runScript(): Promise<Body[]> {
  const rules = await movement();
  rules.setCourse(COURSE);
  const bodies: Body[] = [];
  let body = rules.standing(0.3, 0.7);
  for (const [ticks, forward, sideways, yaw, run, jump, crouch, mounted] of SCRIPT)
    for (let tick = 0; tick < ticks; tick++) {
      const first = tick === 0;
      const controls: Controls = { forward, sideways, yaw, run, jump: jump && first, crouch: crouch && first, mounted };
      body = rules.step(body, controls);
      bodies.push(body);
    }
  return bodies;
}

/** FNV-1a over each number's little-endian bits, body after body, as the movement crate takes it. */
function fingerprint(bodies: readonly Body[]): string {
  const bytes = new DataView(new ArrayBuffer(8));
  let hash = 0xcbf2_9ce4_8422_2325n;
  for (const value of bodies.flatMap(floatsOf)) {
    bytes.setFloat64(0, value, true);
    for (let index = 0; index < 8; index++)
      hash = ((hash ^ BigInt(bytes.getUint8(index))) * 0x0100_0000_01b3n) & 0xffff_ffff_ffff_ffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

test('the scripted run through WebAssembly moves to the same fingerprint as the server’s', async () => {
  assert.equal(fingerprint(await runScript()), RUN_HASH);
});

test('the script holds the body every way it can be held', async () => {
  const modes = new Set((await runScript()).map((body) => body.mode));
  for (const mode of ['ground', 'air', 'hang', 'climb', 'mantle', 'vault'] satisfies Mode[])
    assert.ok(modes.has(mode), `the script never puts the body in ${mode}`);
});

test('a body stands facing south, its eye at a standing height', async () => {
  const rules = await movement();
  const body = rules.standing(2, -3);
  assert.deepEqual([body.x, body.y, body.z, body.facing, body.mode], [2, -3, 0, Math.PI, 'ground']);
  assert.equal(rules.eyeHeight(body), 1.7);
  assert.equal(rules.tickSeconds, 1 / 60);
});
