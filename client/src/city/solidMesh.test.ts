import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cross, dot, emptyMesh, type MeshData, minus } from './mesh.ts';
import type { Solid, SolidShape } from './plan.ts';
import { rockMesh } from '../rules/rockMesh.ts';
import { meshSolid, SOLID_TEXELS_PER_METRE, solidTurn, stretchedNormal } from './solidMesh.ts';
import type { Grain } from './walkGrain.ts';

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

test('a rock is meshed as a solid, lit flat and wound out of it', () => {
  const solid: Solid = {
    shape: 'overhang',
    seed: 12,
    at: [1000, 2000, 50],
    size: [10, 7, 6],
    turn: 0.4,
    lean: 0,
    roll: 0,
    material: 'rubble',
  };
  const mesh = emptyMesh();
  meshSolid(solid, [1000, 2000], { layer: 3, width: 64, height: 64 }, mesh);
  assert.equal(mesh.indices.length, rockMesh(solid, [10, 7, 6]).triangles.length * 3);
  let volume = 0;
  for (let k = 0; k < mesh.indices.length; k += 3) {
    const [first, second, third] = [0, 1, 2].map((step) => {
      const index = mesh.indices[k + step] * 3;
      return [mesh.positions[index], mesh.positions[index + 1], mesh.positions[index + 2]] as const;
    });
    volume += dot(first, cross(second, third)) / 6;
    // Each vertex's normal leans the way its triangle is wound: lit from outside.
    const normal = mesh.normals.slice(mesh.indices[k] * 3, mesh.indices[k] * 3 + 3) as [number, number, number];
    assert.ok(dot(normal, cross(minus(second, first), minus(third, first))) > -1e-6);
  }
  assert.ok(volume > 0.2 * 10 * 7 * 6, `${volume}`);
  assert.ok(mesh.layers.every((layer) => layer === 3));
});

test('a stretched module keeps its normals square to its stretched surface', () => {
  // A bevel at 45 degrees on a stair pressed down to three quarters of its height leans further from the vertical.
  const [x, y, z] = stretchedNormal([Math.SQRT1_2, 0, Math.SQRT1_2], 0.75);
  assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 1e-9, 'it stays a unit normal');
  assert.ok(Math.abs(z / x - 1 / 0.75) < 1e-9, `its slope is scaled by the stretch's inverse: ${z / x}`);
  // A surface facing straight up or straight out keeps its way.
  assert.deepEqual(stretchedNormal([0, 0, 1], 0.75), [0, 0, 1]);
  assert.deepEqual(stretchedNormal([1, 0, 0], 0.75), [1, 0, 0]);
});

/** Each top corner's place (from the origin) and its UV, of a ground solid meshed on a 64-texel picture, in a walk's
 *  `grain` if it is given one. */
function groundTops(solid: Solid, grain?: Grain): { at: [number, number]; uv: [number, number] }[] {
  const mesh = emptyMesh();
  meshSolid(solid, [1000, 2000], { layer: 3, width: 64, height: 64, grounded: true, grain }, mesh);
  const tops = [];
  for (let k = 0; k < mesh.positions.length / 3; k++)
    if ((mesh.normals[k * 3 + 2] ?? 0) > 0.95)
      tops.push({
        at: [mesh.positions[k * 3] ?? 0, mesh.positions[k * 3 + 1] ?? 0] as [number, number],
        uv: [mesh.uvs[k * 2] ?? 0, mesh.uvs[k * 2 + 1] ?? 0] as [number, number],
      });
  return tops;
}

const groundPiece = (material: Solid['material'], place: [number, number], size: number[], turn: number): Solid => ({
  shape: 'block',
  at: [place[0], place[1], 0],
  size: [size[0], size[1], 0.06],
  turn,
  lean: 0,
  roll: 0,
  material,
});

test("a lawn's top takes its pattern from the world, so its pieces join as one surface however they turn", () => {
  const scale = SOLID_TEXELS_PER_METRE / 64;
  for (const turn of [0, 0.7, 2.1])
    for (const { at, uv } of groundTops(groundPiece('lawn', [1004, 2003], [3, 5], turn))) {
      assert.ok(Math.abs(uv[0] - at[0] * scale) < 1e-9);
      assert.ok(Math.abs(uv[1] - at[1] * scale) < 1e-9);
    }
});

