import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { LocalRoom } from '../network/localRoom.ts';
import type { Snapshot } from '../network/roomConnection.ts';
import { startCombatRules } from '../rules/combatRules.ts';
import type { Body, MovementRules } from '../rules/movementRules.ts';
import { Fighting } from './fighting.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const compiled = new WebAssembly.Module(
  await readFile(MODULE).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  }),
);
const TICK = 1 / 60;
const movement = { tickSeconds: TICK } as unknown as MovementRules;

/** Land at 0 m with a platform 20 m up over its north (y below 10), as a city's terrace stands over the land. */
function ground(): string {
  const grid = (value: number) => ({
    width: 4,
    height: 4,
    left_m: -2000,
    top_m: -2000,
    cell_m: 1000,
    first_column: 0,
    first_row: 0,
    data: Array<number>(16).fill(value),
  });
  return JSON.stringify({
    land: grid(0),
    lake_level: Array<number>(16).fill(-5000),
    rivers: [],
    roads: [],
    towns: [],
    coast: grid(5000),
    across: grid(-50),
    pads: [{ bounds: [-50, -50, 50, 10], level: 20 }],
    seed: 7,
  });
}

/** A social space's node file on that ground: a 100 m square round the platform's middle, its spawn there. */
function socialNode(window: string): string {
  const ring = [
    [-50, -50],
    [50, -50],
    [50, 50],
    [-50, 50],
  ];
  const head = { id: 'test-social', kind: 'social', ring, spawns: [[0, 0]], bounds: [-60, -60, 60, 60], boxes: [] };
  return `${JSON.stringify(head).slice(0, -1)},"ground":${window}}`;
}

test('a body run off a ledge in a social space dies 6 m down, and the page predicts its fall to the ground as the room steps it', () => {
  const window = ground();
  let fight: Fighting | null = null;
  const room = LocalRoom.openNode(compiled, socialNode(window), (snapshot: Snapshot) => fight?.receive(snapshot));
  const rules = startCombatRules(compiled);
  assert.equal(rules.setGround(window), true);
  const fighting = new Fighting(rules, room);
  fight = fighting;
  room.pump(TICK);
  const steps = fighting.steps(movement);
  const run = { forward: 1, sideways: 0, yaw: Math.PI, run: true, jump: false, crouch: false, mounted: false };
  let body = {} as Body;
  let diedAt: number | null = null;
  let lying = 0;
  for (let tick = 0; tick < 900 && lying < 60; tick += 1) {
    fighting.press({ swing: false, shoot: false, guard: false, dodge: false, pitch: 0 });
    body = steps.step(body, run);
    const predicted = JSON.stringify(fighting.own);
    room.pump(TICK);
    // Dead or alive, the room's word is the fighter the page predicted, to the bit.
    assert.equal(JSON.stringify(fighting.own), predicted, `tick ${tick}`);
    if (fighting.standing.kind === 'dead' && diedAt === null) {
      diedAt = tick;
      assert.equal(fighting.standing.fell, true, 'dead by a fall');
      const own = fighting.own;
      assert.ok(own && own.z <= 14 && own.z > 13, `6 m down from the platform: ${own?.z}`);
    }
    if (diedAt !== null && body.mode === 'ground') lying += 1;
  }
  assert.notEqual(diedAt, null, 'it died');
  assert.equal(fighting.standing.kind === 'dead' && fighting.standing.fell, true, 'still dead, by the fall');
  assert.ok(body.z < 1 && body.mode === 'ground', `it lies on the land below: ${body.z}`);
  assert.ok(body.y > 11, `run on past the edge as it fell, not held at it: ${body.y}`);
});
