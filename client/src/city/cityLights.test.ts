import assert from 'node:assert/strict';
import { test } from 'node:test';
import { glowLights } from './cityLights.ts';
import type { CityPlan, Solid, SolidShape } from './plan.ts';

const solid = (
  material: Solid['material'],
  middle: [number, number, number],
  size: [number, number, number],
  shape: SolidShape = { shape: 'block' },
): Solid => ({
  ...shape,
  at: middle,
  size,
  turn: 0,
  lean: 0,
  roll: 0,
  material,
});

const plan = (landmark: Solid[], works: Solid[], social: Solid[]): CityPlan => ({
  id: 'made',
  name: 'Made',
  motif: 'beacon',
  centre: [0, 0],
  grid: { west: 0, north: 0 },
  cells: [],
  gates: [],
  harbour: null,
  landmark,
  works,
  social: { bounds: [0, 0, 1, 1], level: 0, ring: [], spawns: [], solids: social },
  pads: [],
});

const column = { shape: 'column', sides: 12, top: 1 } as const;

test('a lantern burns a small flame in its glass, its light at the lantern, seeded as the flame', () => {
  const { lamps, fires } = glowLights(
    plan([solid('stone', [0, 0, 0], [5, 5, 5])], [], [solid('glow', [5, 6, 2], [0.5, 0.5, 0.6])]),
  );
  assert.equal(lamps.length, 1);
  assert.equal(fires.length, 1);
  const [lamp, flame] = [lamps[0], fires[0]];
  assert.deepEqual(lamp?.at, [5, 6, 2.3]);
  assert.equal(lamp?.motion, 'lantern');
  assert.ok((lamp?.reachM ?? 0) >= 9 && (lamp?.reachM ?? 0) < 12, `a lantern reaches ${lamp?.reachM} m`);
  assert.equal(flame?.seed, lamp?.seed);
  assert.equal(flame?.casts, false);
  assert.ok((flame?.sizeM ?? 0) <= 0.35 && (flame?.at[2] ?? 0) > 2 && (flame?.at[2] ?? 0) < 2.3, 'inside its glass');
});

test("a brazier's, a hoop's and a camp's coals burn a fire on them that casts its own light", () => {
  const brazier = solid('glow', [0, 0, 1.6], [1.1, 0.35, 0.7], column);
  const camp = solid('glow', [10, 0, 0], [0.4, 0.4, 0.35], { shape: 'pyramid', top: 0.2 });
  const tower = solid('glow', [20, 0, 5], [1.2, 1.2, 1.4]);
  const { lamps, fires } = glowLights(plan([], [camp, tower], [brazier]));
  assert.equal(lamps.length, 0);
  assert.equal(fires.length, 3);
  assert.ok(fires.every((fire) => fire.casts && fire.sizeM >= 0.5 && fire.sizeM <= 4));
  assert.ok(Math.abs((fires[1]?.at[2] ?? 0) - (5 + 1.4 * 0.8)) < 1e-9, 'on its coals');
});

test("the Beacon's fire burns round the foot of its glass, its light one great lamp; a sunstone breathes", () => {
  const beacon = solid('glow', [100, 200, 40], [22, 22, 24], column);
  const sunstone = solid('glow', [0, 0, 0], [0.4, 0.34, 0.3], { shape: 'dome', sides: 6 });
  const lighthouse = solid('glow', [50, 0, 20], [3, 3, 2.6]);
  const { lamps, fires } = glowLights(plan([beacon], [sunstone, lighthouse], []));
  assert.equal(fires.length, 8);
  assert.ok(fires.every((fire) => fire.along && !fire.casts && fire.at[2] === 40));
  assert.equal(new Set(fires.map((fire) => fire.seed)).size, 8, 'its sides not in step');
  assert.deepEqual(lamps[0]?.at, [100, 200, 52]);
  assert.ok((lamps[0]?.reachM ?? 0) > 40 && (lamps[0]?.reachM ?? 0) <= 60);
  assert.equal(lamps[0]?.seed, fires[0]?.seed);
  assert.deepEqual(
    lamps.slice(1).map((lamp) => lamp.motion),
    ['stone', 'lantern'],
  );
});

test('a city with no glowing solid lights nothing', () => {
  assert.deepEqual(glowLights(plan([solid('stone', [0, 0, 0], [5, 5, 5])], [], [])), { lamps: [], fires: [] });
});
