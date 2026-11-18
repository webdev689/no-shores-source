import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LayoutMarks } from '../terrain/layoutMarks.ts';
import { layoutsWanted } from './layoutCity.ts';

const square = (id: string, west: number): LayoutMarks => ({
  id,
  kind: 'patrol',
  name: id,
  ring: [
    [west, 0],
    [west + 1000, 0],
    [west + 1000, 1000],
    [west, 1000],
  ],
  areas: [],
  paths: [],
  sites: [],
});

const MARKS = [square('downs', 0), square('mill', 20_000)];

test('the layouts within reach of the camera are wanted by name', () => {
  assert.deepEqual(layoutsWanted(null, 'one', MARKS, [500, 500]), ['downs']);
  assert.deepEqual(layoutsWanted(null, 'one', MARKS, [10_000, 500]), []);
});

test('what was gathered serves until the camera moves on to other layouts', () => {
  const gathered = { id: 'one', marks: MARKS, at: [500, 500] as const, names: 'downs' };
  assert.equal(layoutsWanted(gathered, 'one', MARKS, [1500, 500]), null);
  assert.equal(layoutsWanted(gathered, 'one', MARKS, [3000, 500]), null);
  assert.deepEqual(layoutsWanted(gathered, 'one', MARKS, [17_000, 500]), ['mill']);
});

test('layouts planned again, or another landmass, are gathered again where the camera stands', () => {
  const gathered = { id: 'one', marks: MARKS, at: [500, 500] as const, names: 'downs' };
  assert.deepEqual(layoutsWanted(gathered, 'one', [...MARKS], [500, 500]), ['downs']);
  assert.deepEqual(layoutsWanted(gathered, 'two', MARKS, [500, 500]), ['downs']);
});
