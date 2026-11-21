import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FlyingShot } from '../network/messages.ts';
import { GLOW_RAMPS } from '../elementGlow.ts';
import type { Block } from '../rules/movementRules.ts';
import { MARK_FLOATS } from './marks.ts';
import { POWDER, SMOKE } from './markSprites.ts';
import { Tracers, before, figureMuzzle, keptShare, piecesAlong, ribbon } from './tracers.ts';

const TICK = 1 / 60;
const eye = [0, 10, 1.5] as const;
const ball = { ranged: 3, at: [0, 0, 1.5] as const, velocity: [0, -30 / TICK, 0] as const };
const arrow = { ranged: 1, at: [0, 0, 1.5] as const, velocity: [0, -45, 1] as const };

/** A wall across the way north, its south face at `y`. */
const wall = (y: number): Block[] => [{ minX: -2, maxX: 2, minY: y - 0.5, maxY: y, top: 3, bottom: 0 }];
/** The mark vertices of a mesh: place, colour and opacity. */
const vertices = (mesh: readonly number[]) =>
  Array.from({ length: mesh.length / MARK_FLOATS }, (unused, index) =>
    mesh.slice(index * MARK_FLOATS, (index + 1) * MARK_FLOATS),
  );
/** Whether a mesh has a vertex of colour `colour` (stored as the GPU will read it). */
const has = (mesh: readonly number[], colour: readonly number[]) =>
  vertices(mesh).some((vertex) => colour.every((part, index) => Math.abs((vertex[3 + index] ?? 0) - part) < 1e-6));

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

test('a tracer breaks up in four steps as it goes, each keeping fewer of its pieces, never fading', () => {
  const steps = [-0.1, 0.05, 0.15, 0.25, 0.35, 0.45].map((since) => keptShare(since, 0.4));
  assert.deepEqual(steps, [1, 1, 0.75, 0.5, 0.25, 0]);
  const length = (pieces: [number, number][]) => pieces.reduce((sum, [low, high]) => sum + high - low, 0);
  assert.deepEqual(piecesAlong(1, 5, 1), [[1, 5]], 'whole');
  for (const kept of [0.75, 0.5, 0.25]) {
    const shown = length(piecesAlong(0, 28, kept));
    assert.ok(Math.abs(shown - 28 * kept) < 1e-9, `${kept} of it: ${shown}`);
  }
  const fewer = piecesAlong(0, 28, 0.25);
  assert.ok(
    fewer.every(([low]) => piecesAlong(0, 28, 0.5).some(([from]) => from === low)),
    'what is kept later was kept',
  );
});

test("the player's ball races from the drawn muzzle as a solid tracer, breaks up and is gone; its smoke lasts on", () => {
  const tracers = new Tracers();
  const muzzle = [0.2, -0.4, 1.4] as const;
  tracers.fired([ball], () => muzzle);
  tracers.update(TICK, [], []);
  const first = tracers.mesh(eye, [], 1);
  assert.ok(first.length > 0);
  const trace = vertices(first).filter((vertex) => (vertex[6] ?? 0) >= 0);
  const nearest = trace.reduce((best, vertex) => Math.max(best, vertex[1] ?? -99), -99);
  assert.ok(Math.abs(nearest - muzzle[1]) < 0.4, `from the muzzle: ${nearest}`);
  assert.ok(
    trace.every((vertex) => vertex[6] === 1),
    'solid, with no fade by opacity',
  );
  assert.ok(has(first, POWDER[3]) && has(first, POWDER[1]), 'a white-hot core in a powder-orange glow');
  tracers.update(0.5, [], []);
  const later = tracers.mesh(eye, [], 1);
  assert.ok(!has(later, POWDER[1]), 'the tracer is gone');
  assert.ok(
    SMOKE.some((stop) => has(later, stop)),
    'the smoke still hangs',
  );
  tracers.update(1, [], []);
  assert.equal(tracers.mesh(eye, [], 1).length, 0, 'and goes');
});

