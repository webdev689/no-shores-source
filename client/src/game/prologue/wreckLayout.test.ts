import assert from 'node:assert/strict';
import { test } from 'node:test';
import { courseOf, inArea, layoutAt, readWreck, topAt } from './wreckLayout.ts';

const layout = readWreck();
const course = courseOf(layout);
/** The movement rules' step and the reach of a jump over a lip, metres (crates/movement's TUNING). */
const STEP_M = 0.5;
const REACH_M = 1.8;
/** A body's radius: the gate never stands on a player in the arena; and just inside it, where a wall stops a body. */
const BODY_RADIUS_M = 0.35;
const BODY_IN_M = BODY_RADIUS_M - 0.01;
/** No ground a body walks lies lower than this over the sea: the Frigate's gun deck, open to the sky, is the lowest. */
const LOWEST_GROUND_M = 0.7;

/** The point `walked` metres along the segment from `from` to `to`. */
const along = (from: readonly number[], to: readonly number[], walked: number, length: number) =>
  [0, 1].map((axis) => (from[axis] ?? 0) + (((to[axis] ?? 0) - (from[axis] ?? 0)) * walked) / length);

test("the wreck's ground holds its pieces at their heights: the Brig's halves, the Sloop's side, the Frigate's decks", () => {
  assert.ok(course.length > 500, `${course.length} blocks`);
  const near = (x: number, y: number, height: number, name: string) =>
    assert.ok(Math.abs(topAt(course, x, y) - height) < 0.5, `${name} ${topAt(course, x, y).toFixed(2)} m up`);
  // In the game's frame: x east, y south.
  near(-14.3, -1.9, 2.9, "the Brig's quarterdeck");
  near(-8.0, -3.3, 1.8, "the Brig's waist along her port side");
  near(0.0, -2.7, 1.8, 'the torn deck over the gap');
  near(7.0, -1.2, 2.0, "the Brig's fore deck");
  near(12.3, 13.0, 1.5, "the Sloop's side");
  near(2.5, 15.0, 2.7, "the Frigate's waist");
  near(-1.6, 27.0, 1.0, "the Frigate's gun deck");
  near(2.0, 35.0, 3.3, "the Frigate's quarterdeck");
  // The Brig's waist on the side the Frigate struck fell into her hold: the sea under it.
  assert.equal(topAt(course, -7.0, 1.5), 0, "the Brig's fallen waist");
});

/** Each point along the path, every centimetre, and the top under it. */
function walked(): { x: number; y: number; top: number }[] {
  const points: { x: number; y: number; top: number }[] = [];
  for (let index = 1; index < layout.path.length; index++) {
    const [from, to] = [layout.path[index - 1] ?? [0, 0], layout.path[index] ?? [0, 0]];
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    for (let walked = 0; walked <= length; walked += 0.01) {
      const [x = 0, y = 0] = along(from, to, walked, length);
      points.push({ x, y, top: topAt(course, x, y) });
    }
  }
  return points;
}

test('the path, every gate open, runs from waking to the arena with no hole, nor a rise a step or jump cannot take', () => {
  const [first] = layout.path;
  assert.deepEqual(first, layout.wake.at, 'the path starts where the player wakes');
  let last: number | null = null;
  let climbs = 0;
  // Ground is read under the body's centre, so a gap of a few centimetres drops it: the walk is sampled finer.
  for (const { x, y, top } of walked()) {
    assert.ok(top >= LOWEST_GROUND_M, `a hole at ${x.toFixed(1)}, ${y.toFixed(1)}`);
    if (last !== null) assert.ok(top - last <= REACH_M, `a wall at ${x.toFixed(1)}, ${y.toFixed(1)}`);
    if (last !== null && top - last > STEP_M + 1e-9) climbs += 1;
    last = top;
  }
  assert.ok(climbs <= 3, `the way is walked, with at most three lips to jump: ${climbs}`);
  const [endX = 0, endY = 0] = layout.path.at(-1) ?? [];
  assert.ok(inArea(layout.zones[layout.arena.zone]?.area ?? [0, 0, 0, 0], endX, endY), 'it ends in the arena');
});

