import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cross, dot, emptyMesh, type MeshData, minus } from './mesh.ts';
import type { Solid, SolidShape } from './plan.ts';
import { meshSolid, SOLID_TEXELS_PER_METRE, solidTurn } from './solidMesh.ts';

const SURFACE = { layer: 7, width: 64, height: 128 };

function solidOf(shape: SolidShape, size: [number, number, number], turn = 0, lean = 0, roll = 0): Solid {
  return { ...shape, at: [1000, 2000, 50], size, turn, lean, roll, material: 'stone' };
}

function meshed(solid: Solid): MeshData {
  const mesh = emptyMesh();
  meshSolid(solid, [1000, 2000], SURFACE, mesh);
  return mesh;
}

const corner = (mesh: MeshData, index: number): [number, number, number] => [
  mesh.positions[index * 3],
  mesh.positions[index * 3 + 1],
  mesh.positions[index * 3 + 2],
];

/** The sum of every triangle's area along its winding (zero for a closed surface), and the volume it encloses
 *  (positive when every triangle is wound out of the solid). */
function enclosure(mesh: MeshData): { area: [number, number, number]; volume: number } {
  const area: [number, number, number] = [0, 0, 0];
  let volume = 0;
  for (let k = 0; k < mesh.indices.length; k += 3) {
    const [first, second, third] = [0, 1, 2].map((step) => corner(mesh, mesh.indices[k + step]));
    const turn = cross(minus(second, first), minus(third, first));
    for (let axis = 0; axis < 3; axis++) area[axis] += turn[axis] / 2;
    volume += dot(first, cross(second, third)) / 6;
  }
  return { area, volume };
}

function bounds(mesh: MeshData): { low: number[]; high: number[] } {
  const low = [Infinity, Infinity, Infinity],
    high = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < mesh.positions.length; k += 3)
    for (let axis = 0; axis < 3; axis++) {
      low[axis] = Math.min(low[axis], mesh.positions[k + axis]);
      high[axis] = Math.max(high[axis], mesh.positions[k + axis]);
    }
  return { low, high };
}

const SHAPES: readonly [string, SolidShape, number][] = [
  ['a block', { shape: 'block' }, 10 * 6 * 4],
  ['a column', { shape: 'column', sides: 24, top: 0.6 }, NaN],
  ['a cone', { shape: 'column', sides: 12, top: 0 }, NaN],
  ['a dome', { shape: 'dome', sides: 24 }, NaN],
  ['a frustum', { shape: 'pyramid', top: 0.5 }, (4 * (10 * 6 + 5 * 3 + Math.sqrt(10 * 6 * 5 * 3))) / 3],
  ['a pyramid', { shape: 'pyramid', top: 0 }, (10 * 6 * 4) / 3],
  ['a gable', { shape: 'gable' }, (10 * 4 * 6) / 2],
  ['an arch', { shape: 'arch', opening: 0.7 }, NaN],
];

for (const [name, shape, volume] of SHAPES) {
  test(`${name} is closed, wound outward and as big as its size`, () => {
    const mesh = meshed(solidOf(shape, [10, 6, 4]));
    const enclosed = enclosure(mesh);
    for (const axis of enclosed.area) assert.ok(Math.abs(axis) < 1e-6, `open: ${enclosed.area.join(', ')}`);
    assert.ok(enclosed.volume > 0, `wound inward: ${enclosed.volume}`);
    if (!Number.isNaN(volume)) assert.ok(Math.abs(enclosed.volume - volume) < 1e-6, `${enclosed.volume} vs ${volume}`);
    const { low, high } = bounds(mesh);
    assert.ok(Math.abs(high[0] - low[0] - 10) < 1e-6 && Math.abs(high[1] - low[1] - 6) < 0.2, `${low} ${high}`);
    assert.ok(Math.abs(low[2] - 50) < 1e-9 && Math.abs(high[2] - 54) < 1e-6, `${low} ${high}`);
  });
}

test('an arch leaves its opening clear and its spandrels whole', () => {
  const mesh = meshed(solidOf({ shape: 'arch', opening: 0.7 }, [10, 6, 10]));
  const enclosed = enclosure(mesh);
  const opening = 8 * (7 - 4) + (Math.PI * 4 * 4) / 2;
  assert.ok(Math.abs(enclosed.volume - (10 * 10 - opening) * 6) < 2.5, `${enclosed.volume}`);
});

test('a turned solid lays its own y along the turn: a quarter turn back points it east', () => {
  const along = solidTurn({ turn: -Math.PI / 2, lean: 0, roll: 0 }, [0, 1, 0]);
  assert.ok(Math.abs(along[0] - 1) < 1e-12 && Math.abs(along[1]) < 1e-12);
  const across = solidTurn({ turn: Math.PI / 2, lean: 0, roll: 0 }, [1, 0, 0]);
  assert.ok(Math.abs(across[1] - 1) < 1e-12, 'a quarter turn clockwise takes east to south');
});

test('a leaning solid tips its top toward its own +y, as far as its lean', () => {
  const lean = (5 * Math.PI) / 180;
  const top = solidTurn({ turn: 0, lean, roll: 0 }, [0, 0, 100]);
  assert.ok(Math.abs(top[1] - 100 * Math.sin(lean)) < 1e-9 && Math.abs(top[2] - 100 * Math.cos(lean)) < 1e-9);
  const mesh = meshed(solidOf({ shape: 'block' }, [10, 6, 40], 0, lean));
  assert.ok(enclosure(mesh).volume > 0);
});

test('a solid wears its picture coarser than a forged model, at twenty-four texels a metre', () => {
  const mesh = meshed(solidOf({ shape: 'block' }, [3.2, 3.2, (2 * 128) / 24]));
  const downs = mesh.uvs.filter((unused, k) => k % 2 === 1);
  assert.equal(SOLID_TEXELS_PER_METRE, 24);
  assert.ok(Math.abs(Math.min(...downs) + 2) < 1e-9, 'a wall of 256 texels spans two 128-texel pictures');
  assert.ok(mesh.layers.every((layer) => layer === 7));
});
