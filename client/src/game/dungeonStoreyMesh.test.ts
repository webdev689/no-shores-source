// A dungeon of two storeys as the mesh draws it: each storey at its own floor, the flight's treads on the slope the
// rules walk under its sloped ceiling, a hall rising through open air to the storey over it behind a balustrade, and
// nothing drawn in the rock between the storeys.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ForgedModel } from '../models/model.ts';
import { ceilingHeights } from './dungeonCeilings.ts';
import { flightFrame, flightSlope, TREADS } from './dungeonFlights.ts';
import { BALUSTRADE } from './dungeonJoins.ts';
import type { DungeonLayout } from './dungeonLayout.ts';
import { dungeonMesh, lookOf, ROLE } from './dungeonMesh.ts';
import { storeyPlanes } from './dungeonStoreyPlanes.ts';

const room = (x: number, y: number, width: number, depth: number, storey: number) => ({
  x,
  y,
  width,
  depth,
  height: 4,
  walk: 0,
  role: 'hall',
  name: `room ${storey}`,
  ceiling: 'flat' as const,
  look: 0,
  storey,
});

/** Seven columns by three rows on two storeys. Storey 0: room 0 in the two west columns, open air at (0, 2) over the
 *  hall below, the flight east along row 1 from its landing (1, 1). Storey 1: the hall, room 2, at (0, 1), (0, 2) and
 *  (1, 2); room 1 down the east column, the flight's foot landing at (6, 1), the portal on its east wall. */
const [ROCK, FLIGHT, AIR] = [-2, -3, -4];
const cells = [
  ...[
    0,
    0,
    ROCK,
    ROCK,
    ROCK,
    ROCK,
    ROCK,
    0,
    0,
    FLIGHT,
    FLIGHT,
    FLIGHT,
    FLIGHT,
    ROCK,
    AIR,
    0,
    ROCK,
    ROCK,
    ROCK,
    ROCK,
    ROCK,
  ],
  ...[
    ROCK,
    ROCK,
    ROCK,
    ROCK,
    ROCK,
    ROCK,
    1,
    2,
    ROCK,
    FLIGHT,
    FLIGHT,
    FLIGHT,
    FLIGHT,
    1,
    2,
    2,
    ROCK,
    ROCK,
    ROCK,
    ROCK,
    1,
  ],
];
export const STOREYED: DungeonLayout = {
  name: 'The Halls of the Test',
  style: 'halls',
  pictures: [123, 124],
  looks: [{ style: 'halls', pictures: [123, 124] }],
  cellLooks: cells.map((kind) => (kind === ROCK ? -1 : 0)),
  cell: 3.2,
  columns: 7,
  rows: 3,
  storeys: 2,
  storeyM: 8,
  floors: [0, -8],
  stairs: [{ upper: 0, cells: [9, 10, 11, 12], top: 8, bottom: 13 }],
  cells,
  ceilings: cells.map((kind) => (kind === ROCK ? 0 : kind === FLIGHT ? 3.2 : 4)),
  rooms: [room(0, 0, 2, 3, 0), room(6, 0, 1, 3, 1), room(0, 1, 2, 2, 1)],
  end: 1,
  wayIn: { cell: 0, side: 3, room: 0 },
  arrival: { x: 1.6, y: 1.6, z: 0, bearing: 0 },
  exitDoor: { x: 1.6, y: 0.02, z: 0, width: 1.4, height: 2.4 },
  portal: { x: 22.38, y: 4.8, z: -8, side: 0, width: 1.4, height: 2.4 },
  torches: [
    [1.6, 0.35, 2.1, 3],
    [20.8, 0.35, -5.9, 3],
  ],
  torchReach: 8,
  fixtures: [[1, 1, 1.2, 0]],
  frames: [],
  doorway: { half: 0.9, jambDepth: 0.3, lintel: 2.8 },
  pillars: [],
  pillarHalf: 0.35,
  props: [[5, 1.6, 8, -8, 0]],
  boxes: [[3, 6, 3.5, 6.4, -8, -7]],
  landmarks: [],
  glows: [],
};

type Triangle = { readonly picture: string; readonly corners: number[][]; readonly normal: number[] };

