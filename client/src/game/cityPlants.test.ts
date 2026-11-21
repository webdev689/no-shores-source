import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cityPlantings, kindFor } from './cityPlants.ts';
import { castOf } from '../nature/cast.ts';
import { TILE_M } from '../nature/scatter.ts';

test("a city's tree stands as its climate's commonest tree and a bush as its commonest shrub, never grass or rock", () => {
  const kinds = castOf('temperate-coast').kinds;
  assert.equal(kindFor(kinds, 'tree')?.name, 'oak');
  assert.equal(kindFor(kinds, 'bush')?.name, 'gorse');
  assert.equal(kindFor([], 'tree'), null);
});

test("a city's plants are planted in their tiles on their own foot, turned and scaled", () => {
  const foot = [TILE_M * 3 + 10, TILE_M * 5 + 20, 31.5] as const;
  const planted = cityPlantings([{ growth: 'bush', at: foot, turn: 1.2, scale: 0.5 }], 'temperate-coast');
  assert.deepEqual(planted(3, 5), [{ kind: 'gorse', at: [foot[0], foot[1]], z: 31.5, turn: 1.2, scale: 0.5 }]);
  assert.deepEqual(planted(3, 6), []);
});
