import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ForgedModel } from '../models/model.ts';
import { cross, dot, minus } from '../models/vector.ts';
import type { DungeonLayout } from './dungeonLayout.ts';
import { COLOUR, dungeonMesh, IRON, lookOf, ROLE, torchFlame } from './dungeonMesh.ts';

/** A room's cell (room 0, 4 m high) with a corridor (3.2 m) east of it and rock past that, framed between them; the
 *  exit door on the room's west wall; one torch on the corridor's north wall. */
const layout: DungeonLayout = {
  name: 'The Crypt of the Test',
  style: 'crypt',
  pictures: [123, 124],
  looks: [{ style: 'crypt', pictures: [123, 124] }],
  cellLooks: [0, 0, -1],
  cell: 3.2,
  columns: 3,
  rows: 1,
  cells: [0, -1, -2],
  ceilings: [4, 3.2, 0],
  rooms: [
    {
      x: 0,
      y: 0,
      width: 1,
      depth: 1,
      height: 4,
      walk: 0,
      role: 'sepulchre',
      name: 'the Sepulchre',
      ceiling: 'flat',
      look: 0,
    },
  ],
  end: 0,
  wayIn: { cell: 0, side: 2, room: 0 },
  arrival: { x: 0.4, y: 1.6, bearing: Math.PI / 2 },
  exitDoor: { x: 0.02, y: 1.6, width: 1.4, height: 2.4 },
  portal: { x: 1.6, y: 3.18, side: 1, width: 1.4, height: 2.4 },
  torches: [[4.8, 0.35, 2.1, 3]],
  torchReach: 8,
  fixtures: [],
  frames: [[0, 0, 3.2]],
  doorway: { half: 0.9, jambDepth: 0.3, lintel: 2.8 },
  pillars: [],
  pillarHalf: 0.35,
  props: [],
  boxes: [
    [3.2, 0, 3.5, 0.7, 0, 3.2],
    [3.2, 2.5, 3.5, 3.2, 0, 3.2],
  ],
  landmarks: [],
  glows: [],
};

type Corner = readonly [number, number, number];
type Triangle = {
  readonly picture: string;
  readonly corners: Corner[];
  readonly normal: Corner;
  readonly uvs: number[][];
};

function trianglesOf(model: ForgedModel): Triangle[] {
  const point = (vertex: number): Corner => [
    model.positions[vertex * 3] ?? 0,
    model.positions[vertex * 3 + 1] ?? 0,
    model.positions[vertex * 3 + 2] ?? 0,
  ];
  const found: Triangle[] = [];
  for (const part of model.parts)
    for (let index = part.start; index < part.start + part.count; index += 3) {
      const vertices = [0, 1, 2].map((offset) => model.indices[index + offset] ?? 0);
      const first = vertices[0] ?? 0;
      found.push({
        picture: `${part.archive}.${part.record}`,
        corners: vertices.map(point),
        normal: [model.normals[first * 3] ?? 0, model.normals[first * 3 + 1] ?? 0, model.normals[first * 3 + 2] ?? 0],
        uvs: vertices.map((vertex) => [model.uvs[vertex * 2] ?? 0, model.uvs[vertex * 2 + 1] ?? 0]),
      });
    }
  return found;
}

const triangles = trianglesOf(dungeonMesh(layout, [56, 2]));
/** The mesh holds float32s: a point is where it should be to within this. */
const EPS = 1e-5;
const near = (a: number, b: number) => Math.abs(a - b) < EPS;
const where = (picture: string, test: (triangle: Triangle) => boolean) =>
  triangles.filter((triangle) => triangle.picture === picture && test(triangle));

test('every triangle is wound to face its normal, as the city draws its solids', () => {
  for (const { corners, normal } of triangles) {
    const [first, second, third] = corners as [Corner, Corner, Corner];
    assert.ok(dot(cross(minus(second, first), minus(third, first)), normal) > 0);
  }
});

test('each open cell has its floor at 0 m and its ceiling at its own height, rock none', () => {
  const floors = where('123.2', (triangle) => triangle.corners.every(([, , z]) => z === 0));
  assert.equal(floors.length, 4, 'two cells, two triangles each');
  const roomCeiling = where('123.3', (triangle) => triangle.corners.every(([x, , z]) => x <= 3.2 + EPS && near(z, 4)));
  const corridorCeiling = where('123.3', (triangle) =>
    triangle.corners.every(([x, , z]) => x >= 3.2 - EPS && near(z, 3.2)),
  );
  assert.equal(roomCeiling.length + corridorCeiling.length, 4);
  assert.ok(
    triangles.every((triangle) => triangle.corners.every(([x]) => x <= 6.4 + EPS)),
    'nothing in the rock',
  );
});

