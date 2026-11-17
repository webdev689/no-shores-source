import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FlyingShot } from '../network/messages.ts';
import { MARK_FLOATS } from '../combat/marks.ts';
import { Tracers, before, figureMuzzle, ribbon } from './tracers.ts';

const TICK = 1 / 60;
const eye = [0, 10, 1.5] as const;
const ball = { ranged: 3, at: [0, 0, 1.5] as const, velocity: [0, -30 / TICK, 0] as const };
const arrow = { ranged: 1, at: [0, 0, 1.5] as const, velocity: [0, -45, 1] as const };

test("an arrow's past is its flight run backwards: forward a second and back a second is where it began", () => {
  let [place, velocity] = [arrow.at as readonly [number, number, number], arrow.velocity as readonly number[]];
  for (let tick = 0; tick < 60; tick++) {
    velocity = [velocity[0] ?? 0, velocity[1] ?? 0, (velocity[2] ?? 0) - 6 * TICK];
    place = [
      place[0] + (velocity[0] ?? 0) * TICK,
      place[1] + (velocity[1] ?? 0) * TICK,
      place[2] + (velocity[2] ?? 0) * TICK,
    ];
  }
  const back = before(place, velocity as [number, number, number], 1);
  assert.ok(Math.hypot(back[0] - 0, back[1] - 0, back[2] - 1.5) < 0.06, `${back}`);
});

test('a ribbon is two triangles a segment, each vertex a mark vertex', () => {
  const out: number[] = [];
  const point = (y: number) => ({ at: [0, y, 1] as const, width: 0.1, colour: [1, 1, 1, 1] as const });
  ribbon(out, eye, [point(0), point(-1), point(-2)]);
  assert.equal(out.length, 2 * 6 * MARK_FLOATS);
});

test("the player's ball races from the drawn muzzle to where it stopped, then fades and is gone", () => {
  const tracers = new Tracers();
  const muzzle = [0.2, -0.4, 1.4] as const;
  tracers.fired([ball], () => muzzle);
  const first = tracers.mesh(eye, [], 1);
  assert.ok(first.length > 0);
  assert.deepEqual(
    first.slice(0, 3).map((value) => Math.round(value * 10) / 10),
    [0.2, -0.4, 1.4].map((value) => value + 0),
    'from the muzzle',
  );
  tracers.update(0.5, [], []);
  assert.equal(tracers.mesh(eye, [], 1).length, 0, 'gone');
});

test("the player's arrow flies and falls until the ground stops it, its trail out of the bow, then lingers and is gone", () => {
  const tracers = new Tracers();
  const muzzle = [0.3, -0.5, 1.4] as const;
  tracers.fired([{ ...arrow, velocity: [0, -45, 0] }], () => muzzle);
  tracers.update(0.05, [], []);
  const flying = tracers.mesh(eye, [], 1);
  const trailStart = flying.slice(0, 3);
  assert.ok(Math.hypot((trailStart[0] ?? 0) - 0.3, (trailStart[2] ?? 0) - 1.4) < 0.2, `out of the bow: ${trailStart}`);
  tracers.update(2, [], []);
  assert.ok(tracers.mesh(eye, [], 1).length > 0, 'stopped on the ground, its trail lingers');
  tracers.update(0.5, [], []);
  assert.equal(tracers.mesh(eye, [], 1).length, 0);
});

test("another's ball draws its tracer from the snapshot that carried it; the player's own is left to their own shots", () => {
  const tracers = new Tracers();
  const theirs: FlyingShot = { owner: 2, ranged: 4, at: [0, 0, 1.5], velocity: [0, -600, 0], age: 0 };
  tracers.seen([theirs, { ...theirs, owner: 1 }, { ...theirs, ranged: 1 }], 1);
  const drawn = tracers.mesh(eye, [], 1).length;
  const alone = new Tracers();
  alone.seen([theirs], 1);
  assert.equal(drawn, alone.mesh(eye, [], 1).length, "only the other player's ball, not the own one nor an arrow");
  assert.ok(drawn > 0);
});

test("a figure's muzzle stands ahead of its chest and a little to its right", () => {
  const [x, y, z] = figureMuzzle([0, 0, 0], 0);
  assert.ok(x > 0 && y < 0 && z > 1);
});
