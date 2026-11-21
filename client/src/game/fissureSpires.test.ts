import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { startCombatRules } from '../rules/combatRules.ts';
import { FIGHTER_FLOATS } from '../rules/fighters.ts';
import { startMovementRules } from '../rules/movementRules.ts';
import { MARK, PUBLIC_KIND, type PublicEvent } from '../network/publicMessages.ts';
import { SPIRE_SUNK_M, SpireCourse, spireBlocks } from './fissureSpires.ts';

const RELEASE = '../../../target/wasm32-unknown-unknown/release/';
const movement = await startMovementRules(await readFile(new URL(`${RELEASE}movement_wasm.wasm`, import.meta.url)));
const combat = startCombatRules(
  new WebAssembly.Module(await readFile(new URL(`${RELEASE}room_wasm.wasm`, import.meta.url))),
);
const rules = readFileSync(new URL('../../../crates/room/src/public/fissure.rs', import.meta.url), 'utf8');

test("the page's spires are the room's: its SPIRES, sunk as far, at the mark, on the ground under each middle", () => {
  const listed = /SPIRES: \[\[f64; 6\]; 4\] = \[([^;]*)\];/.exec(rules)?.[1] ?? '';
  const spires = [...listed.matchAll(/\[([^\]]+)\]/g)].map((row) => (row[1] ?? '').split(',').map(Number));
  assert.equal(spires.length, 4);
  assert.equal(Number(/const SPIRE_SUNK: f64 = ([\d.]+);/.exec(rules)?.[1]), SPIRE_SUNK_M);
  const floor = (x: number, y: number) => 0.01 * x + 0.02 * y;
  const blocks = spireBlocks(500, 300, floor);
  blocks.forEach((block, index) => {
    const [west = 0, north = 0, , east = 0, south = 0, top = 0] = spires[index] ?? [];
    const ground = floor(500 + (west + east) / 2, 300 + (north + south) / 2);
    assert.deepEqual(block, {
      minX: 500 + west,
      minY: 300 + north,
      maxX: 500 + east,
      maxY: 300 + south,
      top: ground + top,
      bottom: ground - SPIRE_SUNK_M,
    });
  });
});

test("at a spire the page's movement and the room's fight both stop a body running into it", () => {
  const fissure = {
    kind: PUBLIC_KIND.fissure,
    phase: 1,
    marks: [{ kind: MARK.fissure, id: 0, at: [500, 300, 0], health: 1, state: 0 }],
  } as unknown as PublicEvent;
  const course = new SpireCourse([], [movement, combat]);
  course.frame(fissure, () => 0);
  const spire = spireBlocks(500, 300, () => 0)[1];
  assert.ok(spire);
  const middleY = (spire.minY + spire.maxY) / 2;
  const yaw = Math.PI / 2; // east
  let body = { ...movement.standing(spire.minX - 2, middleY) };
  for (let tick = 0; tick < 90; tick++)
    body = movement.step(body, {
      forward: 1,
      sideways: 0,
      yaw,
      run: true,
      jump: false,
      crouch: false,
      mounted: false,
    });
  assert.ok(body.x < spire.minX, `the page's movement stopped at ${body.x}, short of ${spire.minX}`);
  let fighter: Float64Array = new Float64Array(FIGHTER_FLOATS);
  fighter.set([spire.minX - 2, middleY, 0, 0, 0, 0, yaw, 0, 0, 0, 1]);
  fighter.set([0, 0, 1, 100, 100, 100, 0, 0, 40, 0, 0, yaw, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0], 22);
  const intent = new Float64Array([1, 0, yaw, 0, 0, 0, 0, 0, 0, 0, 0, 0.1, 0, Number.NaN, Number.NaN, Number.NaN]);
  for (let tick = 0; tick < 90; tick++) fighter = combat.predict(fighter, intent, 1, 0, []).fighter;
  const [roomX = Infinity] = fighter;
  assert.ok(roomX < spire.minX, `the room's step stopped at ${roomX}, short of ${spire.minX}`);
  assert.ok(Math.abs(roomX - body.x) < 0.05, `both at the spire's face: ${body.x} and ${roomX}`);
  course.frame({ ...fissure, phase: 2 }, () => 0);
  let free = { ...movement.standing(spire.minX - 2, middleY) };
  for (let tick = 0; tick < 90; tick++)
    free = movement.step(free, { forward: 1, sideways: 0, yaw, run: true, jump: false, crouch: false, mounted: false });
  assert.ok(free.x > spire.maxX, 'once it is over, the spires are gone');
});