test('a wall meets rock with trim at its foot (0.4 m) and its head (0.3 m), and a lower ceiling from its height up', () => {
  const corridorEnd = (picture: string) => where(picture, ({ corners }) => corners.every(([x]) => near(x, 6.4)));
  const trims = corridorEnd('123.4').flatMap(({ corners }) => corners.map(([, , z]) => z));
  assert.deepEqual([...new Set(trims.map((z) => z.toFixed(2)))].sort(), ['0.00', '0.40', '2.90', '3.20']);
  const wholeEdge = (corners: Corner[]) => corners.some(([, y]) => near(y, 0)) && corners.some(([, y]) => near(y, 3.2));
  const over = where(
    '123.0',
    ({ corners, normal }) => normal[0] === -1 && wholeEdge(corners) && corners.every(([x]) => near(x, 3.2)),
  );
  const heights = over.flatMap(({ corners }) => corners.map(([, , z]) => z));
  assert.ok(Math.min(...heights) >= 3.2 - EPS, 'the room wall over the corridor stands from 3.2 m');
  assert.ok(near(Math.max(...heights), 4 - 0.3), 'up to its head trim');
});

test("a doorway's jambs are the room's boxes for it, and its lintel spans the gap from 2.8 m", () => {
  const jambs = where('123.0', ({ corners }) => corners.every(([x]) => x >= 3.2 - EPS && x <= 3.5 + EPS));
  const alongY = jambs.flatMap(({ corners }) => corners.map(([, y]) => y));
  assert.ok(
    alongY.every((y) => y <= 0.7 + EPS || y >= 2.5 - EPS),
    'nothing in the opening below the lintel',
  );
  const lintel = where('123.4', ({ corners }) =>
    corners.every(
      ([x, y, z]) => x >= 3.2 - EPS && x <= 3.5 + EPS && y >= 0.7 - EPS && y <= 2.5 + EPS && z >= 2.8 - EPS,
    ),
  );
  assert.ok(lintel.length > 0);
  assert.ok(
    lintel.some(({ normal }) => normal[2] === -1),
    'its underside',
  );
});

test('pictures by role: the second set for a room whose number % 3 is 2, the second wall for an odd one', () => {
  assert.deepEqual(lookOf(layout, -1), { set: 123, wall: ROLE.wall });
  assert.deepEqual(lookOf(layout, 1), { set: 123, wall: ROLE.wallAlt });
  assert.deepEqual(lookOf(layout, 2), { set: 124, wall: ROLE.wall });
  assert.deepEqual(lookOf(layout, 5), { set: 124, wall: ROLE.wallAlt });
});

test('UVs run in world metres, one picture to 3.2 m', () => {
  for (const { corners, uvs } of where('123.2', () => true))
    corners.forEach(([x, y], index) => {
      assert.ok(near(uvs[index]?.[0] ?? -1, x / 3.2) && near(uvs[index]?.[1] ?? -1, y / 3.2));
    });
});

test("a wall's picture stands upright: its top row at the wall's head, running down it", () => {
  const walls = triangles.filter(({ picture, normal }) => picture.startsWith('123.') && Math.abs(normal[2]) < 0.5);
  assert.ok(walls.length > 0);
  for (const { corners, uvs } of walls)
    corners.forEach(([, , z], higher) =>
      corners.forEach(([, , lower], index) => {
        if (z > lower + EPS) assert.ok((uvs[higher]?.[1] ?? 0) < (uvs[index]?.[1] ?? 0), 'higher is nearer the top');
      }),
    );
  const heads = walls.flatMap(({ corners, uvs }) => corners.map(([, , z], index) => [z, uvs[index]?.[1] ?? -1]));
  assert.ok(
    heads.some(([z, down]) => near(z ?? 0, 4) && near(down ?? -1, 0)),
    "the room's walls start their picture at 4 m",
  );
});

