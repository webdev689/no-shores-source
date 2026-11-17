import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Mass } from '../models/buildingPlan.ts';
import { placed } from './blocks.ts';
import {
  boxMass,
  hullOf,
  keptMasses,
  MASS_FLOATS,
  MASS_HIP,
  MASS_TIER_HULLS,
  massShape,
  writeMass,
} from './cityMasses.ts';

const mass = (
  west: number,
  east: number,
  south: number,
  north: number,
  eaves: number,
  roof: Mass['roof'] = 'gable',
): Mass => ({
  west,
  east,
  south,
  north,
  base: 0,
  eaves,
  ridge: roof === 'flat' ? eaves : eaves + 3,
  roof,
  ridgeAlong: east - west >= north - south ? 'x' : 'z',
});

test('steps and ledges are left out far off, and the largest mass comes first', () => {
  const kept = keptMasses([mass(0, 2, 0, 2, 1, 'flat'), mass(0, 4, 0, 4, 5), mass(0, 10, 0, 6, 6)]);
  assert.deepEqual(
    kept.map((each) => each.east),
    [10, 4],
  );
});

test("a mass stands where its building's placement stands it, its ridge turned with the building", () => {
  const place = placed([1000, 2000], 40, [0, 50, 50, 0, 90]);
  const shape = massShape(mass(-2, 2, -6, 6, 5), place, [1000, 2000]);
  // the ridge runs along the model's z, which a quarter turn takes east: its axis turned to east is no turn at all
  assert.ok(Math.abs(Math.cos(shape.turn) - 1) < 1e-9 && Math.abs(Math.sin(shape.turn)) < 1e-9, `${shape.turn}`);
  assert.equal(shape.halfAlong, 6);
  assert.equal(shape.halfAcross, 2);
  assert.ok(Math.abs(shape.east - 50) < 1e-9 && Math.abs(shape.south - 50) < 1e-9 && shape.base === 40);
  assert.equal(shape.rise, 3);
  const offset = massShape(mass(2, 6, -1, 1, 5), place, [1000, 2000]);
  assert.ok(Math.abs(offset.south - 54) < 1e-9, 'a mass east of the origin lands south once turned a quarter');
});

test("a building's hull holds all its kept masses, walled to its largest's eaves, its roof no steeper than the forge's", () => {
  const hull = hullOf([mass(0, 10, 0, 6, 6), mass(10, 14, 0, 3, 4, 'flat'), mass(0, 1, 0, 1, 0.5, 'flat')]);
  assert.ok(hull);
  assert.deepEqual([hull.west, hull.east, hull.south, hull.north], [0, 14, 0, 6]);
  assert.equal(hull.eaves, 6);
  assert.ok(hull.ridge - hull.eaves <= 0.9 * 3 + 1e-9);
  assert.equal(hull.ridgeAlong, 'x');
  assert.equal(hullOf([]), null);
});

test('a prop standing for a building is a flat box', () => {
  const box = boxMass({ min: [-1, 0, -2], max: [1, 3, 2] });
  assert.equal(box.roof, 'flat');
  assert.equal(box.eaves, 3);
});

test('an instance is twelve numbers: its shape, then its layers, cell and flags as whole numbers', () => {
  const buffer = new ArrayBuffer(MASS_FLOATS * 4 * 2);
  const [floats, whole] = [new Float32Array(buffer), new Uint32Array(buffer)];
  const shape = { east: 1, south: 2, base: 3, turn: 0.5, halfAlong: 4, halfAcross: 5, wall: 6, rise: 1, hip: true };
  writeMass(floats, whole, 1, shape, { wall: 7, roof: 9 }, 300, MASS_TIER_HULLS);
  assert.deepEqual([...floats.slice(12, 20)], [1, 2, 3, 0.5, 4, 5, 6, 1]);
  assert.deepEqual([...whole.slice(20, 24)], [7, 9, 300, MASS_HIP | MASS_TIER_HULLS]);
});
