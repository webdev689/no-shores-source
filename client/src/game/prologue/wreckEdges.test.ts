import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { startCombatRules } from '../../rules/combatRules.ts';
import { FIGHTER_FLOATS } from '../../rules/fighters.ts';
import { BODY_FLOATS, startMovementRules } from '../../rules/movementRules.ts';
import { courseOf, readWreck, topAt } from './wreckLayout.ts';

const MODULE = new URL('../../../../target/wasm32-unknown-unknown/release/movement_wasm.wasm', import.meta.url);
const movement = await startMovementRules(
  await readFile(MODULE).catch(() => {
    throw new Error('movement_wasm.wasm is not built: run `npm run wasm` first');
  }),
);
const ROOM = new URL('../../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const combat = startCombatRules(new WebAssembly.Module(await readFile(ROOM)));
const course = courseOf(readWreck());
/** No ground of the wreck lies lower than this over the sea (tools/wreck/wreck_course.py): under it is the sea. */
const LOWEST_M = 0.5;
/** The squares the wreck's ground is laid in, and its rim's cells (crates/movement RIM_CELL_M). */
const CELL_M = 0.3;
/** Whether (x, y) is over the wreck's ground: its blocks are laid in whole squares, as the rim's cells are. */
const held = (x: number, y: number) =>
  course.some((block) => x >= block.minX && x <= block.maxX && y >= block.minY && y <= block.maxY);
const WAYS = [
  [0, 0, -1],
  [Math.PI / 2, 1, 0],
  [Math.PI, 0, 1],
  [-Math.PI / 2, -1, 0],
] as const;

/** Every square on the wreck's outer edge, with the way out over it. */
function edges(): { x: number; y: number; yaw: number }[] {
  const found: { x: number; y: number; yaw: number }[] = [];
  for (const block of course)
    for (let x = block.minX + CELL_M / 2; x < block.maxX; x += CELL_M)
      for (let y = block.minY + CELL_M / 2; y < block.maxY; y += CELL_M)
        for (const [yaw, east, south] of WAYS)
          if (!held(x + east * CELL_M, y + south * CELL_M)) found.push({ x, y, yaw });
  return found;
}

test("the page's own movement holds a body running and jumping off every outer edge of the wreck", () => {
  movement.setCourse(course);
  assert.ok(movement.setRim(course), 'the rules make the rim from the blocks');
  const outer = edges();
  for (const { x, y, yaw } of outer) {
    let body = { ...movement.standing(x, y), z: topAt(course, x, y) };
    for (let tick = 0; tick < 48; tick++)
      body = movement.step(body, {
        forward: 1,
        sideways: 0,
        yaw,
        run: true,
        jump: tick % 24 === 12,
        crouch: false,
        mounted: false,
      });
    assert.ok(
      held(body.x, body.y) && body.z > LOWEST_M - 1e-9,
      `held running from ${x.toFixed(2)}, ${y.toFixed(2)} at ${yaw.toFixed(2)}: ${JSON.stringify(body)}`,
    );
  }
  assert.ok(outer.length > 1000, `the wreck's outer edges were walked: ${outer.length}`);
  movement.setHeights(null);
});

test("in a fight, the page's own prediction holds the player at the wreck's edge as the room does", () => {
  combat.setCourse(course);
  assert.ok(combat.setRim(course), 'the rules make the rim from the blocks');
  // A sword and a shield (the combat crate's arms code), and every tenth edge: a fight's step is the slower one.
  const swordAndShield = 2 | (1 << 16);
  const outer = edges().filter((_edge, index) => index % 10 === 0);
  for (const { x, y, yaw } of outer) {
    let fighter: Float64Array = new Float64Array(FIGHTER_FLOATS);
    fighter.set([x, y, topAt(course, x, y), 0, 0, 0, yaw, 0, 0, 0, 1]);
    fighter.set(
      [0, swordAndShield, 1, 100, 100, 100, 0, 0, 40, 0, 0, yaw, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
      BODY_FLOATS,
    );
    for (let tick = 0; tick < 60; tick++) {
      const dodge = tick % 30 === 10 ? 1 : 0;
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
        dodge,
        0,
        0.1,
        0,
        Number.NaN,
        Number.NaN,
        Number.NaN,
        0,
      ]);
      fighter = combat.predict(fighter, intent, 1, swordAndShield, []).fighter;
    }
    const [atX = 0, atY = 0, atZ = 0] = fighter;
    assert.ok(
      held(atX, atY) && atZ > LOWEST_M - 1e-9,
      `held from ${x.toFixed(2)}, ${y.toFixed(2)}: ${atX}, ${atY}, ${atZ}`,
    );
  }
  assert.ok(outer.length > 100, `the edges tried: ${outer.length}`);
});
