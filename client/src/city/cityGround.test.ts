import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { BuildingTable, PropTable } from '../models/tables.ts';
import { parseBlockFile, type RmbBlock, TILES } from './blocks.ts';
import { buildCity, detailRuns, retaining, runs } from './cityBuild.ts';
import { clearedGround, groundPlates, PAVED_TILE, plateSkirts, sideOf } from './cityGround.ts';
import { MASS_FLOATS, MASS_RUIN } from './cityMasses.ts';
import { emptyMesh } from './mesh.ts';
import { PICTURE_LAYERS } from './pictures.ts';
import { FORMATIONS } from './overtaken.ts';
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

test('a plan of placed pieces alone has no plates and a one-texel tile map', () => {
  const plan = madePlan();
  const pieces = plan.cells.map((cell): PlanCell => ({ ...cell, use: 'pieces' }));
  const plates = groundPlates({ ...plan, cells: pieces }, blocksOf(), [100], 7);
  assert.equal(plates.tops.length, 0);
  assert.equal(plates.width, 1);
  assert.equal(plates.tiles.length, 2);
});

test("an avenue on the grid's west edge runs no road off it, whatever stands at the east end of the row above", () => {
  const plan = madePlan();
  const east: PlanCell = { column: 4, row: 1, ground: 'level', level: 24, use: 'landmark' };
  const plates = groundPlates(
    { ...plan, cells: [...plan.cells, east] },
    blocksOf(),
    Array.from({ length: 56 }, (unused, record) => 100 + record),
    7,
  );
  const slot = (2 * TILES + TILES / 2) * plates.width * 2;
  assert.deepEqual([plates.tiles[slot], plates.tiles[slot + 1]], [102, 0], "the west edge of the road's row is lawn");
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
  assert.ok(data.book.pictures.length > 10 && data.book.pictures.length <= PICTURE_LAYERS);
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

test("a terrace's retaining wall is told from the landmark's platform and the harbour's works", () => {
  const wall = (size: [number, number, number], material: Solid['material'] = 'stone'): Solid => ({
    shape: 'block',
    at: [0, 0, 0],
    size,
    turn: 0,
    lean: 0,
    roll: 0,
    material,
  });
  assert.ok(retaining(wall([CELL_M, 1.2, 9])));
  assert.ok(retaining(wall([1.2, CELL_M, 4])));
  assert.ok(!retaining(wall([CELL_M, 1.2, 52])), 'the platform under the plaza');
  assert.ok(!retaining(wall([10, 180, 7], 'timber')), 'a pier');
  assert.ok(!retaining(wall([6, 29, 18])), 'a length of the city wall');
});

/** FNV-1a over what a city's drawing holds: its masses and hulls, its solids' corners and every near model's place. */
function drawingFingerprint(data: ReturnType<typeof buildCity>): string {
  const near = [...data.near.entries()].flatMap(([cell, list]) =>
    list.flatMap((each) => [cell, each.model, ...each.at]),
  );
  const bytes = [
    new Uint8Array(data.masses),
    new Uint8Array(new Float32Array(data.solids.positions).buffer),
    new Uint8Array(new Float32Array(near).buffer),
  ];
  let hash = 0x811c9dc5;
  for (const each of bytes) for (const byte of each) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  return hash.toString(16);
}

const TABLES = {
  buildings: JSON.parse(content('forged/buildings.json')) as BuildingTable,
  props: JSON.parse(content('forged/props.json')) as PropTable,
};
const TEMPERATE = { climate: 'temperate', season: 'summer' } as const;

test("a port city's drawing is as it was before ruins were laid", () => {
  const port = buildCity({ ...madePlan(), ruined: false, wrecks: [] }, TEMPERATE, blocksOf(), TABLES);
  assert.equal(drawingFingerprint(port), '1c90ebf6');
  assert.ok(!port.ruined && [...port.near.values()].flat().every((each) => each.cut === 0));
});

test('a ruin breaks every building the same every time: some fallen to heaps, the rest roofless and lower', () => {
  const port = buildCity(madePlan(), TEMPERATE, blocksOf(), TABLES);
  const ruin = buildCity({ ...madePlan(), ruined: true }, TEMPERATE, blocksOf(), TABLES);
  assert.ok(ruin.ruined);
  assert.equal(
    drawingFingerprint(ruin),
    drawingFingerprint(buildCity({ ...madePlan(), ruined: true }, TEMPERATE, blocksOf(), TABLES)),
  );
  // the forged models it stands, not the crystal's formations laid after them
  const forged = ruin.models.entries.length - FORMATIONS.length;
  const near = [...ruin.near.values()].flat().filter((each) => each.model < forged);
  const broken = near.filter((each) => each.cut > 0);
  assert.ok(broken.length > 0, 'its standing buildings are broken off');
  assert.ok(near.length < [...port.near.values()].flat().length, 'a fallen building stands no model');
  // A fallen building's heap is among the solids; every mass is lower and flat-topped, and marked a ruin's.
  assert.ok(ruin.solids.indices.length > port.solids.indices.length, 'the heaps are meshed');
  const tops = (data: typeof ruin): number => {
    const [floats, whole] = [new Float32Array(data.masses), new Uint32Array(data.masses)];
    let highest = -Infinity;
    for (let k = 0; k < floats.length / MASS_FLOATS; k++) {
      highest = Math.max(highest, floats[k * MASS_FLOATS + 6] + floats[k * MASS_FLOATS + 7]);
      if (data === ruin) {
        assert.equal(floats[k * MASS_FLOATS + 7], 0, 'roofless');
        assert.ok(whole[k * MASS_FLOATS + 11] & MASS_RUIN);
      }
    }
    return highest;
  };
  assert.ok(tops(ruin) < tops(port), `${tops(ruin)} under ${tops(port)}`);
});

/** The crystal's vertices in a drawing's solids, from the city's middle, inside some ranges of its indices. */
function crystalCorners(data: ReturnType<typeof buildCity>, ranges: readonly { first: number; count: number }[]) {
  const crystal = data.book.materials.crystal;
  const corners: [number, number, number][] = [];
  for (const { first, count } of ranges)
    for (let k = first; k < first + count; k++) {
      const vertex = data.solids.indices[k];
      if (data.solids.layers[vertex] !== crystal) continue;
      const place = data.solids.positions.slice(vertex * 3, vertex * 3 + 3);
      corners.push([place[0], place[1], place[2]]);
    }
  return corners;
}

test("a ruin's buildings are overtaken by the crystal, its great spires drawn far and its small crystal near", () => {
  const port = buildCity({ ...madePlan(), ruined: false, wrecks: [] }, TEMPERATE, blocksOf(), TABLES);
  const ruin = buildCity({ ...madePlan(), ruined: true }, TEMPERATE, blocksOf(), TABLES);
  const everything = (data: typeof ruin) => data.chunks.flatMap((chunk) => [chunk.solids, chunk.detail]);
  /** The near instances of the crystal's formations, laid after the forged models. */
  const formations = (data: typeof ruin) => {
    const first = data.models.entries.length - FORMATIONS.length;
    return [...data.near.values()].flat().filter((each) => each.model >= first);
  };
  assert.equal(crystalCorners(port, everything(port)).length, 0, 'a port city is untouched');
  assert.equal(formations(port).length + port.lamps.length, 0);
  // Nothing the page lays stands in the plaza's window (the made plan's plaza, 110 m round).
  const [west, north, east, south] = madePlan().social.bounds.map((bound, k) => bound - madePlan().centre[k % 2]);
  const outside = ([x, y]: readonly number[]) => x < west - 110 || x > east + 110 || y < north - 110 || y > south + 110;
  for (const corner of crystalCorners(ruin, everything(ruin))) assert.ok(outside(corner), `${corner} in the window`);
  for (const each of formations(ruin)) assert.ok(outside(each.at), `${each.at} in the window`);
  // With its plaza far off, every building of the made city is overtaken as its seed says; a shard of the crate's
  // crust on its rubble is small, drawn near.
  const plan = madePlan();
  const crust: Solid = {
    ...plan.landmark[0],
    shape: 'column',
    sides: 6,
    top: 0,
    size: [0.3, 0.3, 1],
    material: 'crystal',
  };
  const away = {
    ...plan,
    ruined: true,
    works: [...plan.works, { ...crust, at: [plan.centre[0] + 150, plan.centre[1], 30] as const }],
    social: { ...plan.social, bounds: [0, 0, 10, 10] as const },
  };
  const overtaken = buildCity(away, TEMPERATE, blocksOf(), TABLES);
  const great = crystalCorners(
    overtaken,
    overtaken.chunks.map((chunk) => chunk.solids),
  );
  const detail = crystalCorners(
    overtaken,
    overtaken.chunks.map((chunk) => chunk.detail),
  );
  assert.ok(great.length > 0 && detail.length > 0, `${great.length} great, ${detail.length} detail`);
  assert.ok(formations(overtaken).length > 3 * 17, `${formations(overtaken).length} formations`);
  assert.ok(overtaken.lamps.length > 0, 'its great spires light the night');
  // Far off a chunk draws its great spires only; near, its small crystal too.
  const chunk = overtaken.chunks.find((each) => each.detail.count > 0);
  assert.ok(chunk);
  assert.equal(detailRuns([chunk], [chunk.middlesLow[0], chunk.middlesLow[1], 50]).length, 1);
  assert.equal(detailRuns([chunk], [chunk.middlesLow[0] + 5000, chunk.middlesLow[1], 50]).length, 0);
});