function trianglesOf(model: ForgedModel): Triangle[] {
  const found: Triangle[] = [];
  for (const part of model.parts)
    for (let index = part.start; index < part.start + part.count; index += 3) {
      const vertices = [0, 1, 2].map((offset) => model.indices[index + offset] ?? 0);
      const read = (vertex: number, from: Float32Array) => [0, 1, 2].map((axis) => from[vertex * 3 + axis] ?? 0);
      found.push({
        picture: `${part.archive}.${part.record}`,
        corners: vertices.map((vertex) => read(vertex, model.positions)),
        normal: read(vertices[0] ?? 0, model.normals),
      });
    }
  return found;
}

const triangles = trianglesOf(dungeonMesh(STOREYED, [56, 2]));
const look = lookOf(STOREYED, 0);
const picture = (role: number) => `${look.set}.${role}`;
const middleOf = ({ corners }: Triangle) =>
  [0, 1, 2].map((axis) => corners.reduce((sum, corner) => sum + (corner[axis] ?? 0), 0) / 3);
/** The triangles whose middle lies inside a cell's column (x, y in cells), strictly. */
const inColumn = (column: number, row: number) =>
  triangles.filter((each) => {
    const [x = 0, y = 0] = middleOf(each);
    return (
      x > column * 3.2 + 1e-3 && x < (column + 1) * 3.2 - 1e-3 && y > row * 3.2 + 1e-3 && y < (row + 1) * 3.2 - 1e-3
    );
  });
const flat = (each: Triangle, z: number, up: number) =>
  Math.abs((each.normal[2] ?? 0) - up) < 1e-6 && each.corners.every((corner) => Math.abs((corner[2] ?? 0) - z) < 1e-4);

test('each storey keeps its own things, z from its floor', () => {
  const [top, lower] = storeyPlanes(STOREYED);
  assert.deepEqual([top?.torches, lower?.torches, lower?.props, top?.exit, lower?.portal], [[0], [1], [0], true, true]);
  assert.ok(Math.abs((lower?.layout.torches[0]?.[2] ?? 0) - 2.1) < 1e-9);
  assert.deepEqual(lower?.layout.boxes, [[3, 6, 3.5, 6.4, 0, 1]]);
  assert.equal(lower?.layout.props[0]?.[3], 0);
  assert.deepEqual(top?.layout.fixtures, [[1, 1, 1.2, 0]]);
  assert.equal(lower?.layout.fixtures.length, 0);
  assert.equal(lower?.layout.cells.length, 21);
});

test("each storey's floor lies at its own height, and a hall under open air keeps its floor and no ceiling", () => {
  assert.ok(inColumn(0, 0).some((each) => flat(each, 0, 1) && each.picture === picture(ROLE.floor)));
  assert.ok(inColumn(6, 0).some((each) => flat(each, -8, 1)));
  assert.ok(!inColumn(6, 0).some((each) => flat(each, 0, 1)), 'nothing on storey 0 over room 1');
  assert.ok(
    inColumn(0, 2).some((each) => flat(each, -8, 1)),
    "the hall's floor",
  );
  assert.ok(!inColumn(0, 2).some((each) => flat(each, 0, 1)), 'no floor in open air');
  assert.ok(!inColumn(0, 2).some((each) => flat(each, -4, -1)), 'no ceiling over the hall under it');
  assert.ok(
    inColumn(0, 2).some((each) => flat(each, 4, -1)),
    "the open air's ceiling",
  );
  assert.ok(
    inColumn(1, 2).some((each) => flat(each, -4, -1)),
    "the hall's ceiling beside it",
  );
});

test('nothing is drawn in rock, nor between two storeys where rock meets rock', () => {
  assert.deepEqual(inColumn(3, 0), []);
  assert.deepEqual(inColumn(4, 2), []);
});