test('the exit door wears the door picture once, on its wall facing into the room', () => {
  const door = where('56.2', () => true);
  assert.equal(door.length, 2);
  for (const { corners, normal } of door) {
    assert.deepEqual(
      normal.map((value) => value + 0),
      [1, 0, 0],
    );
    assert.ok(corners.every(([x, , z]) => near(x, 0.02) && z >= 0 && z <= 2.4 + EPS));
  }
});

test('a torch is an iron bracket off its wall, its flame a fire burning out of its cup, not in the mesh', () => {
  const iron = triangles.filter(({ picture }) => picture === `${IRON[0]}.${IRON[1]}`);
  const ironY = iron.flatMap(({ corners }) => corners.map(([, y]) => y));
  assert.ok(near(Math.min(...ironY), 0), 'its plate stands on the wall');
  assert.equal(triangles.filter(({ picture }) => picture === `${COLOUR.glow}.0`).length, 0);
  const flame = torchFlame([4.8, 0.35, 2.1, 3]);
  const cupTop = Math.max(...iron.flatMap(({ corners }) => corners.map(([, , z]) => z)).filter((z) => z < 2.1));
  assert.ok(near(flame.at[2], cupTop) && flame.sizeM > 0.2 && flame.sizeM < 0.4, `${flame.at[2]} ${cupTop}`);
});

test("the return portal is a face on the end room's wall inside an arch of its trim standing off the wall", () => {
  const face = triangles.filter(({ picture }) => picture === `${COLOUR.portal}.0`);
  assert.equal(face.length, 2);
  for (const { corners, normal } of face) {
    assert.deepEqual(
      normal.map((value) => value + 0),
      [0, -1, 0],
      'facing into the room, north of its south wall',
    );
    assert.ok(corners.every(([, y]) => y < 3.18 && y > 3.1));
  }
  const arch = where('123.4', ({ corners }) => corners.every(([, y]) => y >= 3.18 - 0.18 - EPS && y <= 3.18 + EPS));
  const across = arch.flatMap(({ corners }) => corners.map(([x]) => x));
  assert.ok(
    near(Math.min(...across), 1.6 - 0.7 - 0.3) && near(Math.max(...across), 1.6 + 0.7 + 0.3),
    'posts either side',
  );
  const heights = arch.flatMap(({ corners }) => corners.map(([, , z]) => z));
  assert.ok(near(Math.max(...heights), 2.7), 'a lintel over it');
});

test("where its kit pieces stand, the mesh leaves out the pillars, the brackets and the portal's arch", () => {
  const pillared: DungeonLayout = { ...layout, pillars: [[1.6, 1.6, 4]] };
  const kitted = {
    pillars: new Set([0]),
    torches: new Set([0]),
    portal: true,
    floorless: new Set([0]),
    flats: new Map(),
  };
  const plain = trianglesOf(dungeonMesh(pillared, [56, 2]));
  const dressed = trianglesOf(dungeonMesh(pillared, [56, 2], undefined, kitted));
  const pillar = ({ corners }: Triangle) =>
    corners.every(([x, y]) => Math.abs(x - 1.6) < 0.36 && Math.abs(y - 1.6) < 0.36);
  const arch = ({ picture, corners }: Triangle) =>
    picture === '123.4' && corners.every(([, y]) => y >= 3.18 - 0.18 - EPS && y <= 3.18 + EPS);
  const count = (list: Triangle[], picture: string) => list.filter((triangle) => triangle.picture === picture).length;
  assert.ok(plain.some(pillar) && !dressed.some(pillar), 'no code-built pillar');
  assert.ok(plain.some(arch) && !dressed.some(arch), 'no code-built arch');
  assert.equal(count(dressed, `${IRON[0]}.${IRON[1]}`), 0, 'no bracket');
  assert.equal(count(dressed, `${COLOUR.portal}.0`), 2, "the portal's face");
  assert.equal(count(dressed, '56.2'), 2, "the exit door's face");
  const jambs = (list: Triangle[]) =>
    list.filter(
      ({ picture, corners }) => picture === '123.0' && corners.every(([x]) => x >= 3.2 - EPS && x <= 3.5 + EPS),
    );
  assert.equal(jambs(dressed).length, jambs(plain).length, 'the jambs');
  assert.equal(count(dressed, '123.2'), count(plain, '123.2') - 2, "a landmark's cell lays no code-built floor");
});
