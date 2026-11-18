import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { LocalRoom } from '../network/localRoom.ts';
import type { Snapshot } from '../network/roomConnection.ts';
import { startCombatRules } from '../rules/combatRules.ts';
import type { Body, Controls, MovementRules } from '../rules/movementRules.ts';
import { Fighting } from './fighting.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const compiled = new WebAssembly.Module(
  await readFile(MODULE).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  }),
);
const TICK = 1 / 60;
const movement = { tickSeconds: TICK } as unknown as MovementRules;
const UNPRESSED = { swing: false, shoot: false, guard: false, dodge: false, pitch: 0 };
const EAST: Controls = {
  forward: 1,
  sideways: 0,
  yaw: Math.PI / 2,
  run: true,
  jump: false,
  crouch: false,
  mounted: false,
};

/** A node's window of the land, 10 m up, and its file as the bake writes it: a section 100 m square round its spawn. */
function node(): { text: string; ground: string } {
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
  const layers = { land: grid(10), lake_level: Array<number>(16).fill(0), rivers: [], roads: [], towns: [] };
  const ground = JSON.stringify({ ...layers, coast: grid(5000), across: grid(-50), pads: [], seed: 7 });
  const ring = [
    [-50, -50],
    [50, -50],
    [50, 50],
    [-50, 50],
  ];
  const file = { id: 'glade', ring, spawns: [[0, 0]], bounds: [-150, -150, 150, 150], boxes: [] };
  return { text: JSON.stringify({ ...file, ground: JSON.parse(ground) as unknown }), ground };
}

test('in a node the page predicts its fighter on the land as its room steps it, and past the edge lies still until it asks to stand again', () => {
  const { text, ground } = node();
  let fight: Fighting | null = null;
  const room = LocalRoom.openNode(compiled, text, (snapshot: Snapshot) => fight?.receive(snapshot));
  const rules = startCombatRules(compiled);
  assert.equal(rules.setGround(ground), true);
  rules.setCourse([]);
  const fighting = new Fighting(rules, room);
  fight = fighting;
  room.pump(TICK);
  const steps = fighting.steps(movement);
  let body = {} as Body;
  /** One tick east: the page's prediction, then the room's word on it, the same to the bit where it was `foreseen`. */
  const tick = (foreseen = true) => {
    fighting.press(UNPRESSED);
    body = steps.step(body, EAST);
    const predicted = JSON.stringify(fighting.own);
    room.pump(TICK);
    if (foreseen) assert.equal(JSON.stringify(fighting.own), predicted);
  };
  for (let ticks = 0; ticks < 2000 && fighting.standing.kind !== 'dead'; ticks += 1) tick();
  assert.equal(fighting.standing.kind, 'dead', 'run out past the edge, dead');
  assert.ok((fighting.own?.z ?? 0) > 9.5, 'on the land 10 m up, not on open ground');
  const fallen = JSON.stringify(fighting.own);
  for (let ticks = 0; ticks < 240; ticks += 1) tick();
  assert.equal(JSON.stringify(fighting.own), fallen, 'still where it fell, however its keys are held');
  fighting.askRespawn();
  tick(false);
  assert.deepEqual([fighting.standing.kind, fighting.own?.x, fighting.own?.y], ['inside', 0, 0], 'at the spawn');
});
