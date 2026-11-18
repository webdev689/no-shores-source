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
  const theirs: FlyingShot = {
    owner: 2,
    ranged: 4,
    at: [0, 0, 1.5],
    velocity: [0, -600, 0],
    age: 0,
    muzzle: [0, 0, 1.5],
  };
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

test("a foe's travelling ball is one tracer moving out, with one flash at its muzzle, however many ticks carry it", () => {
  const tracers = new Tracers();
  const flashVertices = (mesh: readonly number[]) => {
    let count = 0;
    for (let vertex = 0; vertex < mesh.length; vertex += MARK_FLOATS)
      if (Math.abs((mesh[vertex + 4] ?? 0) - 0.78) < 1e-6 && Math.abs((mesh[vertex + 5] ?? 0) - 0.35) < 1e-6) count++;
    return count;
  };
  // A ball at 70 m/s as each tick's snapshot carries it: at its place after `age` ticks of flight.
  const carried = (age: number): FlyingShot => ({
    owner: 7,
    ranged: 3,
    at: [0, -70 * TICK * age, 1.5],
    velocity: [0, -70, 0],
    age,
    muzzle: null,
  });
  const oneLine = 2 * (6 + 12) * MARK_FLOATS;
  let flashed = 0;
  let farthest = 0;
  for (let age = 1; age <= 30; age++) {
    tracers.seen([carried(age)], 1);
    const mesh = tracers.mesh(eye, [], 1);
    assert.ok(flashVertices(mesh) <= 6, 'one flash at most');
    if (flashVertices(mesh) > 0) flashed++;
    else assert.equal(mesh.length, oneLine, `one tracer at tick ${age}`);
    for (let vertex = 1; vertex < mesh.length; vertex += MARK_FLOATS) farthest = Math.min(farthest, mesh[vertex] ?? 0);
    tracers.update(TICK, [], []);
  }
  assert.ok(flashed >= 1 && flashed <= 4, `the muzzle flashed once, for its moment: ${flashed} frames`);
  assert.ok(farthest < -25 && farthest > -40, `its head went with the ball: ${farthest}`);
  // It stops on its next tick, short of its next place: one impact there, then it fades and is gone.
  tracers.seen([{ ...carried(30), velocity: [0, -30, 0], muzzle: [0, 0, 1.5] }], 1);
  const impacts = [...tracers.update(0.2, [], []), ...tracers.update(0.5, [], [])];
  assert.equal(impacts.length, 1);
  assert.ok(Math.abs((impacts[0]?.at[1] ?? 0) - (-70 * TICK * 30 - 0.5)) < 1e-6, `${impacts[0]?.at}`);
  assert.equal(tracers.mesh(eye, [], 1).length, 0);
});

test("a foe's travelling ball whose snapshots pause or come late strikes nothing in mid-air, only where it stops", () => {
  const tracers = new Tracers();
  const carried = (age: number): FlyingShot => ({
    owner: 7,
    ranged: 3,
    at: [0, -70 * TICK * age, 1.5],
    velocity: [0, -70, 0],
    age,
    muzzle: null,
  });
  const impacts = [];
  for (let age = 1; age <= 10; age++) {
    tracers.seen([carried(age)], 1);
    impacts.push(...tracers.update(TICK, [], []));
  }
  // Three ticks with no snapshot, as on a late one; then a long pause of the frames' clock alone.
  for (let frame = 0; frame < 3; frame++) impacts.push(...tracers.update(TICK, [], []));
  assert.equal(impacts.length, 0, 'no strike while the room has said nothing new');
  for (let age = 11; age <= 20; age++) {
    tracers.seen([carried(age)], 1);
    impacts.push(...tracers.update(TICK, [], []));
  }
  assert.equal(impacts.length, 0, 'carried on as before');
  tracers.seen([{ ...carried(20), velocity: [0, -30, 0], muzzle: [0, 0, 1.5] }], 1);
  impacts.push(...tracers.update(0.2, [], []), ...tracers.update(0.5, [], []));
  assert.equal(impacts.length, 1, 'one strike, where it stopped');
  assert.ok(Math.abs((impacts[0]?.at[1] ?? 0) - (-70 * TICK * 20 - 0.5)) < 1e-6, `${impacts[0]?.at}`);
});

/** A foe's ball at 70 m/s north from (0, 0, 1.5), as the snapshot after `age` ticks of flight carries it. */
const flyingBall = (age: number): FlyingShot => ({
  owner: 7,
  ranged: 3,
  at: [0, -70 * TICK * age, 1.5],
  velocity: [0, -70, 0],
  age,
  muzzle: null,
});

test("a foe's ball the room says has stopped ends there at once, with no wait for more snapshots", () => {
  const tracers = new Tracers();
  const impacts = [];
  for (let age = 1; age <= 10; age++) {
    tracers.seen([flyingBall(age)], 1);
    impacts.push(...tracers.update(TICK, [], []));
  }
  tracers.seen([{ ...flyingBall(10), velocity: [0, -30, 0], muzzle: [0, 0, 1.5] }], 1);
  impacts.push(...tracers.update(2 * TICK, [], []));
  assert.equal(impacts.length, 1, 'struck within two ticks of the word');
  assert.ok(Math.abs((impacts[0]?.at[1] ?? 0) - (-70 * TICK * 10 - 0.5)) < 1e-6, `${impacts[0]?.at}`);
});

test("a foe's ball first seen where it stopped draws its line from its true muzzle", () => {
  const tracers = new Tracers();
  // Six ticks out at 70 m/s and stopped half a metre on: only its last segment came, with its muzzle.
  tracers.seen([{ ...flyingBall(6), velocity: [0, -30, 0], muzzle: [0, 0, 1.5] }], 1);
  const mesh = tracers.mesh(eye, [], 1);
  const nearest = Math.max(...mesh.filter((unused, index) => index % MARK_FLOATS === 1));
  assert.ok(Math.abs(nearest) < 0.2, `its trace starts at the muzzle: ${nearest}`);
  const impacts = [...tracers.update(0.1, [], []), ...tracers.update(0.5, [], [])];
  assert.equal(impacts.length, 1, 'and it strikes where it stopped');
  assert.ok(Math.abs((impacts[0]?.at[1] ?? 0) - (-7 - 0.5)) < 1e-6, `${impacts[0]?.at}`);
});

test("a foe's ball that no snapshot carries on or stops is dropped in time, striking nothing", () => {
  const tracers = new Tracers();
  tracers.seen([flyingBall(3)], 1);
  const impacts = [...tracers.update(0.5, [], []), ...tracers.update(0.6, [], [])];
  assert.equal(impacts.length, 0);
  assert.equal(tracers.mesh(eye, [], 1).length, 0, 'gone');
});
