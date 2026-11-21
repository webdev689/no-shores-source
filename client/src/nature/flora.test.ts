import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BIOMES, castOf } from './cast.ts';
import {
  decodeMesh,
  FLORA,
  type Flora,
  floraFiles,
  formsOf,
  MESH_VERTEX_BYTES,
  readFlora,
  warmFlora,
} from './flora.ts';
import { coverage, nearShare } from './handover.ts';
import { framesFor } from './impostor.ts';

const FORM = {
  mesh: 'flora/a.mesh',
  triangles: 1,
  layer: 0,
  bark: [0, 0.5, 0.25, 0.25],
  top: 10,
  spread: 4,
  shade: [3, 7],
  leafy: true,
  crown: 8,
  canopy: [0.2, 0.4, 0.1],
  impostor: { layer: 0, top: 0, centre: [0, 0, 6], radius: 7 },
};
const MANIFEST = {
  base: 'https://example.invalid/',
  layer: 1024,
  mips: 6,
  frames: { azimuths: 8, elevations: [0, 25, 50, 75], cell: 0.125 },
  biomes: { woodland: { layers: [{ albedo: 'a.png', normal: 'n.png' }], kinds: { oak: [FORM, FORM] } } },
};

test('the manifest is read whole, and refused whole when a form is broken', () => {
  const flora = readFlora(MANIFEST);
  assert.equal(flora.biomes.woodland?.kinds.oak?.[1]?.impostor?.radius, 7);
  const broken = structuredClone(MANIFEST) as unknown as { biomes: { woodland: { kinds: { oak: unknown[] } } } };
  broken.biomes.woodland.kinds.oak[0] = { ...FORM, bark: [0, 0] };
  assert.throws(() => readFlora(broken), /woodland oak/);
  assert.throws(() => readFlora({ ...MANIFEST, base: 3 }), /no base/);
});

test("a cast's forms come in its order, and only when every kind is baked as many times as it grows", () => {
  const flora = readFlora(MANIFEST) as Flora;
  const cast = { keepAtReach: 1, kinds: [{ ...castOf('woodland').kinds[0], name: 'oak', forms: 2 }] } as never;
  assert.equal(formsOf(cast, 'woodland', flora).length, 2);
  assert.deepEqual(formsOf(cast, 'desert', flora), []);
  const thrice = { keepAtReach: 1, kinds: [{ ...castOf('woodland').kinds[0], name: 'oak', forms: 3 }] } as never;
  assert.deepEqual(formsOf(thrice, 'woodland', flora), []);
});

test('the published manifest bakes every kind of every biome, sprites for every plant drawn far', () => {
  for (const biome of BIOMES) {
    const cast = castOf(biome);
    const forms = formsOf(cast, biome, FLORA);
    assert.equal(
      forms.length,
      cast.kinds.reduce((sum, kind) => sum + kind.forms, 0),
      biome,
    );
    let first = 0;
    for (const kind of cast.kinds) {
      for (const form of forms.slice(first, first + kind.forms)) {
        assert.equal(!!form.impostor, Number.isFinite(kind.nearM), `${biome} ${kind.name} has sprites when drawn far`);
        assert.ok(form.layer < (FLORA.biomes[biome]?.layers.length ?? 0), `${biome} ${kind.name}'s layer exists`);
      }
      first += kind.forms;
    }
  }
});

test('a mesh decodes to its vertices, and a truncated one is refused', () => {
  const count = 3;
  const bytes = new ArrayBuffer(4 + count * MESH_VERTEX_BYTES);
  const view = new DataView(bytes);
  view.setUint32(0, count, true);
  view.setFloat32(4 + MESH_VERTEX_BYTES * 2 + 8, 12.5, true);
  view.setInt8(4 + MESH_VERTEX_BYTES + 15, 127);
  const mesh = decodeMesh(bytes);
  assert.equal(mesh.count, 3);
  assert.equal(new DataView(mesh.vertices).getFloat32(MESH_VERTEX_BYTES * 2 + 8, true), 12.5);
  assert.equal(new DataView(mesh.vertices).getInt8(MESH_VERTEX_BYTES + 15), 127);
  assert.throws(() => decodeMesh(bytes.slice(0, bytes.byteLength - 1)), /cannot hold/);
});

test('a far plant shows the frames either side of the view, weighted by how near each is', () => {
  const elevations = [0, 25, 50, 75];
  // From Blender's x (the game's east), level: the first column alone, the lowest row.
  assert.deepEqual(framesFor([10, 0, 0], 8, elevations), { columns: [0, 1], across: 0, rows: [0, 1], down: 0 });
  // A quarter turn toward Blender's y, which is the game's north (y negative): column two.
  assert.deepEqual(framesFor([0, -10, 0], 8, elevations).columns, [2, 3]);
  // Half way between two columns, and between the second and third rows.
  const between = framesFor(
    [Math.cos(Math.PI / 8), -Math.sin(Math.PI / 8), Math.tan((37.5 * Math.PI) / 180)],
    8,
    [0, 25, 50, 75],
  );
  assert.deepEqual(between.columns, [0, 1]);
  assert.ok(Math.abs(between.across - 0.5) < 1e-9);
  assert.deepEqual(between.rows, [1, 2]);
  assert.ok(Math.abs(between.down - 0.5) < 1e-6);
  // Straight down from above: the highest row alone.
  const above = framesFor([0, 0, 10], 8, elevations);
  assert.deepEqual([above.rows, above.down], [[2, 3], 1]);
  // Just short of a full turn wraps to the last column and the first.
  assert.deepEqual(framesFor([10, 0.01, 0], 8, elevations).columns, [7, 0]);
});

test('near and far split every pixel between them across the band, never both, never neither', () => {
  for (let across = 600; across <= 720; across += 3) {
    const share = nearShare(across, 700, 84);
    for (let x = 0; x < 4; x++) {
      for (let y = 0; y < 4; y++) {
        const near = coverage(share, x, y, 0);
        const far = ~near & 15;
        assert.equal(near & far, 0);
        assert.equal(near | far, 15);
      }
    }
  }
  assert.equal(nearShare(500, 700, 84), 1, 'all near short of the band');
  assert.equal(nearShare(700, 700, 84), 0, 'all far at the range');
  let samples = 0;
  for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) samples += popcount(coverage(0.5, x, y, 0));
  assert.equal(samples, 8, 'half of the samples of two pixels by two at an even share');
});

function popcount(bits: number): number {
  let count = 0;
  for (let sample = 0; sample < 4; sample++) count += (bits >> sample) & 1;
  return count;
}

test("a biome's flora is warmed file by file, every mesh and picture once, a failure leaving the rest", async () => {
  const [biome] = Object.keys(FLORA.biomes);
  assert.ok(biome);
  const files = floraFiles(biome);
  const forms = FLORA.biomes[biome]?.kinds ?? {};
  assert.ok(
    Object.values(forms)
      .flat()
      .every((form) => files.includes(FLORA.base + form.mesh)),
    'every mesh',
  );
  assert.equal(new Set(files).size, files.length, 'each once');
  const read: string[] = [];
  await warmFlora(
    biome,
    (url) => (read.push(url), read.length === 1 ? Promise.reject(new Error('gone')) : Promise.resolve()),
  );
  assert.deepEqual(read, files);
  assert.deepEqual(floraFiles('nowhere'), []);
});
