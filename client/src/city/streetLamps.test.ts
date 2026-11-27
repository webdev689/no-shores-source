import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BuildingTable, PropTable } from '../models/tables.ts';
import type { RmbBlock } from './blocks.ts';
import { CELL_M, type CityLight, type CityPlan } from './plan.ts';
import {
  BUILDING_CLEAR_M,
  inPiece,
  PLAZA_CLEAR_M,
  PROP_CLEAR_M,
  STREET_APART_M,
  type StandingPiece,
  streetLamps,
} from './streetLamps.ts';

const TILE_M = CELL_M / 16;
/** A block of grass with a street of dirt two tiles wide across its rows 7 and 8, and a lane down its column 3. */
const tiles = Array.from({ length: 256 }, (_slot, tile) =>
  Math.floor(tile / 16) === 7 || Math.floor(tile / 16) === 8 || tile % 16 === 3 ? 1 : 2,
);
const block: RmbBlock = { name: 'TEST', buildings: [], props: [], ground: btoa(String.fromCharCode(...tiles)) };
/** A house of 10 m square standing over the street's north edge, and a well on it. */
const house: StandingPiece = { id: 7, at: [40, 41], yaw: 0 };
const well: StandingPiece = { id: 8, at: [80, 50], yaw: Math.PI / 2 };
const tables = {
  buildings: { 7: { min: [-5, 0, -5], max: [5, 6, 5] } } as unknown as BuildingTable,
  props: { 8: { min: [-1, 0, -1], max: [1, 2, 1] } } as unknown as PropTable,
};

function planWith(
  lights: readonly CityLight[],
  plaza: readonly [number, number, number, number] = [0, 0, 0, 0],
): CityPlan {
  return {
    id: 'overlook',
    name: 'Test',
    motif: 'beacon',
    centre: [CELL_M / 2, CELL_M / 2],
    grid: { west: 0, north: 0 },
    cells: [{ column: 0, row: 0, ground: 'level', level: 12, use: 'block', district: 'market', block: 'TEST' }],
    gates: [],
    harbour: null,
    landmark: [],
    works: [],
    social: { bounds: plaza, level: 0, ring: [], spawns: [], solids: [] },
    pads: [],
    lights,
  };
}

const lampsOf = (lights: readonly CityLight[]) =>
  streetLamps(planWith(lights), new Map([['TEST', block]]), tables, () => [house, well]);

test('a city the plan does not light has no street lamps', () => {
  assert.deepEqual(lampsOf([]), []);
});

test('each lamp stands on a street tile just in from its edge, on the cell level, never in a building, before its door or in a prop', () => {
  const lamps = lampsOf([{ at: [5000, 5000, 0], kind: 'lamp' }]);
  assert.ok(lamps.length >= 6, `${lamps.length} lamps`);
  for (const { at, kind } of lamps) {
    assert.equal(kind, 'lamp');
    assert.equal(at[2], 12);
    const [column, row] = [Math.floor(at[0] / TILE_M), Math.floor(at[1] / TILE_M)];
    assert.equal(tiles[row * 16 + column], 1, `${at} stands on the street`);
    const inTile = [at[0] - column * TILE_M, at[1] - row * TILE_M];
    const toEdge = Math.min(inTile[0], inTile[1], TILE_M - inTile[0], TILE_M - inTile[1]);
    assert.ok(Math.abs(toEdge - 0.6) < 1e-9, `${at} just in from its tile's edge`);
    assert.ok(
      !inPiece(house, tables.buildings[7] as never, [at[0], at[1]], BUILDING_CLEAR_M),
      `${at} clear of the house`,
    );
    assert.ok(!inPiece(well, tables.props[8] as never, [at[0], at[1]], PROP_CLEAR_M), `${at} clear of the well`);
  }
});

test('lamps stand STREET_APART_M apart and as far from the plan’s own lights, the same on every run', () => {
  const planLight: CityLight = { at: [3.2 * TILE_M, 2, 12], kind: 'lamp' };
  const lamps = lampsOf([planLight]);
  const all = [planLight, ...lamps];
  for (const [index, one] of all.entries())
    for (const other of all.slice(index + 1))
      assert.ok(Math.hypot(one.at[0] - other.at[0], one.at[1] - other.at[1]) >= STREET_APART_M);
  assert.deepEqual(lampsOf([planLight]), lamps);
});

test("a turned piece's box is turned with it", () => {
  const turned: StandingPiece = { id: 0, at: [0, 0], yaw: Math.PI / 2 };
  const long = { min: [-10, 0, -1], max: [10, 1, 1] };
  // turned a quarter clockwise, its x runs south
  assert.ok(inPiece(turned, long, [0, 8], 0));
  assert.ok(!inPiece(turned, long, [8, 0], 0));
});

test('no lamp stands under the plaza or by it, where the blocks built beneath its pad are hidden', () => {
  const plaza = [60, 30, 100, 70] as const;
  const far: CityLight = { at: [5000, 5000, 0], kind: 'lamp' };
  const lamps = streetLamps(planWith([far], plaza), new Map([['TEST', block]]), tables, () => [house, well]);
  assert.ok(lamps.length > 0);
  const byPlaza = ([east, south]: readonly number[]) =>
    (east ?? 0) > plaza[0] - PLAZA_CLEAR_M &&
    (east ?? 0) < plaza[2] + PLAZA_CLEAR_M &&
    (south ?? 0) > plaza[1] - PLAZA_CLEAR_M &&
    (south ?? 0) < plaza[3] + PLAZA_CLEAR_M;
  for (const { at } of lamps) assert.ok(!byPlaza(at), `${at} by the plaza`);
  assert.ok(lamps.length < lampsOf([far]).length, 'the lamps there are left out');
});
