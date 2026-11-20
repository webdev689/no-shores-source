import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { startRoomDoor } from '../../../server/roomDoor.ts';
import { FAR_STRIDE, GROUND_FLOATS, groundHeight, groundMesh } from './isleGround.ts';
import { MODULE_NAMES, packUrl, PARTS, readKitPack, roleOf, VERTEX_BYTES } from './isleModules.ts';
import { gridOf, type IslePlacement, readIslePlan } from './islePlan.ts';
import { instancesOf, placedPoint } from './isleView.ts';
import kits from '../../../content/islands/kits.json' with { type: 'json' };

/** The room's module as `npm run wasm` copies it for the page. */
const ROOM = 'client/public/room.wasm';

const PLAN = {
  kind: 'ruin',
  dungeon: 'crypt',
  radius: 180,
  reach: 210,
  landing: 0.1,
  anchorage: [0, 260],
  spawns: [
    [10, 118],
    [12, 118],
  ],
  facing: 3.1,
  door: { at: [-40, -20], facing: 0.5, style: 'crypt' },
  landmark: [[0, -30], 1.2],
  guards: [[5, -10]],
  camp: [20, 80],
  wrecks: [[30, 150, 0.3]],
  ring: [
    [0, 300],
    [300, 0],
  ],
  placements: [[3, 1, 2, 0.5, 0.7, 1.1, 1]],
  blocks: [[0, 0, 1, 1, 4]],
};

test('a plan reads whole, its blocks with it', () => {
  const plan = readIslePlan(JSON.stringify(PLAN));
  assert.equal(plan.kind, 'ruin');
  assert.deepEqual(plan.landmark, [[0, -30], 1.2]);
  assert.deepEqual(plan.placements[0], [3, 1, 2, 0.5, 0.7, 1.1, 1]);
  assert.deepEqual(plan.blocks, [[0, 0, 1, 1, 4]]);
  const older: Record<string, unknown> = { ...PLAN, landmark: null };
  delete older.blocks;
  const cove = readIslePlan(JSON.stringify(older));
  assert.deepEqual(cove.blocks, []);
  assert.equal(readIslePlan(JSON.stringify({ ...PLAN, camp: null })).camp, null);
  assert.equal(plan.landing, 0.1);
});

