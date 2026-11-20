import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MATERIALS } from '../city/pictures.ts';
import { meshBuilder } from '../models/model.ts';
import { CLIMATES, climateArchive, DRESSING_ARCHIVE } from '../textures/climate.ts';
import { DUNGEON_LAYERS, smallBook } from './dungeonBook.ts';
import { SIDE_STEPS } from './dungeonLayout.ts';
import { COLOUR, IRON, ROLE } from './dungeonMesh.ts';
import {
  layModule,
  loadStylePack,
  type ModuleMesh,
  PARTS,
  partPicture,
  type Place,
  readModulePack,
  turnAbout,
  wallTurns,
} from './dungeonModules.ts';
import { packOf, type Vertex, type Written } from './dungeonPacks.test.ts';

/** A door's slab facing +y, two triangles of stone; and a wall's foot, one triangle of iron facing +y. */
const DOOR: Written = {
  name: 'crypt.door.a',
  vertices: [
    [-1, 0.25, 0, 0, 1, 0, 0],
    [1, 0.25, 0, 0, 1, 0, 0],
    [1, 0.25, 2.5, 0, 1, 0, 0],
    [-1, 0.25, 2.5, 0, 1, 0, 0],
  ],
  indices: [0, 1, 2, 0, 2, 3],
};
const FOOT: Written = {
  name: 'crypt.wall.base',
  vertices: [
    [0, 0.5, 0, 0, 1, 0, 6],
    [0.5, 0.5, 0, 0, 1, 0, 6],
    [0, 0.5, 0.75, 0, 1, 0, 6],
  ],
  indices: [0, 1, 2],
};

const near = (actual: readonly number[], expected: readonly number[], message?: string) =>
  assert.ok(
    actual.length === expected.length && actual.every((value, index) => Math.abs(value - expected[index]) < 1e-5),
    `${message ?? ''} ${actual.join()} is not ${expected.join()}`,
  );

/** A one-triangle module of the corners given, its normals all `normal`, every vertex stone, each UV its x and z in
 *  metres as a wall facing y is unwrapped. */
function triangle(corners: readonly (readonly [number, number, number])[], normal = [0, 1, 0]): ModuleMesh {
  return {
    name: 'test.triangle',
    positions: Float32Array.from(corners.flat()),
    normals: Float32Array.from(corners.flatMap(() => normal)),
    uvs: Float32Array.from(corners.flatMap((corner) => [corner[0], corner[2]])),
    parts: new Uint8Array(corners.length),
    indices: Uint32Array.from(corners.keys()),
    bounds: [0, 0, 0, 0, 0, 0],
  };
}

/** The laid model's corners, normals and UVs, in the order the module's corners are laid. */
function laid(module: ModuleMesh, place: Place) {
  const mesh = meshBuilder();
  layModule(mesh, module, place, () => [1, 0]);
  const model = mesh.model();
  const listed = (values: Float32Array, size: number) =>
    Array.from({ length: values.length / size }, (_unused, index) =>
      Array.from(values.slice(index * size, index * size + size)),
    );
  return { model, points: listed(model.positions, 3), normals: listed(model.normals, 3), uvs: listed(model.uvs, 2) };
}

test('a pack round-trips: each module its vertices, normals, UVs, parts, corners from its own first vertex, and bounds', () => {
  const pack = readModulePack(packOf([DOOR, FOOT]));
  assert.equal(pack.style, 'crypt');
  assert.deepEqual([...pack.modules.keys()], ['crypt.door.a', 'crypt.wall.base']);
  const foot = pack.modules.get('crypt.wall.base');
  assert.ok(foot);
  near(
    Array.from(foot.positions),
    FOOT.vertices.flatMap((vertex) => vertex.slice(0, 3)),
  );
  near(
    Array.from(foot.normals),
    FOOT.vertices.flatMap((vertex) => vertex.slice(3, 6)),
  );
  near(
    Array.from(foot.uvs),
    FOOT.vertices.flatMap((vertex) => [vertex[0], vertex[2]]),
  );
  assert.deepEqual(Array.from(foot.parts), [6, 6, 6]);
  assert.deepEqual(Array.from(foot.indices), [0, 1, 2]);
  assert.deepEqual(foot.bounds, [0, 0.5, 0, 0.5, 0.5, 0.75]);
  assert.deepEqual(Array.from(pack.modules.get('crypt.door.a')?.indices ?? []), DOOR.indices);
});

test("a pack whose parts are not the kits' own, in their order, is refused", () => {
  assert.throws(() => readModulePack(packOf([FOOT], { parts: [...PARTS].reverse() })), /parts/);
  assert.throws(() => readModulePack(packOf([FOOT], { parts: PARTS.slice(1) })), /parts/);
  assert.throws(() => readModulePack(packOf([FOOT], { format: 2 })), /format/);
  assert.throws(() => readModulePack(packOf([FOOT], { style: 'barrows' })), /style/);
});

