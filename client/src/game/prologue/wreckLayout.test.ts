import assert from 'node:assert/strict';
import { test } from 'node:test';
import wreck from '../../../../content/prologue/wreck.json' with { type: 'json' };
import { courseOf, inArea, layoutAt, readWreck, topAt } from './wreckLayout.ts';

const layout = readWreck();
const course = courseOf(layout);
/** Every deck, but nothing laid on them; and the decks whole, before the ram broke them. */
const decks = layout.decks;
const whole = readWreck({ ...wreck, ships: wreck.ships.map((ship) => ({ ...ship, cuts: [] })) }).decks;
/** The movement rules' step and the reach of a jump over a lip, metres (crates/movement's TUNING). */
const STEP_M = 0.5;
const REACH_M = 1.8;
/** A body's radius: the gate never stands on a player in the arena. */
const BODY_RADIUS_M = 0.35;
/** No deck lies lower than this over the sea. */
const LOWEST_DECK_M = 2.0;

/** The point `walked` metres along the segment from `from` to `to`. */
const along = (from: readonly number[], to: readonly number[], walked: number, length: number) =>
  [0, 1].map((axis) => (from[axis] ?? 0) + (((to[axis] ?? 0) - (from[axis] ?? 0)) * walked) / length);

test('both ships lie as decks of blocks, the brig east to west and the rammer north to south', () => {
  assert.equal(layout.ships.length, 2);
  const [brig, rammer] = layout.ships;
  assert.equal(brig?.lying.heading, Math.PI / 2);
  assert.equal(rammer?.lying.heading, 0);
  assert.equal(rammer?.lying.scale, 1.3);
  assert.ok(decks.length > 50, `${decks.length} deck blocks`);
  // The brig's main deck about 2.2 to 2.4 m up, the rammer's quarterdeck about 1.3 times the brig's.
  assert.ok(Math.abs(topAt(decks, -5, -3) - 2.2) < 0.15, `brig's waist ${topAt(decks, -5, -3)}`);
  assert.ok(topAt(decks, 0, 38) > 3.9 && topAt(decks, 0, 38) < 4.6, `rammer's quarterdeck ${topAt(decks, 0, 38)}`);
});

test('every block that shows stands inside the ships, over one of their decks', () => {
  for (const { kind, block } of layout.scenery) {
    const middle = [(block.minX + block.maxX) / 2, (block.minY + block.maxY) / 2] as const;
    assert.ok(topAt(whole, middle[0], middle[1]) >= LOWEST_DECK_M, `a ${kind} at ${middle.join(', ')}`);
  }
});

test('the path, every gate open, runs from waking to the arena with no hole, nor a rise a step or jump cannot take', () => {
  const [first] = layout.path;
  assert.deepEqual(first, layout.wake.at, 'the path starts where the player wakes');
  let last: number | null = null;
  let climbs = 0;
  for (let index = 1; index < layout.path.length; index++) {
    const [from, to] = [layout.path[index - 1] ?? [0, 0], layout.path[index] ?? [0, 0]];
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    // Ground is read under the body's centre, so a gap of a few centimetres drops it: the walk is sampled finer.
    for (let walked = 0; walked <= length; walked += 0.01) {
      const [x = 0, y = 0] = along(from, to, walked, length);
      const top = topAt(course, x, y);
      assert.ok(top >= LOWEST_DECK_M, `a hole at ${x.toFixed(1)}, ${y.toFixed(1)}`);
      if (last !== null) assert.ok(top - last <= REACH_M, `a wall at ${x.toFixed(1)}, ${y.toFixed(1)}`);
      if (last !== null && top - last > STEP_M + 1e-9) climbs += 1;
      last = top;
    }
  }
  assert.ok(climbs <= 2, `the way is walked, with at most two lips to jump: ${climbs}`);
  const [endX = 0, endY = 0] = layout.path.at(-1) ?? [];
  assert.ok(inArea(layout.zones[layout.arena.zone]?.area ?? [0, 0, 0, 0], endX, endY), 'it ends in the arena');
});

test('the zones follow the path, each checkpoint on a deck in its own zone, each wave on a deck', () => {
  layout.zones.forEach((zone, index) => {
    const [x, y] = zone.checkpoint;
    assert.ok(inArea(zone.area, x, y), `${zone.name}'s checkpoint is in it`);
    assert.ok(topAt(course, x, y) >= LOWEST_DECK_M, `${zone.name}'s checkpoint is on a deck`);
    for (const foe of zone.wave) {
      assert.ok(topAt(course, foe.at[0], foe.at[1]) >= LOWEST_DECK_M, `a foe of ${zone.name} stands on a deck`);
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

test('the arena is open, about 12 m by 9 m, Thule in it, and its gate across the way in', () => {
  const zone = layout.zones[layout.arena.zone];
  assert.ok(zone);
  const [minX, minY, maxX, maxY] = zone.area;
  assert.ok(Math.abs(maxY - minY - 12) <= 1 && Math.abs(maxX - minX - 9) <= 1, 'about 12 m by 9 m');
  assert.equal(zone.wave.length, 0, 'one on one');
  assert.ok(inArea(zone.area, ...layout.arena.thule));
  const { gate } = layout.arena;
  assert.ok(gate.minX <= minX && gate.maxX >= maxX, 'the gate spans the arena');
  assert.ok(
    gate.maxY + BODY_RADIUS_M <= minY && gate.top - topAt(decks, 0, gate.maxY) > 2,
    'across its way in, higher than a step',
  );
  const [pathX = 0, pathY = 0] = layout.path.at(-2) ?? [];
  assert.ok(pathY < gate.minY && !inArea(zone.area, pathX, pathY), 'the path comes in through it');
});

test("the planks laid where the rammer's deck is cut leave no gap a body's centre could drop through", () => {
  const [, rammer] = wreck.ships;
  assert.ok(rammer);
  const uncut = readWreck({ ...wreck, ships: [{ ...rammer, cuts: [] }] }).decks;
  for (const [minX = 0, minY = 0, maxX = 0, maxY = 0] of rammer.cuts)
    for (let x = minX - 0.7; x <= maxX + 0.7; x += 0.01)
      for (let y = minY - 0.7; y <= maxY + 0.7; y += 0.01)
        if (topAt(uncut, x, y) >= LOWEST_DECK_M)
          assert.ok(topAt(course, x, y) >= LOWEST_DECK_M, `a gap at ${x.toFixed(2)}, ${y.toFixed(2)}`);
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

test('fires burn on the decks', () => {
  assert.ok(layout.fires.length >= 6);
  for (const fire of layout.fires) assert.ok(Math.abs(topAt(whole, fire.at[0], fire.at[1]) - fire.at[2]) < 0.6);
});

test('the layout placed at an origin moves everything by it', () => {
  const placed = layoutAt(layout, [100, -50]);
  assert.deepEqual(placed.wake.at, [layout.wake.at[0] + 100, layout.wake.at[1] - 50]);
  assert.equal(topAt(courseOf(placed), 100, -53), topAt(course, 0, -3));
  assert.equal(placed.ships[1]?.lying.y, (layout.ships[1]?.lying.y ?? 0) - 50);
  assert.equal(placed.arena.gate.minX, layout.arena.gate.minX + 100);
});