test("a walk's flagstones are laid along it, edge to edge across it, and its pieces join along its way", () => {
  for (const turn of [0, 0.7, 2.1]) {
    // Two pieces of one walk 3.2 m wide, end to end along its way, the second laid the other way along it.
    const along = [-Math.sin(turn), Math.cos(turn)];
    const grain: Grain = { solid: 0, turn, middle: [1004, 2003], width: 3.2 };
    const pieces = [0, 3].map((step) =>
      groundTops(
        groundPiece('path', [1004 + along[0] * step, 2003 + along[1] * step], [3.2, 3], turn + step * (Math.PI / 3)),
        grain,
      ),
    );
    for (const tops of pieces) {
      // Whole pictures across the walk, from one edge to the other: one, as the picture is 2.7 m.
      const across = tops.map(({ uv }) => uv[0]);
      assert.ok(Math.abs(Math.min(...across)) < 1e-9, `${turn}: the picture starts at the walk's edge`);
      assert.ok(Math.abs(Math.max(...across) - 1) < 1e-9, `${turn}: and ends at its other edge`);
    }
    // Where the pieces meet, their corners take the same UV.
    for (const one of pieces[0])
      for (const two of pieces[1])
        if (Math.hypot(one.at[0] - two.at[0], one.at[1] - two.at[1]) < 1e-6)
          assert.ok(Math.hypot(one.uv[0] - two.uv[0], one.uv[1] - two.uv[1]) < 1e-9, `${turn}: they join`);
  }
});

test("a joint's round in its walk's grain carries the walk's flags on, and a piece with no grain takes the world's", () => {
  const turn = 0.7;
  const grain: Grain = { solid: 0, turn, middle: [1004, 2003], width: 3.2 };
  const strip = groundTops(groundPiece('path', [1004, 2003], [3.2, 3], turn), grain);
  // The strip's UVs are a plane over the ground: read it at any place from three of its corners.
  const [first, second, third] = strip;
  const sides = [0, 1].map((axis) => [second.at[axis] - first.at[axis], third.at[axis] - first.at[axis]]);
  const area = sides[0][0] * sides[1][1] - sides[1][0] * sides[0][1];
  const uvAt = ([east, south]: [number, number], part: 0 | 1) => {
    const [eastOfFirst, southOfFirst] = [east - first.at[0], south - first.at[1]];
    const towardSecond = (eastOfFirst * sides[1][1] - southOfFirst * sides[0][1]) / area;
    const towardThird = (sides[0][0] * southOfFirst - sides[1][0] * eastOfFirst) / area;
    return (
      first.uv[part] +
      towardSecond * (second.uv[part] - first.uv[part]) +
      towardThird * (third.uv[part] - first.uv[part])
    );
  };
  const round: Solid = {
    ...groundPiece('path', [1004 + 1.5, 2003 - 0.4], [3.2, 3.2], 0),
    shape: 'column',
    sides: 40,
    top: 1,
  };
  for (const { at, uv } of groundTops(round, grain)) {
    assert.ok(Math.abs(uv[0] - uvAt(at, 0)) < 1e-9 && Math.abs(uv[1] - uvAt(at, 1)) < 1e-9, `the round at ${at}`);
  }
  const scale = SOLID_TEXELS_PER_METRE / 64;
  for (const { at, uv } of groundTops(groundPiece('path', [1004, 2003], [0.4, 2], 1.1)))
    assert.ok(Math.abs(uv[0] - at[0] * scale) < 1e-9 && Math.abs(uv[1] - at[1] * scale) < 1e-9, 'the world grain');
});

test("the crystal's six-sided columns are cut in flat facets, each lit as one; a stone column stays round", () => {
  const facetNormals = (material: Solid['material']): number => {
    const mesh = meshed({ ...solidOf({ shape: 'column', sides: 6, top: 0.8 }, [2, 2, 6]), material });
    const sides = new Set<string>();
    for (let vertex = 0; vertex < mesh.normals.length / 3; vertex++) {
      const normal = mesh.normals.slice(vertex * 3, vertex * 3 + 3);
      if (Math.abs(normal[2]) < 0.99) sides.add(normal.map((part) => part.toFixed(3)).join());
    }
    return sides.size;
  };
  assert.equal(facetNormals('crystal'), 6, 'one normal a facet');
  assert.ok(facetNormals('stone') > 6, 'smooth round its sides');
  // A body's top is under its tip, so it is not meshed; its foot is, as a shard's may stand clear of what it grows on.
  const body = meshed({ ...solidOf({ shape: 'column', sides: 6, top: 0.8 }, [2, 2, 6]), material: 'crystal' });
  const upright = (sign: number) =>
    Array.from({ length: body.normals.length / 3 }, (_unused, vertex) => body.normals[vertex * 3 + 2] * sign > 0.99);
  assert.ok(!upright(1).some(Boolean), 'no cap');
  assert.ok(upright(-1).some(Boolean), 'its foot');
  assert.equal(body.indices.length / 3, 12 + 4, 'six facets of two triangles, a hexagon under them');
});