test('the plan reader refuses bad JSON', () => {
  const bad = (change: Record<string, unknown>) => JSON.stringify({ ...PLAN, ...change });
  for (const text of [
    'not json',
    '[]',
    bad({ kind: 'castle' }),
    bad({ radius: 'big' }),
    bad({ landing: [1, 2] }),
    bad({ camp: [1] }),
    bad({ door: { at: [0, 0], facing: 0 } }),
    bad({ placements: [[1, 2, 3]] }),
    bad({ placements: [[-1, 0, 0, 0, 0, 1, 1]] }),
    bad({ placements: [[1.5, 0, 0, 0, 0, 1, 1]] }),
    bad({ wrecks: [[0, 0]] }),
    bad({ landmark: [0, 0, 0] }),
    bad({ blocks: [[0, 0, 1, 1]] }),
  ])
    assert.throws(() => readIslePlan(text), /an island's plan/, text);
});

test('modules are numbered by their names in byte order, as the isle crate numbers them', () => {
  const kits = JSON.parse(readFileSync('content/islands/kits.json', 'utf8')) as {
    modules: Record<string, { role: string }>;
  };
  const names = Object.keys(kits.modules);
  const bytes = (name: string) => Buffer.from(name, 'utf8');
  const sorted = [...names].sort((a, b) => Buffer.compare(bytes(a), bytes(b)));
  assert.deepEqual(MODULE_NAMES, sorted);
  assert.equal(MODULE_NAMES.length, names.length);
  // The crate's catalog: arid's before common's before frozen's, its modules alphabetical within.
  assert.equal(MODULE_NAMES[0]?.startsWith('arid.'), true);
  sorted.forEach((name, number) => assert.equal(roleOf(number), kits.modules[name]?.role));
  assert.equal(roleOf(sorted.length), undefined);
});

/** A pack in the format the island build writes: the header's length, the header, the vertices, the corners. */
function pack(header: Record<string, unknown>, vertices: number, corners: number[], part = 0): ArrayBuffer {
  const text = new TextEncoder().encode(JSON.stringify(header));
  const bytes = new ArrayBuffer(4 + text.length + vertices * VERTEX_BYTES + corners.length * 4);
  const data = new DataView(bytes);
  data.setUint32(0, text.length, true);
  new Uint8Array(bytes, 4, text.length).set(text);
  const vertexAt = 4 + text.length;
  for (let vertex = 0; vertex < vertices; vertex++) {
    data.setFloat32(vertexAt + vertex * VERTEX_BYTES, vertex, true);
    data.setUint8(vertexAt + vertex * VERTEX_BYTES + 24, part);
  }
  corners.forEach((corner, index) => data.setUint32(vertexAt + vertices * VERTEX_BYTES + index * 4, corner, true));
  return bytes;
}

const HEADER = {
  format: 1,
  style: 'temperate',
  parts: PARTS,
  modules: [
    {
      name: 'temperate.stack',
      vertexStart: 0,
      vertexCount: 3,
      indexStart: 0,
      indexCount: 3,
      bounds: [0, 0, 0, 1, 1, 1],
    },
  ],
};

test('the pack reader reads a kit and refuses what it cannot trust', () => {
  const read = readKitPack(pack(HEADER, 3, [0, 1, 2]));
  assert.equal(read.kit, 'temperate');
  assert.deepEqual(read.modules.get('temperate.stack'), {
    name: 'temperate.stack',
    vertexStart: 0,
    vertexCount: 3,
    indexStart: 0,
    indexCount: 3,
  });
  assert.equal(read.vertices.length, 3 * VERTEX_BYTES);
  assert.deepEqual([...read.indices], [0, 1, 2]);
  const refused: [string, ArrayBuffer][] = [
    ['format', pack({ ...HEADER, format: 2 }, 3, [0, 1, 2])],
    ['parts', pack({ ...HEADER, parts: PARTS.slice(1) }, 3, [0, 1, 2])],
    ['kit', pack({ ...HEADER, style: 'lunar' }, 3, [0, 1, 2])],
    ['module of another kit', pack({ ...HEADER, style: 'arid' }, 3, [0, 1, 2])],
    ['corner', pack(HEADER, 3, [0, 1, 3])],
    ['part', pack(HEADER, 3, [0, 1, 2], PARTS.length)],
    ['length', pack(HEADER, 4, [0, 1, 2])],
    ['short', new ArrayBuffer(2)],
  ];
  for (const [what, bytes] of refused) assert.throws(() => readKitPack(bytes), Error, what);
});

test('a pack is read from the dev prefix, else the manifest, else nowhere', () => {
  const manifest = { base: 'https://packs/', kits: { temperate: 'islands/temperate-1.modules' } };
  assert.equal(packUrl('temperate', manifest, null), 'https://packs/islands/temperate-1.modules');
  assert.equal(packUrl('temperate', manifest, '/isle-packs/'), '/isle-packs/temperate.modules');
  assert.equal(packUrl('arid', manifest, null), null);
  assert.equal(packUrl('arid', null, null), null);
});

/** A build's folder of packs (tools/islands/build.py's --out), as tools/islands/test_envelope.py reads it. */
const BUILT = process.env.ISLAND_MODULES;

test("a build's packs read, every kit's", { skip: !BUILT && "set ISLAND_MODULES to a build's --out folder" }, () => {
  for (const kit of ['temperate', 'arid', 'tropical', 'frozen', 'common']) {
    const bytes = readFileSync(`${BUILT}/${kit}.modules`);
    const read = readKitPack(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
    assert.equal(read.kit, kit);
    assert.ok(read.modules.size > 0);
  }
});

/** A 3 × 3 grid 2 m apart, one corner with no height. */
const FLOATS = new Float64Array([-3, -3, 2, 3, 3, 1, 2, 3, 4, 5, 6, 7, 8, NaN]);

test("the ground mesh's vertices stand at the heights given, at their cells' middles", () => {
  const grid = gridOf(FLOATS);
  const mesh = groundMesh(grid);
  assert.equal(mesh.vertices.length, 9 * GROUND_FLOATS);
  for (let index = 0; index < 9; index++) {
    const [x, y, z] = mesh.vertices.subarray(index * GROUND_FLOATS, index * GROUND_FLOATS + 3);
    assert.equal(x, -2 + (index % 3) * 2);
    assert.equal(y, -2 + Math.floor(index / 3) * 2);
    if (index === 8) assert.ok(Number.isNaN(z));
    else assert.equal(z, FLOATS[5 + index]);
  }
  // Three of the four squares have heights at every corner.
  assert.equal(mesh.indices.length, 3 * 6);
  assert.ok(![...mesh.indices].includes(8));
  assert.equal(groundHeight(grid, -2, -2), 1);
  assert.equal(groundHeight(grid, -1, -2), 1.5);
  assert.equal(groundHeight(grid, 1, 1), null);
  // A corner with no height is left out and the others weighed again, as movement::Heights does.
  assert.ok(Math.abs((groundHeight(grid, 0.5, 0.5) ?? 0) - 5.8) < 1e-9);
  assert.equal(groundHeight(grid, -9, 0), null);
  assert.throws(() => gridOf(FLOATS.subarray(0, 12)));
});

test('the far mesh takes every fourth height', () => {
  const columns = 9;
  const floats = new Float64Array(5 + columns * columns).map((_zero, index) => index - 5);
  floats.set([0, 0, 2, columns, columns]);
  const far = groundMesh(gridOf(floats), FAR_STRIDE);
  assert.equal(far.vertices.length, 9 * GROUND_FLOATS);
  assert.equal(far.vertices[GROUND_FLOATS + 2], 4);
  assert.equal(far.vertices[GROUND_FLOATS], 9);
  assert.equal(far.indices.length, 4 * 6);
  // A grid whose last sample is off the stride keeps its edge: ten columns give four, the last on column nine.
  const ten = new Float64Array(5 + 10 * 10).fill(1);
  ten.set([0, 0, 2, 10, 10]);
  const edged = groundMesh(gridOf(ten), FAR_STRIDE);
  assert.equal(edged.vertices.length, 16 * GROUND_FLOATS);
  assert.equal(edged.vertices[3 * GROUND_FLOATS], 19);
});

test(
  "a placement's turned point lands where the room stands each of its solids as a block",
  { skip: !existsSync(ROOM) },
  () => {
    // The room module's own blocks (isle::dressing::blocks), one a solid, in its placements' order.
    const door = startRoomDoor(new WebAssembly.Module(readFileSync(ROOM)));
    const plan = readIslePlan(door.islePlan('2', 'rainforest'));
    const contract = kits.modules as Readonly<Record<string, { readonly size: number[]; readonly solids: number[][] }>>;
    const blocks = [...plan.blocks];
    let checked = 0;
    for (const placement of plan.placements) {
      const module = contract[MODULE_NAMES[placement[0]] ?? ''];
      for (const [solidX = 0, solidY = 0] of module?.solids ?? []) {
        const [west = 0, north = 0, east = 0, south = 0, top = 0] = blocks.shift() ?? [];
        const [x, y, z] = placedPoint([solidX, solidY, module?.size[2] ?? 0], placement);
        assert.ok(Math.abs(x - (west + east) / 2) < 1e-6 && Math.abs(y - (north + south) / 2) < 1e-6, 'its middle');
        assert.ok(Math.abs(z - top) < 1e-6, 'its top');
        checked++;
      }
    }
    assert.equal(blocks.length, 0);
    assert.ok(checked > 50, `${checked} solids`);
    // A quarter turn takes the module's front, north, to the east.
    const [east, south] = placedPoint([0, -1, 0], [0, 0, 0, 0, Math.PI / 2, 1, 1]);
    assert.ok(Math.abs(east - 1) < 1e-12 && Math.abs(south) < 1e-12);
  },
);

test('instances sort by module, a run each, the trees and cliffs marked for the middle distance', () => {
  const tree = MODULE_NAMES.indexOf('temperate.tree.a');
  const shore = MODULE_NAMES.indexOf('temperate.shore.rock.a');
  const placements: IslePlacement[] = [
    [tree, 0, 0, 0, 0, 1, 1],
    [shore, 1, 0, 0, Math.PI, 1, 1],
    [tree, 2, 0, 0, 0, 1, 1],
  ];
  const { floats, runs } = instancesOf(placements);
  assert.deepEqual(
    runs.map((run) => [run.name, run.first, run.count, run.middle]),
    [
      ['temperate.shore.rock.a', 0, 1, false],
      ['temperate.tree.a', 1, 2, true],
    ],
  );
  assert.equal(floats.length, 3 * 8);
  assert.ok(Math.abs((floats[5] ?? 0) + 1) < 1e-6);
});

test("the room module's own plans and ground read, every module named", { skip: !existsSync(ROOM) }, () => {
  const door = startRoomDoor(new WebAssembly.Module(readFileSync(ROOM)));
  for (const [seed, climate] of [
    ['43', 'rainforest'],
    ['2', 'desert'],
    ['1', 'tundra'],
  ] as const) {
    const plan = readIslePlan(door.islePlan(seed, climate));
    assert.ok(plan.placements.length > 0);
    assert.ok(plan.placements.every(([module]) => MODULE_NAMES[module] !== undefined));
    const grid = gridOf(door.isleHeights(seed, climate, [0, 0]));
    assert.equal(grid.cell, 2);
    assert.ok(groundMesh(grid).indices.length > 0);
  }
});