test("a Double Pistolet's shot is a ball, as a Pistolet's is", () => {
  const tracers = new Tracers();
  tracers.fired([{ ...ball, ranged: 5 }], () => [0.2, -0.4, 1.4] as const);
  tracers.update(TICK, [], []);
  const shown = tracers.mesh(eye, [], 1);
  assert.ok(has(shown, POWDER[3]) && has(shown, POWDER[1]), 'a white-hot core in a powder-orange glow');
});

test("the player's arrow flies and falls until the ground stops it, its trail out of the bow, then stays stuck there", () => {
  const tracers = new Tracers();
  const muzzle = [0.3, -0.5, 1.4] as const;
  tracers.fired([{ ...arrow, velocity: [0, -45, 0] }], () => muzzle);
  tracers.update(0.05, [], []);
  const flying = tracers.mesh(eye, [], 1);
  const trailStart = flying.slice(0, 3);
  assert.ok(Math.hypot((trailStart[0] ?? 0) - 0.3, (trailStart[2] ?? 0) - 1.4) < 0.2, `out of the bow: ${trailStart}`);
  tracers.update(2, [], []);
  const stuck = tracers.mesh(eye, [], 1);
  assert.ok(stuck.length > 0, 'it stays where it struck');
  const lowest = Math.min(...vertices(stuck).map((vertex) => vertex[2] ?? 9));
  assert.ok(lowest > -0.05 && lowest < 0.05, `stuck in the ground: ${lowest}`);
  tracers.update(9, [], []);
  assert.equal(tracers.mesh(eye, [], 1).length, 0, 'gone after 8 s');
});

test('an arrow in a body follows it while it stands, and falls with it', () => {
  const tracers = new Tracers();
  const body: [number, number, number] = [0, -6, 0];
  tracers.fired([{ ...arrow, velocity: [0, -45, 0] }], () => [0, 0, 1.4]);
  tracers.update(0.3, [], [body]);
  tracers.update(0.1, [], [body]);
  const before_ = tracers.mesh(eye, [], 1);
  body[0] = 0.3;
  tracers.update(TICK, [], [body]);
  const moved = tracers.mesh(eye, [], 1);
  const east = (mesh: readonly number[]) => Math.max(...vertices(mesh).map((vertex) => vertex[0] ?? -9));
  assert.ok(Math.abs(east(moved) - east(before_) - 0.3) < 0.05, 'it moved with the body');
  tracers.update(20, [], [body]);
  assert.ok(tracers.mesh(eye, [], 1).length > 0, 'still in it long after');
  tracers.update(TICK, [], []);
  assert.equal(tracers.mesh(eye, [], 1).length, 0, 'gone with the body');
});

test('a shot that strikes stone answers where, for its sparks; one in the ground or a body answers none', () => {
  const stone = new Tracers();
  stone.fired([{ ...arrow, velocity: [0, -45, 0] }], () => [0, 0, 1.4]);
  const impacts = stone.update(1, wall(-5), []);
  assert.equal(impacts.length, 1);
  assert.ok(Math.abs((impacts[0]?.at[1] ?? 0) + 5) < 1e-6 && (impacts[0]?.back[1] ?? 0) > 0.99, 'back the way it came');
  const ground = new Tracers();
  ground.fired([{ ...arrow, velocity: [0, -45, 0] }], () => [0, 0, 1.4]);
  assert.equal(ground.update(1, [], []).length, 0);
});