test("a corner outside its own module, a part past the kits' parts or a wrong length is refused", () => {
  assert.throws(() => readModulePack(packOf([{ ...FOOT, indices: [0, 1, 3] }])), /names no vertex/);
  // The second module's corners counted from the pack's first vertex, not its own.
  assert.throws(() => readModulePack(packOf([DOOR, { ...FOOT, indices: [4, 5, 6] }])), /names no vertex/);
  const outside: Vertex = [0, 0, 0, 0, 0, 1, PARTS.length];
  assert.throws(() => readModulePack(packOf([{ ...FOOT, vertices: [...FOOT.vertices.slice(0, 2), outside] }])), /part/);
  assert.throws(() => readModulePack(packOf([FOOT], {}, 1)), /bytes/);
  assert.throws(() => readModulePack(packOf([FOOT]).slice(0, -1)), /bytes/);
  assert.throws(() => readModulePack(packOf([{ ...FOOT, indices: [0, 1] }])), /three corners/);
  assert.throws(() => readModulePack(packOf([FOOT, FOOT])), /twice/);
  assert.throws(() => readModulePack(new ArrayBuffer(2)), /header/);
});

test('a quarter turn takes north to east, and a piece made for a north wall faces out of the wall it stands on', () => {
  near(turnAbout([0, -1, 0.5], 1), [1, 0, 0.5]);
  near(turnAbout([2, 1, 0], 2), [-2, -1, 0]);
  near(turnAbout(turnAbout([2, 1, 0], 3), 1), [2, 1, 0]);
  SIDE_STEPS.forEach(([east, south], side) =>
    near(turnAbout([0, 1, 0], wallTurns(side)), [-east, -south, 0], `the wall on side ${side}`),
  );
  // Laid on the east wall of a cell, a wall piece's face looks west, into it.
  const { points, normals } = laid(triangle(FOOT.vertices.map((vertex) => [vertex[0], vertex[1], vertex[2]])), {
    origin: [10, 20, 0],
    turns: wallTurns(0),
  });
  near(points[1], [9.5, 20.5, 0]);
  near(normals[0], [-1, 0, 0]);
});

test("a landmark is turned within its footprint as the rule says, the turned footprint's north-west corner at origin", () => {
  const [width, depth] = [6.4, 3.2];
  const local: [number, number, number] = [1, 0.5, 0.2];
  const origin = [10, 20, 0] as const;
  const rule = [
    [local[0], local[1]],
    [depth - local[1], local[0]],
    [width - local[0], depth - local[1]],
    [local[1], width - local[0]],
  ];
  ([0, 1, 2, 3] as const).forEach((turns) => {
    const module = triangle([local, [0, 0, 0], [width, depth, 0]], [0, 0, 1]);
    const { points } = laid(module, { origin, turns, footprint: [width, depth] });
    near(points[0], [origin[0] + rule[turns][0], origin[1] + rule[turns][1], 0.2], `turned ${turns}`);
    const [low, high] = [points[1], points[2]].sort((a, b) => a[0] + a[1] - b[0] - b[1]);
    const [across, along] = turns % 2 ? [depth, width] : [width, depth];
    near([Math.min(low[0], high[0]), Math.min(low[1], high[1])], [origin[0], origin[1]], `corner at ${turns}`);
    near([Math.abs(high[0] - low[0]), Math.abs(high[1] - low[1])], [across, along], `size at ${turns}`);
  });
});

test('a stretched unit shaft spans from its foot to its head, and what stands past either end stays as far past it', () => {
  const shaft = triangle(
    [
      [0.3, 0, 0],
      [0.3, 0.2, 1],
      [0.3, 0, 1.1],
    ],
    [1, 0, 0],
  );
  const { points } = laid(shaft, { origin: [5, 6, 0], turns: 0, stretch: { from: 0.6, to: 2.4 } });
  near(points[0], [5.3, 6, 0.6]);
  near(points[1], [5.3, 6.2, 2.4]);
  near(points[2], [5.3, 6, 2.5]);
  const sunk = triangle([
    [0, 0, -0.05],
    [1, 0, 0.5],
    [0, 0, 0.5],
  ]);
  near(laid(sunk, { origin: [0, 0, 0], turns: 0, stretch: { from: 1, to: 3 } }).points[0], [0, 0, 0.95]);
});

test("each corner keeps its piece's UV in pictures, v down, and its own normal, turned with the piece", () => {
  // Wound so its corners' turn points -y, while its normals say +y: it is laid facing +y, then turned to face west.
  const { normals, uvs } = laid(triangle(FOOT.vertices.map((vertex) => [vertex[0], vertex[1], vertex[2]])), {
    origin: [3, 4, 0.5],
    turns: 1,
  });
  normals.forEach((normal) => near(normal, [-1, 0, 0]));
  near(uvs[0], [0, 0]);
  near(uvs[1], [0.5 / 3.2, 0]);
  near(uvs[2], [0, -0.75 / 3.2]);
  // A curve's corners keep their own normals, not the face's.
  const bent = triangle([
    [0, 0, 0],
    [1, 0, 0],
    [0, 0, 1],
  ]);
  bent.normals.set([0.6, 0.8, 0, 0, 1, 0, -0.6, 0.8, 0]);
  const curved = laid(bent, { origin: [0, 0, 0], turns: 0 });
  near(curved.normals[0], [0.6, 0.8, 0]);
  near(curved.normals[2], [-0.6, 0.8, 0]);
});

