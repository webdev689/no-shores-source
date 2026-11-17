import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildingMasses } from '../models/buildingPlan.ts';
import { buildingModel } from '../models/buildings.ts';
import type { BuildingTable } from '../models/tables.ts';
import {
  blockFiles,
  groundTiles,
  parseBlockFile,
  placed,
  type RmbBlock,
  TILE_M,
  TILES,
  toWorld,
  turnedToWorld,
} from './blocks.ts';

const content = (path: string): string => readFileSync(new URL(`../../../content/${path}`, import.meta.url), 'utf8');
const buildings = JSON.parse(content('forged/buildings.json')) as BuildingTable;
const taverns = parseBlockFile(content('world/rmb/taverns.json'));
const known = new Map<number, ReturnType<typeof buildingMasses>>();
const massesOf = (id: number) => known.get(id) ?? known.set(id, buildingMasses(buildings, id)).get(id) ?? [];

test('a model turned a quarter clockwise points its forward east and its right south', () => {
  const place = placed([1000, 2000], 50, [0, 10, 20, 1, 90]);
  const forward = toWorld(place, [0, 0, 1]);
  const right = toWorld(place, [1, 0, 0]);
  assert.ok(Math.abs(forward[0] - 1011) < 1e-9 && Math.abs(forward[1] - 2020) < 1e-9, `${forward}`);
  assert.ok(Math.abs(right[0] - 1010) < 1e-9 && Math.abs(right[1] - 2021) < 1e-9, `${right}`);
  assert.equal(toWorld(place, [0, 3, 0])[2], 54, 'up from the cell level and the placement');
});

test("an unturned model faces north, the way a block's rows count against", () => {
  const north = turnedToWorld(0, [0, 0, 1]);
  assert.ok(Math.abs(north[0]) < 1e-12 && north[1] === -1 && north[2] === 0);
});

test("a block's ground decodes to records, quarter turns and flips read as half turns, markers as grass", () => {
  const bytes = new Uint8Array(256);
  bytes.set([1, 1 | 64, 3 | 128, 7 | 64 | 128, 60]);
  const block: RmbBlock = { name: 'MADE.RMB', buildings: [], props: [], ground: btoa(String.fromCharCode(...bytes)) };
  const tiles = groundTiles(block);
  assert.equal(tiles.length, TILES * TILES);
  assert.deepEqual(tiles.slice(0, 5), [
    { record: 1, turns: 0 },
    { record: 1, turns: 1 },
    { record: 3, turns: 2 },
    { record: 7, turns: 3 },
    { record: 2, turns: 0 },
  ]);
});

test('the files a plan needs are named from the index', () => {
  const index = JSON.stringify({
    blocks: [
      ['TVRNAL01.RMB', 'taverns.json'],
      ['RESIAA00.RMB', 'homes.json'],
    ],
  });
  assert.deepEqual(blockFiles(index, ['RESIAA00.RMB', 'TVRNAL01.RMB', 'NONE.RMB']), ['homes.json', 'taverns.json']);
});

/** Each ground-floor door of a block, placed: whether two metres out from it is a dirt or edge tile, and clear of
 *  every building of the block. */
function doorsOf(block: RmbBlock): { onDirt: boolean; clear: boolean }[] {
  const tiles = groundTiles(block);
  const places = block.buildings.map((row) => ({ row, place: placed([0, 0], 0, row) }));
  const doors: { onDirt: boolean; clear: boolean }[] = [];
  for (const { row, place } of places)
    for (const door of buildingModel(buildings, row[0])?.doors ?? []) {
      const [first, , opposite] = door.corners;
      if (Math.min(first[1], opposite[1]) > 0.5) continue;
      const middle = toWorld(
        place,
        [0, 1, 2].map((axis) => (first[axis] + opposite[axis]) / 2) as [number, number, number],
      );
      const out = turnedToWorld(place.yaw, door.normal);
      const [x, y] = [middle[0] + out[0] * 2, middle[1] + out[1] * 2];
      const [column, tileRow] = [Math.floor(x / TILE_M), Math.floor(y / TILE_M)];
      if (column < 0 || tileRow < 0 || column >= TILES || tileRow >= TILES) continue;
      const record = tiles[tileRow * TILES + column].record;
      const clear = places.every(({ row: other, place: there }) => {
        const [east, south] = [x - there.east, y - there.south];
        const [cosine, sine] = [Math.cos(there.yaw), Math.sin(there.yaw)];
        const [along, ahead] = [east * cosine + south * sine, east * sine - south * cosine];
        return !massesOf(other[0]).some(
          (mass) =>
            mass.eaves - mass.base > 1.5 &&
            along > mass.west &&
            along < mass.east &&
            ahead > mass.south &&
            ahead < mass.north,
        );
      });
      doors.push({ onDirt: record === 1 || record >= 4, clear });
    }
  return doors;
}

test('every ground-floor door of TVRNAL01 opens onto its street, dirt or a dirt edge, clear of every building', () => {
  const block = taverns.find((each) => each.name === 'TVRNAL01.RMB');
  assert.ok(block);
  const doors = doorsOf(block);
  assert.ok(doors.length >= 15, `${doors.length} doors`);
  assert.ok(
    doors.every((door) => door.onDirt && door.clear),
    JSON.stringify(doors),
  );
});

test('across the tavern blocks nine doors in ten open onto dirt, as the RMB note says', () => {
  const doors = taverns.flatMap(doorsOf);
  const onDirt = doors.filter((door) => door.onDirt).length;
  assert.ok(onDirt / doors.length >= 0.9, `${onDirt} of ${doors.length}`);
  assert.ok(doors.filter((door) => door.clear).length / doors.length > 0.99);
});