test('a flight has 40 treads, each on the slope at its middle, and its ceiling 3.2 m over the slope', () => {
  const frame = flightFrame(STOREYED, STOREYED.stairs![0]!);
  const treads = triangles.filter(
    (each) =>
      each.picture === picture(ROLE.floor) &&
      (each.normal[2] ?? 0) > 0.99 &&
      (middleOf(each)[1] ?? 0) > 3.2 &&
      (middleOf(each)[1] ?? 0) < 6.4 &&
      (middleOf(each)[0] ?? 0) > 6.4 &&
      (middleOf(each)[0] ?? 0) < 19.2,
  );
  assert.equal(treads.length, TREADS * 2);
  for (const tread of treads) {
    const [x = 0, , z = 0] = middleOf(tread);
    const along = x - frame.head[0];
    assert.ok(Math.abs(z - flightSlope(frame, along)) <= 0.1 + 1e-6, `tread at ${along} m stands ${z}`);
  }
  const ceiling = triangles.filter(
    (each) =>
      each.picture === picture(ROLE.ceiling) &&
      (each.normal[2] ?? 0) < -0.5 &&
      (middleOf(each)[0] ?? 0) > 6.4 &&
      (middleOf(each)[0] ?? 0) < 19.2,
  );
  assert.equal(ceiling.length, 8);
  for (const each of ceiling)
    for (const [x = 0, , z = 0] of each.corners)
      assert.ok(Math.abs(z - flightSlope(frame, x - frame.head[0]) - 3.2) < 1e-4);
  const risers = triangles.filter((each) => {
    const [eastings, southings, heights] = [0, 1, 2].map((axis) => each.corners.map((corner) => corner[axis] ?? 0));
    return (
      each.picture === picture(ROLE.trim) &&
      Math.max(...eastings!) - Math.min(...eastings!) < 1e-6 &&
      Math.abs(Math.min(...southings!) - 3.2) < 1e-4 &&
      Math.abs(Math.max(...southings!) - 6.4) < 1e-4 &&
      Math.max(...heights!) - Math.min(...heights!) <= 0.2 + 1e-6 &&
      (each.normal[0] ?? 0) > 0.99
    );
  });
  assert.equal(risers.length, (TREADS + 1) * 2);
});

test("the hall's walls rise through the open air, and a balustrade closes the gallery's edge", () => {
  const west = triangles.filter(
    (each) =>
      (each.normal[0] ?? 0) > 0.99 &&
      each.corners.every((corner) => Math.abs(corner[0] ?? 0) < 1e-4) &&
      (middleOf(each)[1] ?? 0) > 6.4,
  );
  const heights = west.flatMap((each) => each.corners.map((corner) => corner[2] ?? 0));
  assert.deepEqual([Math.min(...heights), Math.max(...heights)], [-8, 4]);
  const rail = inColumn(1, 2).filter((each) => each.picture === picture(ROLE.trim));
  const railHeights = rail.flatMap((each) => each.corners.map((corner) => corner[2] ?? 0));
  assert.ok(rail.length > 0);
  assert.deepEqual([Math.min(...railHeights), Math.max(...railHeights)], [0, BALUSTRADE.height]);
  const slabEdge = triangles.filter(
    (each) =>
      (each.normal[0] ?? 0) < -0.99 &&
      each.corners.every((corner) => Math.abs((corner[0] ?? 0) - 3.2) < 1e-4 && (corner[2] ?? 0) <= 0) &&
      (middleOf(each)[1] ?? 0) > 6.4,
  );
  const edgeHeights = slabEdge.flatMap((each) => each.corners.map((corner) => corner[2] ?? 0));
  assert.deepEqual([Math.min(...edgeHeights), Math.max(...edgeHeights)], [-4, 0], "the gallery's floor's edge");
});

test("a vault or a dome under a storey keeps its top 0.4 m under that storey's floor", () => {
  const domed = (number: number) => ({
    ...STOREYED,
    ceilings: STOREYED.cells.map((kind, cell) => (kind === number ? 5.6 : (STOREYED.ceilings[cell] ?? 0))),
    rooms: STOREYED.rooms.map((each, index) =>
      index === number ? { ...each, width: 4, depth: 4, height: 5.6, ceiling: 'dome' as const } : each,
    ),
  });
  const lower = ceilingHeights(domed(2))(21 + 7);
  assert.ok(Math.abs(lower(6.4, 9.6) - 5.6 - 2) < 1e-9, 'a 5.6 m room rises 2 m at most');
  const upper = ceilingHeights(domed(0))(0);
  assert.ok(Math.abs(upper(6.4, 6.4) - 5.6 - 2.2) < 1e-9, 'nothing over the top storey keeps it lower');
});
