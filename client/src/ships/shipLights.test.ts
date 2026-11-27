import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ShipLook } from './dress.ts';
import { LAMP_NEAR_M } from './lanterns.ts';
import { shipLanterns } from './shipLights.ts';
import type { DrawnShip } from './shipModels.ts';

const LANTERNS: readonly (readonly [number, number, number])[] = [
  [-9, 0, 4],
  [-6, -2.5, 4],
  [-6, 2.5, 4],
];
const NIGHT = 0;
const DAY = 1;

function ship(x: number, look: ShipLook = { side: 'friendly' }): DrawnShip {
  return { hull: 0, place: { x, y: 0, z: 0, heading: 0, pitch: 0, roll: 0 }, rig: null, look };
}

const far = (ships: readonly DrawnShip[], daylight: number, eye: readonly [number, number, number] = [0, 0, 2]) =>
  shipLanterns(ships, () => LANTERNS, eye, daylight);

test('by day a far ship shows no lantern points', () => {
  assert.deepEqual(far([ship(400)], DAY), []);
});

test('at night a far ship shows her lanterns as warm points; a near one none, her lanterns seen themselves', () => {
  const glows = far([ship(400)], NIGHT);
  assert.equal(glows.length, 3);
  for (const glow of glows) assert.ok(glow.sizeM > 0 && (glow.colour[0] ?? 0) > 0.9);
  assert.ok(far([ship(LAMP_NEAR_M - 15)], NIGHT).length === 0);
});

test('a lantern stands where its ship lies and heads, with her: a ship heading east has her stern to the west', () => {
  const east = { ...ship(400), place: { x: 400, y: 0, z: 0, heading: Math.PI / 2, pitch: 0, roll: 0 } };
  const stern = far([east], NIGHT)[0]?.at ?? [0, 0, 0];
  assert.ok(Math.abs(stern[0] - 391) < 1e-6 && Math.abs(stern[1]) < 1e-6 && Math.abs(stern[2] - 4) < 1e-6);
});

test('the Grey Tithe and a ship running dark show nothing far off', () => {
  assert.deepEqual(far([ship(400, { side: 'tithe' }), ship(500, { side: 'friendly', dark: true })], NIGHT), []);
});
