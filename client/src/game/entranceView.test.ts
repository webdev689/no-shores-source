import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countingGpu } from '../gpuForTests.ts';
import { ShadowMap } from '../shadow.ts';
import { skyUniformFor } from '../sky/skyUniform.ts';
import type { Shot } from './camera.ts';
import { MATERIALS } from '../city/pictures.ts';
import type { PropTable } from '../models/tables.ts';
import type { StyleKey } from './dungeonLayout.ts';
import { doorOf } from './entrances.ts';
import { EntranceView, entrancesModel } from './entranceView.ts';

/** A pass that keeps the group last set at each index, and what was set when each draw was asked for. */
function recordingPass() {
  const groups = new Map<number, unknown>();
  const draws: Map<number, unknown>[] = [];
  const pass = {
    setPipeline() {},
    setBindGroup: (index: number, group: unknown) => void groups.set(index, group),
    setVertexBuffer() {},
    setIndexBuffer() {},
    drawIndexed: () => void draws.push(new Map(groups)),
  };
  return { pass: pass as unknown as GPURenderPassEncoder, groups, draws };
}

const SHOT = { eye: [0, 0, 40] } as unknown as Shot;

test('the entrances bind every group their pipeline reads, the sky among them, whatever was drawn before', () => {
  const { gpu } = countingGpu();
  const view = new EntranceView(gpu);
  view.set([{ x: 100, y: 200, ground: 0, yaw: 0, model: 0 }], {}, { climate: 'temperate', season: 'summer' });
  const shadow = ShadowMap.none(gpu);
  // The terrain draws just before them with groups of its own pipeline's ('auto') layout at 2 and 3, which the
  // models' pipeline, laid out by hand, cannot read.
  const { pass, groups, draws } = recordingPass();
  groups.set(2, 'the terrain’s gap');
  groups.set(3, 'the terrain’s sky');
  view.drawInto(pass, new Float32Array(16), SHOT, 0, shadow);
  const sky = recordingPass();
  skyUniformFor(gpu.device).bindShared(sky.pass, [2]);
  assert.equal(draws.length, 1);
  const drawn = draws[0] ?? new Map();
  for (const index of [0, 1]) assert.ok(drawn.get(index), `group ${index}`);
  assert.equal(drawn.get(2), sky.groups.get(2), 'the empty group of the sky’s layout');
  assert.equal(drawn.get(3), sky.groups.get(3), 'the sky’s own group');
});

/** Entrance model 0 (42000) with its door as the forged props measure it (`entrances.test.ts`). */
const MOUND = {
  42000: {
    min: [-2.2, -2.5, -1.7],
    max: [2.2, 2.9, 2.3],
    looks: [],
    doors: [
      { type: 2, a: [-0.634, 0.045, -1.692], b: [-0.634, -2.205, -1.692], c: [0.616, -2.205, -1.692], n: [0, 0, -1] },
    ],
  },
} as unknown as PropTable;

test("each style's facade stands round its entrance's door in its own stone, and leaves the doorway clear", () => {
  const entrance = { x: 100, y: 200, ground: 0, yaw: 0, model: 0 };
  const door = doorOf(entrance, MOUND);
  assert.ok(door);
  const climate = { climate: 'temperate', season: 'summer' } as const;
  const bare = entrancesModel([entrance], MOUND, [100, 200]);
  const styles: StyleKey[] = ['crypt', 'halls', 'cells', 'sanctum', 'caverns', 'mines', 'chalk', 'barrow'];
  for (const style of styles) {
    const look = { style, pictures: [37, 38] as const };
    const model = entrancesModel([entrance], MOUND, [100, 200], () => look, climate);
    assert.ok(model.indices.length > bare.indices.length, `${style}: a facade is laid`);
    // The mines' adit is all timber and iron; every other in its style's stone.
    const wears = style === 'mines' ? MATERIALS.temperate.timber[0] : 37;
    assert.ok(
      model.parts.some((part) => part.archive === wears),
      `${style}: in its own stone or timber`,
    );
    // Each facade triangle, sampled across its face, stays out of the doorway: within the door's width (less a
    // hand), from its sill to under its lintel, from the door out a body's stride.
    const [outX, outY] = door.out;
    const point = (vertex: number) => [0, 1, 2].map((axis) => model.positions[vertex * 3 + axis] ?? 0);
    for (let index = bare.indices.length; index < model.indices.length; index += 3) {
      const [one, two, three] = [0, 1, 2].map((corner) => point(model.indices[index + corner] ?? 0)) as [
        number[],
        number[],
        number[],
      ];
      for (let first = 0; first <= 4; first++)
        for (let second = 0; second <= 4 - first; second++) {
          const [toTwo, toThree] = [first / 4, second / 4];
          const blend = (axis: number) =>
            (one[axis] ?? 0) * (1 - toTwo - toThree) + (two[axis] ?? 0) * toTwo + (three[axis] ?? 0) * toThree;
          const [x, y, z] = [blend(0) + 100 - door.middle[0], blend(1) + 200 - door.middle[1], blend(2)];
          const out = x * outX + y * outY;
          const across = x * -outY + y * outX;
          const inside =
            Math.abs(across) < 0.5 && out > 0.05 && out < 1.5 && z > door.bottom + 0.2 && z < door.top - 0.3;
          assert.ok(!inside, `${style}: the doorway is clear at ${[across, out, z].map((n) => n.toFixed(2))}`);
        }
    }
  }
});
