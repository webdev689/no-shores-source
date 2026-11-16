import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { BuildingTable, PropTable } from '../models/tables.ts';
import { parseBlockFile, type RmbBlock, TILES } from './blocks.ts';
import { buildCity, runs } from './cityBuild.ts';
import { clearedGround, groundPlates, PAVED_TILE, plateSkirts, sideOf } from './cityGround.ts';
import { emptyMesh } from './mesh.ts';
import { CELL_M, type CityPlan, type PlanCell, type Solid } from './plan.ts';

const content = (path: string): string => readFileSync(new URL(`../../../content/${path}`, import.meta.url), 'utf8');

/** A made-up city of five cells a side round (10 000, 20 000): a tavern block, a house block beside it a terrace
 *  lower, an avenue and the landmark's cell, and a quay out on the shore. */
function madePlan(): CityPlan {
  const centre: [number, number] = [10_000, 20_000];
  const west = centre[0] - 2.5 * CELL_M,
    north = centre[1] - 2.5 * CELL_M;
  const cells: PlanCell[] = [
    { column: 2, row: 2, ground: 'level', level: 30, use: 'landmark' },
    { column: 1, row: 2, ground: 'level', level: 30, use: 'avenue' },
    { column: 0, row: 2, ground: 'level', level: 30, use: 'avenue' },
    { column: 2, row: 1, ground: 'level', level: 30, use: 'block', district: 'harbour', block: 'TVRNAL01.RMB' },
    { column: 3, row: 1, ground: 'level', level: 24, use: 'block', district: 'residential', block: 'RESIAA00.RMB' },
    { column: 2, row: 0, ground: 'shore', use: 'open' },
  ];
  const quay: Solid = {
    shape: 'block',
    at: [centre[0], north + 20, -4],
    size: [8, 60, 7],
    turn: Math.PI / 2,
    lean: 0,
    roll: 0,
    material: 'stone',
  };
  const pads = cells.flatMap((cell) =>
    cell.level === undefined
      ? []
      : [
          {
            bounds: [
              west + cell.column * CELL_M,
              north + cell.row * CELL_M,
              west + (cell.column + 1) * CELL_M,
              north + (cell.row + 1) * CELL_M,
            ] as const,
            level: cell.level,
          },
        ],
  );
  return {
    id: 'made',
    name: 'Made',
    motif: 'beacon',
    centre,
    grid: { west, north },
    cells,
    gates: [],
    harbour: [centre[0], north + 10],
    landmark: [
      {
        shape: 'column',
        sides: 12,
        top: 0.8,
        at: [centre[0], centre[1], 30],
        size: [20, 20, 120],
        turn: 0,
        lean: 0,
        roll: 0,
        material: 'stone',
      },
    ],
    works: [quay],
    social: {
      bounds: [centre[0] - 30, centre[1] - 10, centre[0] + 30, centre[1] + 10],
      level: 30,
      ring: [],
      spawns: [],
      solids: [],
    },
    pads,
  };
}

function blocksOf(): Map<string, RmbBlock> {
  const blocks = new Map<string, RmbBlock>();
  for (const file of ['taverns.json', 'homes.json'])
    for (const block of parseBlockFile(content(`world/rmb/${file}`))) blocks.set(block.name, block);
  return blocks;
}

test('nature keeps off the pads and the quay, and grows past them', () => {
  const plan = madePlan();
  const cleared = clearedGround(plan);
  assert.ok(cleared(plan.centre[0] + 10, plan.centre[1] + 10), "the landmark's cell");
  assert.ok(cleared(plan.centre[0] + 25, plan.grid.north + 20), 'on the quay, which runs east and west');
  assert.ok(!cleared(plan.centre[0], plan.grid.north + 40), 'the shore beside the quay');
  assert.ok(!cleared(plan.centre[0] + 2 * CELL_M, plan.centre[1] + 2 * CELL_M), 'past the city');
});

test("each levelled cell gets a plate at its level, its tiles its block's or paving", () => {
  const plan = madePlan();
  const plates = groundPlates(
    plan,
    blocksOf(),
    Array.from({ length: 56 }, (unused, record) => 100 + record),
    7,
  );
  assert.equal(plates.tops.length, 5 * 18);
  assert.equal(plates.width, sideOf(plan) * TILES);
  const tile = (column: number, row: number, k: number): number[] => {
    const slot = ((row * TILES + k) * plates.width + column * TILES + k) * 2;
    return [plates.tiles[slot], plates.tiles[slot + 1]];
  };
  const tavern = parseBlockFile(content('world/rmb/taverns.json')).find((block) => block.name === 'TVRNAL01.RMB');
  assert.ok(tavern);
  assert.ok(tile(2, 1, 3)[0] >= 100, "a block's cell wears its terrain tiles");
  assert.deepEqual(tile(1, 2, 7), [7, PAVED_TILE], "an avenue's middle is paved");
  assert.deepEqual(tile(1, 2, 1), [102, 0], "an avenue's sides are lawns");
});

test("a plate's skirt hangs only on the sides with nothing as high beside it", () => {
  const plan = madePlan();
  const skirts = emptyMesh();
  plateSkirts(plan, 3, { width: 64, height: 128 }, () => skirts);
  // five plates have twenty sides: the six shared at one level hang nothing, nor does the house's under the tavern
  assert.equal(skirts.indices.length / 6, 20 - 6 - 1);
  assert.ok(skirts.layers.every((layer) => layer === 3));
});

test('a made-up city is built: every piece of its blocks placed near, its masses and hulls, its solids', () => {
  const tables = {
    buildings: JSON.parse(content('forged/buildings.json')) as BuildingTable,
    props: JSON.parse(content('forged/props.json')) as PropTable,
  };
  const blocks = blocksOf();
  const data = buildCity(madePlan(), { climate: 'temperate', season: 'summer' }, blocks, tables);
  const pieces = ['TVRNAL01.RMB', 'RESIAA00.RMB'].reduce((sum, name) => {
    const block = blocks.get(name);
    return sum + (block ? block.buildings.length + block.props.length : 0);
  }, 0);
  assert.equal(
    [...data.near.values()].reduce((sum, list) => sum + list.length, 0),
    pieces,
  );
  const hulls = data.chunks.reduce((sum, chunk) => sum + chunk.hulls.count, 0);
  const masses = data.chunks.reduce((sum, chunk) => sum + chunk.masses.count, 0);
  assert.ok(hulls > 0 && masses >= hulls, `${masses} masses, ${hulls} hulls`);
  assert.ok(data.solids.indices.length > 0);
  for (const list of data.near.values())
    for (const instance of list)
      assert.ok(Math.abs(instance.at[0]) < 3 * CELL_M && Math.abs(instance.at[1]) < 3 * CELL_M);
  assert.ok(data.book.pictures.length > 10 && data.book.pictures.length <= 252);
});

test('ranges laid end to end join into one draw', () => {
  assert.deepEqual(
    runs([
      { first: 0, count: 4 },
      { first: 4, count: 2 },
      { first: 9, count: 1 },
      { first: 10, count: 0 },
    ]),
    [
      { first: 0, count: 6 },
      { first: 9, count: 1 },
    ],
  );
});