test('every lane of the path is a body wide: nothing stands in a body walking it but the lips the path itself takes', () => {
  const points = walked();
  // A lip the path climbs or drops is one its centre stands on within 0.8 m along it.
  const NEAR = 80;
  points.forEach(({ x, y, top }, index) => {
    const taken = Math.max(...points.slice(Math.max(0, index - NEAR), index + NEAR + 1).map((point) => point.top));
    for (let bearing = 0; bearing < 2 * Math.PI; bearing += Math.PI / 16) {
      const [atX, atY] = [x + Math.sin(bearing) * BODY_IN_M, y - Math.cos(bearing) * BODY_IN_M];
      const beside = topAt(course, atX, atY);
      assert.ok(
        beside <= Math.max(top + STEP_M, taken) + 1e-9,
        `a body at ${x.toFixed(2)}, ${y.toFixed(2)} runs into ${beside.toFixed(2)} m at ${atX.toFixed(2)}, ${atY.toFixed(2)}`,
      );
    }
  });
});

test('the zones follow the path, each checkpoint on the ground in its own zone, each wave on the ground', () => {
  layout.zones.forEach((zone, index) => {
    const [x, y] = zone.checkpoint;
    assert.ok(inArea(zone.area, x, y), `${zone.name}'s checkpoint is in it`);
    assert.ok(topAt(course, x, y) >= LOWEST_GROUND_M, `${zone.name}'s checkpoint is on the ground`);
    for (const foe of zone.wave) {
      assert.ok(topAt(course, foe.at[0], foe.at[1]) >= LOWEST_GROUND_M, `a foe of ${zone.name} stands on the ground`);
      assert.ok(foe.rank === 1 || foe.rank === 2, 'a first fight holds Minor and Major foes');
    }
    if (index > 0) assert.ok(zone.wave.length > 0 || index === layout.arena.zone, `${zone.name} holds a wave`);
  });
  const seen = new Set(layout.zones.flatMap((zone) => zone.wave.map((foe) => foe.type)));
  assert.ok(
    [...seen].some((type) => type >= 7 && type <= 11),
    'Grey Tithe deck crew',
  );
  assert.ok(
    [...seen].some((type) => type >= 13 && type <= 17),
    'and pirates, to fight each other',
  );
});

test("the arena is the Frigate's quarterdeck, about 10 m by 8 m, Thule in it, and its gate across the way in", () => {
  const zone = layout.zones[layout.arena.zone];
  assert.ok(zone);
  const [minX, minY, maxX, maxY] = zone.area;
  assert.ok(Math.abs(maxX - minX - 10) <= 1 && Math.abs(maxY - minY - 8) <= 1, 'about 10 m by 8 m');
  assert.equal(zone.wave.length, 0, 'one on one');
  assert.ok(inArea(zone.area, ...layout.arena.thule));
  const { gate } = layout.arena;
  assert.ok(gate.minX <= minX && gate.maxX >= maxX, 'the gate spans the arena');
  assert.ok(
    gate.maxY + BODY_RADIUS_M <= minY && gate.top - topAt(course, 0, gate.maxY + BODY_RADIUS_M) > 2,
    'across its way in, higher than a step',
  );
  const entering = layout.path.findIndex(([x, y]) => inArea(zone.area, x, y));
  assert.ok(entering > 0 && entering === layout.path.length - 1, 'the path ends in it');
  assert.ok(
    layout.path.slice(0, entering).some(([, y]) => y < gate.minY),
    'the path comes to it from beyond its gate',
  );
});

