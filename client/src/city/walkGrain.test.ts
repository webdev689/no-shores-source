import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyMesh } from './mesh.ts';
import type { Solid } from './plan.ts';
import { meshSolid } from './solidMesh.ts';
import { type Grain, grainsOf } from './walkGrain.ts';

const slab = (material: Solid['material'], east: number): Solid => ({
  shape: 'block',
  at: [east, 0, 0],
  size: [4, 4, 0.05],
  turn: 0.3,
  lean: 0,
  roll: 0,
  material,
});

test('each solid with a grain is found by its place in the list, and a grain past the list is passed over', () => {
  const solids = [slab('paving', 0), slab('stone', 5), slab('paving', 10)];
  const grain = (solid: number): Grain => ({ solid, turn: 0.3, middle: [0, 0], width: 8 });
  const found = grainsOf({ solids, grains: [grain(0), grain(2), grain(7)] });
  assert.deepEqual([...found.keys()], [solids[0], solids[2]]);
  assert.equal(found.get(solids[2])?.solid, 2);
  assert.equal(grainsOf({ solids }).size, 0);
});

test('two paving slabs in one grain carry one pattern across their seam; without it each starts its own', () => {
  const tops = (solid: Solid, grain?: Grain) => {
    const mesh = emptyMesh();
    meshSolid(solid, [0, 0], { layer: 2, width: 64, height: 64, grain }, mesh);
    const corners = new Map<string, [number, number]>();
    for (let vertex = 0; vertex < mesh.positions.length / 3; vertex++)
      if ((mesh.normals[vertex * 3 + 2] ?? 0) > 0.95) {
        const place = [mesh.positions[vertex * 3] ?? 0, mesh.positions[vertex * 3 + 1] ?? 0].map((part) =>
          part.toFixed(4),
        );
        corners.set(place.join(), [mesh.uvs[vertex * 2] ?? 0, mesh.uvs[vertex * 2 + 1] ?? 0]);
      }
    return corners;
  };
  // Two slabs side by side along their own x, so two corners of each meet.
  const [cosine, sine] = [Math.cos(0.3), Math.sin(0.3)];
  const second: Solid = { ...slab('paving', 0), at: [4 * cosine, 4 * sine, 0] };
  const shared = (grain?: Grain) => {
    const [one, two] = [tops(slab('paving', 0), grain), tops(second, grain)];
    return [...one]
      .filter(([place]) => two.has(place))
      .map(([place, pattern]) => [pattern, two.get(place) ?? [Number.NaN, Number.NaN]]);
  };
  const grain: Grain = { solid: 0, turn: 0.3, middle: [1, 1], width: 8 };
  const seam = shared(grain);
  assert.equal(seam.length, 2, 'two corners meet');
  for (const [one, two] of seam) assert.ok(Math.hypot(one[0] - two[0], one[1] - two[1]) < 1e-9, 'one pattern');
  assert.ok(
    shared().some(([one, two]) => Math.hypot(one[0] - two[0], one[1] - two[1]) > 0.1),
    'each its own',
  );
});
