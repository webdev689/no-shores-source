import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type CityPlan, glowLamps, type Solid } from './plan.ts';

const solid = (
  material: Solid['material'],
  middle: [number, number, number],
  size: [number, number, number],
): Solid => ({
  shape: 'block',
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

test("a city's glowing solids give light from their middles, a great fire's reaching farther than a lantern's", () => {
  const beacon = solid('glow', [100, 200, 40], [22, 22, 24]);
  const lantern = solid('glow', [5, 6, 2], [0.5, 0.5, 0.6]);
  const lamps = glowLamps(plan([solid('stone', [0, 0, 0], [5, 5, 5]), beacon], [], [lantern]));
  assert.equal(lamps.length, 2);
  assert.deepEqual(lamps[0]?.at, [100, 200, 52]);
  assert.deepEqual(lamps[1]?.at, [5, 6, 2.3]);
  const [fire, small] = [lamps[0]?.reachM ?? 0, lamps[1]?.reachM ?? 0];
  assert.ok(small >= 9 && small < 12, `a lantern reaches ${small} m`);
  assert.ok(fire > 40 && fire <= 60, `the Beacon reaches ${fire} m`);
  assert.ok((lamps[0]?.light[0] ?? 0) > (lamps[1]?.light[0] ?? 0));
});

test('a city with no glowing solid lights nothing', () => {
  assert.deepEqual(glowLamps(plan([solid('stone', [0, 0, 0], [5, 5, 5])], [], [])), []);
});
