import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ShipLook } from './dress.ts';
import { LAMP_NEAR_M, LANTERN_OFF_M, type Lantern } from './lanterns.ts';
import { shipLanterns } from './shipLights.ts';
import type { DrawnShip } from './shipModels.ts';

const LANTERNS: readonly Lantern[] = [
  { at: [-9, 0, 4], hung: { pole: 3 } },
  { at: [-6, -2.5, 4], hung: { pole: 3 } },
  { at: [-6, 2.5, 4], hung: { pole: 3 } },
];
const NIGHT = 0;
const DAY = 1;

function ship(x: number, look: ShipLook = { side: 'friendly' }): DrawnShip {
  return { hull: 0, place: { x, y: 0, z: 0, heading: 0, pitch: 0, roll: 0 }, rig: null, look };
}

const lit = (ships: readonly DrawnShip[], daylight: number, eye: readonly [number, number, number] = [0, 0, 2]) =>
  shipLanterns(ships, () => LANTERNS, eye, daylight);

test('by day no lantern burns, lights nothing and shows nothing far off', () => {
  const { drawn, lamps, glows } = lit([ship(10), ship(400)], DAY);
  assert.deepEqual([drawn.map((each) => each.look.lanterns ?? 0), lamps, glows], [[0, 0], [], []]);
});

test('at night a near ship burns her lanterns and each is a lamp; a far one shows four warm points at most', () => {
  const { drawn, lamps, glows } = lit([ship(10), ship(400)], NIGHT);
  assert.deepEqual(
    drawn.map((each) => each.look.lanterns),
    [1, 1],
  );
  assert.equal(lamps.length, 3, 'the near ship lights round her');
  assert.equal(glows.length, 3, 'the far one is seen by her lanterns');
  for (const glow of glows) assert.ok(glow.sizeM > 0 && (glow.colour[0] ?? 0) > 0.9);
});

test('a lantern stands where its ship lies and heads, with her: a ship heading east has her stern to the west', () => {
  const east = { ...ship(400), place: { x: 400, y: 0, z: 0, heading: Math.PI / 2, pitch: 0, roll: 0 } };
  const { glows } = lit([east], NIGHT);
  const stern = glows[0]?.at ?? [0, 0, 0];
  assert.ok(Math.abs(stern[0] - 391) < 1e-6 && Math.abs(stern[1]) < 1e-6 && Math.abs(stern[2] - 4) < 1e-6);
});

test('a lantern farther than DFO reached along the water lights nothing, and one within 45 m is no far point', () => {
  const { lamps, glows } = lit([ship(LANTERN_OFF_M + 15)], NIGHT);
  assert.equal(lamps.length, 0);
  const near = lit([ship(LAMP_NEAR_M - 5)], NIGHT);
  assert.ok(near.glows.length < 3 && near.lamps.length === 3);
  assert.ok(glows.every((glow) => (glow.colour[0] ?? 0) <= 1));
});

test('the Grey Tithe and a ship running dark burn nothing, light nothing, show nothing', () => {
  const dark = [ship(10, { side: 'tithe' }), ship(400, { side: 'friendly', dark: true })];
  const { drawn, lamps, glows } = lit(dark, NIGHT);
  assert.deepEqual([drawn.map((each) => each.look.lanterns), lamps, glows], [[0, 0], [], []]);
});
