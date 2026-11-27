import assert from 'node:assert/strict';
import { test } from 'node:test';
import { routeOf } from './heldMapLaw.ts';
import { routeTiles, TILE_PX, TILE_WORDS } from './routeTiles.ts';

const smoothstep = (low: number, high: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};

/** How strongly one leg inks a pixel `at` (pixels from the map's top-left), as the ink's shader works it out. */
function legAt(route: Float32Array, leg: number, pixel: readonly [number, number], view: typeof VIEW): number {
  const world = [view.left + pixel[0] / view.scale, view.top + pixel[1] / view.scale];
  const [fromX = 0, fromY = 0, fromAlong = 0] = route.subarray(leg * 4, leg * 4 + 3);
  const [toX = 0, toY = 0, toAlong = 0] = route.subarray(leg * 4 + 4, leg * 4 + 7);
  const [alongX, alongY] = [toX - fromX, toY - fromY];
  const reach = ((world[0]! - fromX) * alongX + (world[1]! - fromY) * alongY) / Math.max(alongX ** 2 + alongY ** 2, 1);
  const t = Math.min(1, Math.max(0, reach));
  const away = Math.hypot(world[0]! - fromX - alongX * t, world[1]! - fromY - alongY * t) * view.scale;
  const metres = (fromAlong + (toAlong - fromAlong) * t) * view.scale;
  const dash = metres - Math.floor(metres / 11) * 11 >= 7 ? 0 : 1;
  return (1 - smoothstep(0.9, 1.8, away)) * dash;
}

const VIEW = { left: 2_000_000, top: 1_000_000, scale: 0.0011 } as const;
const INK = { x: 40, y: 30, width: 1_700, height: 960 } as const;

test('the route inks every pixel as it would measured against every leg, each tile asking only the legs near it', () => {
  let seed = 11;
  const random = () => ((seed = (seed * 16_807) % 2_147_483_647) - 1) / 2_147_483_646;
  for (let trial = 0; trial < 6; trial++) {
    // A voyage wandering across the map and past its edges, kept to the map's most points.
    const course: [number, number][] = [[VIEW.left + random() * 1_500_000, VIEW.top + random() * 870_000]];
    for (let step = 0; step < 40 + trial * 60; step++) {
      const [x, y] = course.at(-1)!;
      course.push([x + (random() - 0.45) * 90_000, y + (random() - 0.5) * 70_000]);
    }
    const route = routeOf(course, 128);
    const points = route.length / 4;
    const { columns, rows, masks } = routeTiles(route, points, VIEW, INK);
    let inked = 0;
    for (let sample = 0; sample < 20_000; sample++) {
      const pixel = [random() * INK.width, random() * INK.height] as const;
      let all = 0;
      for (let leg = 0; leg + 1 < points; leg++) all = Math.max(all, legAt(route, leg, pixel, VIEW));
      const [column, row] = [
        Math.min(columns - 1, Math.floor(pixel[0] / TILE_PX)),
        Math.min(rows - 1, Math.floor(pixel[1] / TILE_PX)),
      ];
      let near = 0;
      for (let leg = 0; leg + 1 < points; leg++) {
        const word = masks[(row * columns + column) * TILE_WORDS + Math.floor(leg / 32)] ?? 0;
        if ((word >>> (leg % 32)) & 1) near = Math.max(near, legAt(route, leg, pixel, VIEW));
      }
      assert.equal(near, all, `trial ${trial}, pixel ${pixel.join(', ')}`);
      if (all > 0) inked++;
    }
    assert.ok(inked > 0, 'some pixels lay on the route');
  }
});

test('a tile asks few of a long voyage’s legs, and every pixel of the map has a tile', () => {
  const course = Array.from({ length: 400 }, (unused, step): [number, number] => [
    VIEW.left + step * 4_000,
    VIEW.top + 400_000 + Math.sin(step / 9) * 200_000,
  ]);
  const route = routeOf(course, 128);
  const { columns, rows, masks } = routeTiles(route, route.length / 4, VIEW, INK);
  assert.ok(columns * TILE_PX > INK.width && rows * TILE_PX > INK.height, 'tiles reach the far edges');
  let most = 0;
  for (let tile = 0; tile < columns * rows; tile++) {
    let legs = 0;
    for (let word = 0; word < TILE_WORDS; word++)
      for (let bits = masks[tile * TILE_WORDS + word] ?? 0; bits; bits &= bits - 1) legs++;
    most = Math.max(most, legs);
  }
  assert.ok(most <= 8, `a tile asks at most a few legs (${most} of ${route.length / 4 - 1})`);
});