test('a ball over the sea stops on its surface and splashes there, not on the ground under it', () => {
  const tracers = new Tracers();
  const sea = () => -3;
  tracers.fired([{ ...ball, velocity: [0, -60, -10] }], () => [0, 0, 1.5]);
  tracers.update(0.2, [], [], sea);
  const mesh = tracers.mesh(eye, [], 1);
  const lowest = Math.min(...vertices(mesh).map((vertex) => vertex[2] ?? 9));
  assert.ok(lowest > -0.1, `nothing below the water's surface: ${lowest}`);
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
    stopped: 0n,
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

/** A foe's ball at 70 m/s north from (0, 0, 1.5), as the snapshot after `age` ticks of flight carries it. */
const flyingBall = (age: number): FlyingShot => ({
  owner: 7,
  ranged: 3,
  at: [0, -70 * TICK * age, 1.5],
  velocity: [0, -70, 0],
  age,
  muzzle: null,
  stopped: 0n,
});

test("a foe's travelling ball is one tracer moving out, its gun fired once, however many ticks carry it", () => {
  const tracers = new Tracers();
  const once = new Tracers();
  once.seen([flyingBall(1)], 1);
  let farthest = 0;
  for (let age = 1; age <= 30; age++) {
    tracers.seen([flyingBall(age)], 1);
    const mesh = tracers.mesh(eye, [], 1);
    for (let vertex = 1; vertex < mesh.length; vertex += MARK_FLOATS) farthest = Math.min(farthest, mesh[vertex] ?? 0);
    tracers.update(TICK, [], []);
    if (age > 1) once.seen([flyingBall(age)], 1);
    if (age > 1) once.update(TICK, [], []);
  }
  assert.ok(farthest < -25 && farthest > -40, `its head went with the ball: ${farthest}`);
  const smoke = (mesh: readonly number[]) =>
    vertices(mesh).filter((vertex) => SMOKE.some((stop) => has([...vertex], stop)));
  assert.ok(smoke(tracers.mesh(eye, [], 1)).length > 0, 'its smoke hangs');
  // It stops on its next tick, short of its next place, against a wall: one strike there, then it is gone.
  tracers.seen([{ ...flyingBall(30), velocity: [0, -30, 0], muzzle: [0, 0, 1.5] }], 1);
  const stop = -70 * TICK * 30 - 0.5;
  const impacts = [...tracers.update(0.2, wall(stop), []), ...tracers.update(0.5, wall(stop), [])];
  assert.equal(impacts.length, 1);
  assert.ok(Math.abs((impacts[0]?.at[1] ?? 0) - stop) < 1e-6, `${impacts[0]?.at}`);
  tracers.update(2, [], []);
  assert.equal(tracers.mesh(eye, [], 1).length, 0);
});

test("a foe's travelling ball whose snapshots pause or come late strikes nothing in mid-air, only where it stops", () => {
  const tracers = new Tracers();
  const stop = -70 * TICK * 20 - 0.5;
  const walls = wall(stop);
  const impacts = [];
  for (let age = 1; age <= 10; age++) {
    tracers.seen([flyingBall(age)], 1);
    impacts.push(...tracers.update(TICK, walls, []));
  }
  // Three ticks with no snapshot, as on a late one; then a long pause of the frames' clock alone.
  for (let frame = 0; frame < 3; frame++) impacts.push(...tracers.update(TICK, walls, []));
  assert.equal(impacts.length, 0, 'no strike while the room has said nothing new');
  for (let age = 11; age <= 20; age++) {
    tracers.seen([flyingBall(age)], 1);
    impacts.push(...tracers.update(TICK, walls, []));
  }
  assert.equal(impacts.length, 0, 'carried on as before');
  tracers.seen([{ ...flyingBall(20), velocity: [0, -30, 0], muzzle: [0, 0, 1.5] }], 1);
  impacts.push(...tracers.update(0.2, walls, []), ...tracers.update(0.5, walls, []));
  assert.equal(impacts.length, 1, 'one strike, where it stopped');
  assert.ok(Math.abs((impacts[0]?.at[1] ?? 0) - stop) < 1e-6, `${impacts[0]?.at}`);
});

test("a foe's ball the room says has stopped ends there at once, with no wait for more snapshots", () => {
  const tracers = new Tracers();
  const stop = -70 * TICK * 10 - 0.5;
  const impacts = [];
  for (let age = 1; age <= 10; age++) {
    tracers.seen([flyingBall(age)], 1);
    impacts.push(...tracers.update(TICK, wall(stop), []));
  }
  tracers.seen([{ ...flyingBall(10), velocity: [0, -30, 0], muzzle: [0, 0, 1.5] }], 1);
  impacts.push(...tracers.update(2 * TICK, wall(stop), []));
  assert.equal(impacts.length, 1, 'struck within two ticks of the word');
  assert.ok(Math.abs((impacts[0]?.at[1] ?? 0) - stop) < 1e-6, `${impacts[0]?.at}`);
});

test("a foe's ball first seen where it stopped draws its line from its true muzzle", () => {
  const tracers = new Tracers();
  // Six ticks out at 70 m/s and stopped half a metre on: only its last segment came, with its muzzle.
  tracers.seen([{ ...flyingBall(6), velocity: [0, -30, 0], muzzle: [0, 0, 1.5] }], 1);
  const mesh = tracers.mesh(eye, [], 1);
  const shown = vertices(mesh).filter((vertex) => (vertex[6] ?? 0) >= 0);
  const nearest = Math.max(...shown.map((vertex) => vertex[1] ?? -99));
  assert.ok(Math.abs(nearest) < 0.2, `its trace starts at the muzzle: ${nearest}`);
  const impacts = [...tracers.update(0.1, wall(-7.5), []), ...tracers.update(0.5, wall(-7.5), [])];
  assert.equal(impacts.length, 1, 'and it strikes where it stopped');
  assert.ok(Math.abs((impacts[0]?.at[1] ?? 0) - (-7 - 0.5)) < 1e-6, `${impacts[0]?.at}`);
});

test("a foe's ball that no snapshot carries on or stops is dropped in time, striking nothing", () => {
  const tracers = new Tracers();
  tracers.seen([flyingBall(3)], 1);
  const impacts = [...tracers.update(0.5, [], []), ...tracers.update(1.3, [], [])];
  assert.equal(impacts.length, 0);
  assert.equal(tracers.mesh(eye, [], 1).length, 0, 'gone, its smoke too');
});

test("on rising land the player's arrow stops where it goes under the ground, not at height 0", () => {
  const tracers = new Tracers();
  // Land rising 0.2 m a metre northward from 0 at the origin: a level arrow from 1.5 m up goes under it near 7.5 m out.
  const rising = (x: number, y: number) => -y * 0.2;
  tracers.fired([{ ...arrow, velocity: [0, -45, 0] }], () => [0, 0, 1.5]);
  tracers.update(1, [], [], rising);
  const tip = vertices(tracers.mesh(eye, [], 1)).reduce((best, vertex) =>
    (vertex[1] ?? 0) < (best[1] ?? 0) ? vertex : best,
  );
  const [, y = 0, z = 0] = tip;
  assert.ok(y < -6.5 && y > -7.6 && Math.abs(z - rising(0, y)) < 0.05, `stuck there: ${y}, ${z}`);
});

test("the player's own trail takes its element, another's keeps its own", () => {
  const own = new Tracers();
  own.fired([ball], () => [0, 0, 1.5]);
  own.update(TICK / 4, [], []);
  const [plain, volt] = [own.mesh(eye, [], 1), own.mesh(eye, [], 1, 2, 0.5)];
  const [, , core, glow] = [0, 0, GLOW_RAMPS[2][3], GLOW_RAMPS[2][1]];
  assert.ok(has(volt, core) && has(volt, glow), "its core white-hot and its glow Volt's body");
  assert.ok(!has(plain, core));
  const theirs: FlyingShot = {
    owner: 2,
    ranged: 4,
    at: [0, 0, 1.5],
    velocity: [0, -600, 0],
    age: 0,
    muzzle: [0, 0, 1.5],
    stopped: 0n,
  };
  const others = new Tracers();
  others.seen([theirs], 1);
  assert.deepEqual(others.mesh(eye, [], 1, 2, 0.5), others.mesh(eye, [], 1));
});