test('each zone before the arena has a heap across the way on from it, too high to step or jump, standing on no one', () => {
  const gates = layout.zones.slice(0, layout.arena.zone).map((zone) => zone.gate);
  assert.equal(layout.zones[layout.arena.zone]?.gate, null, 'the arena is the end of the way');
  assert.equal(gates.at(-1), layout.arena.gate, "the last is the arena's own");
  const clear = (gate: (typeof gates)[number], [x, y]: readonly [number, number]) =>
    !!gate &&
    (x < gate.minX - BODY_RADIUS_M ||
      x > gate.maxX + BODY_RADIUS_M ||
      y < gate.minY - BODY_RADIUS_M ||
      y > gate.maxY + BODY_RADIUS_M);
  const crossed: number[] = [];
  gates.forEach((gate, index) => {
    assert.ok(gate, `${layout.zones[index]?.name} has a gate`);
    const standing = [
      layout.wake.at,
      ...layout.zones.flatMap((zone) => [zone.checkpoint, ...zone.wave.map((foe) => foe.at)]),
    ];
    for (const spot of standing)
      assert.ok(clear(gate, spot), `the gate past ${layout.zones[index]?.name} stands on ${spot}`);
    for (let step = 1; step < layout.path.length; step++) {
      const [from, to] = [layout.path[step - 1] ?? [0, 0], layout.path[step] ?? [0, 0]];
      const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
      for (let walked = 0; walked <= length; walked += 0.05) {
        const [x = 0, y = 0] = along(from, to, walked, length);
        if (x < gate.minX || x > gate.maxX || y < gate.minY || y > gate.maxY) continue;
        assert.ok(gate.top - topAt(course, x, y) > REACH_M, `the gate past ${layout.zones[index]?.name} is too low`);
        crossed[index] ??= step;
      }
    }
  });
  assert.equal(crossed.length, gates.length, 'the path goes through every gate');
  assert.deepEqual(
    [...crossed].sort((first, second) => first - second),
    crossed,
    'in the order of the zones',
  );
});

test('every figure stands clear of what stands on the deck: nothing a step over its feet within its body', () => {
  const figures = [
    layout.wake.at,
    layout.arena.thule,
    ...layout.zones.flatMap((zone) => [zone.checkpoint, ...zone.wave.map((foe) => foe.at)]),
  ];
  for (const [x, y] of figures) {
    const top = topAt(course, x, y);
    for (let bearing = 0; bearing < 2 * Math.PI; bearing += Math.PI / 16) {
      const beside = topAt(course, x + Math.sin(bearing) * BODY_IN_M, y - Math.cos(bearing) * BODY_IN_M);
      assert.ok(beside <= top + STEP_M, `a figure at ${x}, ${y} stands against ${beside.toFixed(2)} m`);
    }
  }
});

test('the player wakes facing the way on, nothing standing in the look from behind them down it', () => {
  const [x, y] = layout.wake.at;
  const { facing } = layout.wake;
  const [aheadX, aheadY] = [Math.sin(facing), -Math.cos(facing)];
  const [first = [0, 0], second = [0, 0]] = layout.path;
  assert.ok(Math.abs(Math.atan2(second[0] - first[0], first[1] - second[1]) - facing) < 0.01, 'facing down the path');
  const ground = topAt(course, x, y);
  for (let along = 0; along <= 3; along += 0.1) {
    const top = topAt(course, x + aheadX * along, y + aheadY * along);
    assert.ok(top <= ground + STEP_M, `something stands in the look ${along.toFixed(1)} m ahead`);
  }
});

test('fires burn on the decks, on the sea and along the yards and rails', () => {
  assert.ok(layout.fires.length >= 20);
  assert.ok(layout.fires.filter((fire) => fire.along).length >= 4, 'some burn along a yard, a rail or canvas');
  assert.ok(layout.fires.filter((fire) => fire.at[2] < 0.2).length >= 4, 'some on the sea');
  for (const fire of layout.fires) {
    if (fire.along || fire.at[2] < 0.2) continue;
    // On the ground, or on a heap that closes a way for good, which no body stands on.
    const top = topAt(course, fire.at[0], fire.at[1]);
    assert.ok(Math.abs(top - fire.at[2]) < 0.6 || top - fire.at[2] > 2, `a fire at ${fire.at.join(', ')}`);
  }
});

test('the layout placed at an origin moves everything by it', () => {
  const placed = layoutAt(layout, [100, -50]);
  assert.deepEqual(placed.wake.at, [layout.wake.at[0] + 100, layout.wake.at[1] - 50]);
  assert.equal(topAt(courseOf(placed), 100, -53), topAt(course, 0, -3));
  assert.equal(placed.fires[0]?.at[1], (layout.fires[0]?.at[1] ?? 0) - 50);
  assert.equal(placed.arena.gate.minX, layout.arena.gate.minX + 100);
});
