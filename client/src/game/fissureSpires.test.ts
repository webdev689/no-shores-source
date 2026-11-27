import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { startCombatRules } from '../rules/combatRules.ts';
import { FIGHTER_FLOATS } from '../rules/fighters.ts';
import { BODY_FLOATS, startMovementRules } from '../rules/movementRules.ts';
import { MARK, PUBLIC_KIND, type PublicEvent } from '../network/publicMessages.ts';
import { SPIRE_SUNK_M, SpireCourse, spireBlocks } from './fissureSpires.ts';

const RELEASE = '../../../target/wasm32-unknown-unknown/release/';
const movement = await startMovementRules(await readFile(new URL(`${RELEASE}movement_wasm.wasm`, import.meta.url)));
const combat = startCombatRules(
  new WebAssembly.Module(await readFile(new URL(`${RELEASE}room_wasm.wasm`, import.meta.url))),
);
/** Written by `cargo test -p room` (public/page_numbers_tests.rs): the room's spires and how far they are sunk. */
const rules = JSON.parse(
  readFileSync(new URL('../../../target/protocol/room-numbers.json', import.meta.url), 'utf8'),
) as {
  spires: number[][];
  spireSunk: number;
};

test("the page's spires are the room's: its SPIRES, sunk as far, at the mark, on the ground under each middle", () => {
  const { spires } = rules;
  assert.equal(spires.length, 4);
  assert.equal(rules.spireSunk, SPIRE_SUNK_M);
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
    ground: [500, 300, 0],
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
  fighter.set([0, 0, 1, 100, 100, 100, 0, 0, 40, 0, 0, yaw, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0], BODY_FLOATS);
  const intent = new Float64Array([
    1,
    0,
    yaw,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0.1,
    0,
    Number.NaN,
    Number.NaN,
    Number.NaN,
    0,
  ]);
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

test("the spires stand at the event's ground as the room keeps it, to the bit, and go once the room is lost", () => {
  const set: (readonly unknown[])[] = [];
  const course = new SpireCourse([], [{ setCourse: (blocks) => void set.push(blocks) }]);
  // The room's ground in f64; the mark carries it in f32.
  const ground = [500.123456789, 300.987654321, 0] as const;
  const fissure = {
    kind: PUBLIC_KIND.fissure,
    phase: 1,
    ground,
    marks: [
      { kind: MARK.fissure, id: 0, at: [Math.fround(ground[0]), Math.fround(ground[1]), 0], health: 1, state: 0 },
    ],
  } as unknown as PublicEvent;
  course.frame(fissure, () => 0);
  assert.deepEqual(
    set.at(-1),
    spireBlocks(ground[0], ground[1], () => 0),
  );
  course.frame(null, () => 0);
  assert.deepEqual(set.at(-1), [], 'a room lost leaves no spire standing');
  assert.equal(set.length, 2);
});
