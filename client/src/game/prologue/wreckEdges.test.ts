import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { startMovementRules } from '../../rules/movementRules.ts';
import { courseOf, readWreck, RIM_CELL_M, rimOf, topAt } from './wreckLayout.ts';

const MODULE = new URL('../../../../target/wasm32-unknown-unknown/release/movement_wasm.wasm', import.meta.url);
const movement = await startMovementRules(
  await readFile(MODULE).catch(() => {
    throw new Error('movement_wasm.wasm is not built: run `npm run wasm` first');
  }),
);
const course = courseOf(readWreck());
/** No ground of the wreck lies lower than this over the sea (tools/wreck/wreck_course.py): under it is the sea. */
const LOWEST_M = 0.5;

test("the page's own movement holds a body running and jumping off every outer edge of the wreck", () => {
  movement.setCourse(course);
  assert.ok(movement.setHeights(rimOf(course)), 'the rim is a grid the movement takes');
  const [west = 0, north = 0, cell = 0, columns = 0, rows = 0, ...heights] = rimOf(course);
  const held = (x: number, y: number) => {
    const [column, row] = [Math.floor((x - west) / cell), Math.floor((y - north) / cell)];
    return column >= 0 && column < columns && row >= 0 && row < rows && heights[row * columns + column] === 0;
  };
  const ways = [
    [0, 0, -1],
    [Math.PI / 2, 1, 0],
    [Math.PI, 0, 1],
    [-Math.PI / 2, -1, 0],
  ] as const;
  let edges = 0;
  for (const block of course)
    for (let x = block.minX + RIM_CELL_M / 2; x < block.maxX; x += RIM_CELL_M)
      for (let y = block.minY + RIM_CELL_M / 2; y < block.maxY; y += RIM_CELL_M)
        for (const [yaw, east, south] of ways) {
          if (held(x + east * RIM_CELL_M, y + south * RIM_CELL_M)) continue;
          edges += 1;
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
  assert.ok(edges > 1000, `the wreck's outer edges were walked: ${edges}`);
  movement.setHeights(null);
});