test('a rope, a cloth, bones, carving and brass take finer pictures, so they come out their own size', () => {
  const rope = triangle([
    [0, 0, 0],
    [0.4, 0, 0],
    [0, 0, 0.4],
  ]);
  rope.parts.fill(PARTS.indexOf('rope'));
  const { uvs } = laid(rope, { origin: [0, 0, 0], turns: 0 });
  near(uvs[1], [1, 0]);
  near(uvs[2], [0, -1]);
});

test("a stretched corner's v moves with its height, so its picture keeps its scale", () => {
  const shaft = triangle([
    [0, 0, 0],
    [1, 0, 0],
    [0, 0, 1],
  ]);
  const { points, uvs } = laid(shaft, { origin: [0, 0, 0], turns: 0, stretch: { from: 0.5, to: 3.5 } });
  near(points[2], [0, 0, 3.5]);
  near(uvs[0], [0, -0.5 / 3.2]);
  near(uvs[2], [0, -3.5 / 3.2]);
});

test('every part wears a picture: the look for its stone, the timber, the iron, the dressing set, or a colour', () => {
  const look = { set: 123, wall: ROLE.wallAlt };
  for (const climate of CLIMATES) {
    const pictures = new Map(PARTS.map((name, part) => [name, partPicture(part, look, climate)]));
    for (const [name, picture] of pictures) assert.equal(picture.length, 2, name);
    assert.deepEqual(pictures.get('stone'), [123, ROLE.wallAlt]);
    assert.deepEqual(pictures.get('floor'), [123, ROLE.floor]);
    assert.deepEqual(pictures.get('trim'), [123, ROLE.trim]);
    assert.deepEqual(pictures.get('wood'), MATERIALS[climate].timber.slice(0, 2));
    assert.deepEqual(pictures.get('iron'), IRON);
    assert.deepEqual(pictures.get('water'), [COLOUR.water, 0]);
    assert.deepEqual(pictures.get('wax'), [COLOUR.wax, 0]);
    // The dressing set, which the book turns to the climate as the painter numbers it.
    const dressing = ['bone', 'relief', 'cloth', 'rope', 'ore', 'brass'].map((name) => pictures.get(name));
    assert.deepEqual(
      dressing,
      dressing.map((_unused, record) => [DRESSING_ARCHIVE, record]),
    );
    const painted = { desert: 1021, mountain: 1121, temperate: 1321, swamp: 1421 }[climate];
    assert.equal(climateArchive(DRESSING_ARCHIVE, 0, climate, 'summer'), painted);
  }
  assert.throws(() => partPicture(PARTS.length, look, 'temperate'), /no picture/);
  const book = smallBook({ climate: 'temperate', season: 'summer' }, []);
  assert.equal(book.layerOf(...partPicture(PARTS.indexOf('water'), look, 'temperate')), DUNGEON_LAYERS.water);
});

test('a pack that fails to come gives none, with one warning however often it is asked for', async (context) => {
  const asked: string[] = [];
  context.mock.method(globalThis, 'fetch', (url: string) => {
    asked.push(url);
    return Promise.reject(new Error('offline'));
  });
  const warn = context.mock.method(console, 'warn', () => undefined);
  const published = { base: 'https://packs.test/', styles: { halls: 'dungeon/gone.modules' } };
  assert.equal(await loadStylePack('halls', published), null);
  assert.equal(await loadStylePack('halls', published), null);
  assert.deepEqual(asked, ['https://packs.test/dungeon/gone.modules']);
  assert.equal(warn.mock.callCount(), 1);
  assert.equal(await loadStylePack('crypt', published), null, 'a style with no pack published');
  assert.equal(asked.length, 1);
  assert.equal(warn.mock.callCount(), 1);
});

test("a pack that comes is read and kept; one that holds another style's pieces is refused", async (context) => {
  const bytes = packOf([DOOR, FOOT]);
  context.mock.method(globalThis, 'fetch', () => Promise.resolve(new Response(bytes)));
  const warn = context.mock.method(console, 'warn', () => undefined);
  const published = { base: 'https://packs.test/', styles: { crypt: 'dungeon/a.modules', mines: 'dungeon/b.modules' } };
  const pack = await loadStylePack('crypt', published);
  assert.deepEqual([...(pack?.modules.keys() ?? [])], ['crypt.door.a', 'crypt.wall.base']);
  assert.equal(await loadStylePack('crypt', published), pack);
  assert.equal(await loadStylePack('mines', published), null);
  assert.equal(warn.mock.callCount(), 1);
});
