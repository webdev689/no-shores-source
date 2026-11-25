import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CHEST_OPEN_RAD, type ChestFace, chestFaces, chestHinge, chestScale, chestTall } from './chest.ts';

const scale = chestScale(0.9, 0.5);
const corners = (faces: readonly ChestFace[]) => faces.flatMap((face) => face.corners);
const middleOf = (face: ChestFace) =>
  [0, 1, 2].map((axis) => face.corners.reduce((sum, corner) => sum + corner[axis], 0) / 3);

test('a chest stands within the box it is fitted to, on its floor, as large as the box allows', () => {
  const points = corners(chestFaces(scale));
  const [across, out, up] = [0, 1, 2].map((axis) => points.map((point) => point[axis]));
  assert.ok(Math.max(...across.map(Math.abs)) <= 0.45 + 1e-9, 'within its width');
  assert.ok(Math.max(...out.map(Math.abs)) <= 0.25 + 1e-9, 'within its depth');
  assert.ok(Math.max(...out.map(Math.abs)) > 0.249, 'as deep as it may be: the depth binds this box');
  assert.equal(Math.min(...up), 0, 'its foot on the floor');
  assert.ok(Math.abs(Math.max(...up) - chestTall(scale)) < 1e-9);
  assert.ok(Math.abs(Math.min(...across) + Math.max(...across)) < 1e-9, 'its middle over the origin');
});

test("every face points out of the chest: its floor down, its lid's top up, its latch out of its front", () => {
  const faces = chestFaces(scale);
  const partOf = (part: string) => faces.filter((face) => face.part === part);
  assert.equal(faces.length, 84);
  for (const face of faces) assert.ok(Math.abs(Math.hypot(...face.normal) - 1) < 1e-9, 'each normal a unit');
  const floor = partOf('base').filter((face) => face.corners.every((corner) => corner[2] === 0));
  assert.equal(floor.length, 4);
  for (const face of floor) assert.ok(face.normal[2] < -0.99, 'the floor faces down');
  const top = Math.max(...partOf('lid').map((face) => middleOf(face)[2] ?? 0));
  const tops = partOf('lid').filter((face) => (middleOf(face)[2] ?? 0) > top - 0.05);
  assert.ok(tops.length >= 2 && tops.every((face) => face.normal[2] > 0.5), "the lid's ridge faces up");
  const front = Math.max(...corners(partOf('latch')).map((corner) => corner[1]));
  const outer = partOf('latch').filter((face) => face.corners.every((corner) => Math.abs(corner[1] - front) < 1e-9));
  assert.ok(outer.length >= 2 && outer.every((face) => face.normal[1] > 0.99), "the latch's face looks out");
});

test('opening turns the lid, its hinge and its latch together about the hinge, the latch rising and coming back', () => {
  const [shut, open] = [chestFaces(scale), chestFaces(scale, CHEST_OPEN_RAD)];
  const hinge = chestHinge(scale);
  const fromHinge = (point: readonly number[]) => Math.hypot((point[1] ?? 0) - hinge[1], (point[2] ?? 0) - hinge[2]);
  shut.forEach((face, nth) => {
    const opened = open[nth];
    assert.ok(opened && opened.part === face.part);
    face.corners.forEach((corner, k) => {
      const moved = opened.corners[k] ?? corner;
      if (face.part === 'base') assert.deepEqual(moved, corner, 'the base stays');
      else assert.ok(Math.abs(fromHinge(moved) - fromHinge(corner)) < 1e-9, 'each turned point keeps its reach');
      assert.equal(moved[0], corner[0], 'turned about a line across it');
    });
  });
  const latch = (faces: readonly ChestFace[]) => corners(faces.filter((face) => face.part === 'latch'));
  const [was, now] = [latch(shut), latch(open)];
  assert.ok(Math.min(...now.map((point) => point[2])) > Math.max(...was.map((point) => point[2])), 'risen');
  assert.ok(Math.max(...now.map((point) => point[1])) < Math.min(...was.map((point) => point[1])), 'come back');
  assert.ok(Math.abs(CHEST_OPEN_RAD - 1.3495) < 1e-4, "the model's widest, 77 degrees: short of upright");
});
