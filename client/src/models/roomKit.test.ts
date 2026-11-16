import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { ForgedModel } from './model.ts';
import { SKIRTING_M, kitModel } from './roomKit.ts';
import { boxFrame, doorAxes } from './frame.ts';
import { DOOR_FRAME_M } from './doors.ts';
import { dot, idsOf, kitTable, rayHit, vertexOf, woundOutward } from './fixtures.test.ts';

const ids = idsOf(kitTable);
const models = new Map<number, ForgedModel>();
for (const id of ids) {
  const model = kitModel(kitTable, id);
  if (model) models.set(id, model);
}
const modelOf = (id: number): ForgedModel => {
  const model = models.get(id);
  assert.ok(model, `${id}: a model`);
  return model;
};
const NORMALS = [
  [-1, 0, 0],
  [1, 0, 0],
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1],
];

test("every piece of the rooms' kit a town's interiors place is measured, its plan inside its box", () => {
  assert.equal(ids.length, 751);
  for (const id of ids) {
    const measure = kitTable[id];
    assert.ok(measure.faces.length + (measure.sloped?.length ?? 0) > 0, `${id}: a face`);
    for (const [side, plane, acrossFrom, alongFrom, acrossTo, alongTo] of measure.faces) {
      const axis = side >> 1;
      const [across, along] = [0, 1, 2].filter((other) => other !== axis);
      assert.ok(
        plane >= measure.min[axis] - 1e-3 &&
          plane <= measure.max[axis] + 1e-3 &&
          acrossFrom >= measure.min[across] - 1e-3 &&
          acrossTo <= measure.max[across] + 1e-3 &&
          alongFrom >= measure.min[along] - 1e-3 &&
          alongTo <= measure.max[along] + 1e-3 &&
          acrossFrom < acrossTo &&
          alongFrom < alongTo,
        `${id}: a face in its box`,
      );
    }
  }
  assert.equal(kitModel(kitTable, 99999), null, 'an id the Room Kit does not stand');
});

test('every piece stands in its box, its faces wound to their normals, in its own pictures, its doors as measured', () => {
  for (const id of ids) {
    const model = modelOf(id),
      measure = kitTable[id];
    for (let k = 0; k < model.positions.length / 3; k++) {
      const corner = vertexOf(model, k);
      for (let axis = 0; axis < 3; axis++)
        assert.ok(
          corner[axis] >= measure.min[axis] - 0.011 && corner[axis] <= measure.max[axis] + 0.011,
          `${id}: vertex ${k} inside the box`,
        );
    }
    assert.equal(woundOutward(model), 0, `${id}: every triangle faces its normal`);
    const own = new Set(measure.pictures.map(([archive, record]) => `${archive}.${record}`));
    for (const part of model.parts)
      assert.ok(own.has(`${part.archive}.${part.record}`), `${id}: wears ${part.archive}.${part.record}, its own`);
    const doors = (measure.doors ?? []).map((door, place) => ({
      index: door.index ?? place,
      type: door.type,
      corners: [door.a, door.b, door.c],
      normal: door.n,
    }));
    assert.deepEqual(model.doors, doors, `${id}: the doors as measured`);
  }
});

test("each face of a piece's plan is laid where the plan stands it, each sloped triangle where it stood", () => {
  for (const id of ids) {
    const model = modelOf(id);
    for (const [side, plane, acrossFrom, alongFrom, acrossTo, alongTo] of kitTable[id].faces) {
      const axis = side >> 1,
        normal = NORMALS[side];
      const [across, along] = [0, 1, 2].filter((other) => other !== axis);
      const middle = [0, 0, 0];
      middle[axis] = plane;
      middle[across] = (acrossFrom + acrossTo) / 2 + 1e-3;
      middle[along] = (alongFrom + alongTo) / 2 + 2e-3;
      const met: number[] = [];
      rayHit(
        model,
        middle.map((value, i) => value + normal[i] * 0.2),
        normal.map((value) => -value),
        0.25,
        met,
      );
      assert.ok(
        met.some((value) => Math.abs(value - 0.2) < 0.005),
        `${id}: the face on side ${side} at ${plane} laid`,
      );
    }
    for (const [, ...flat] of kitTable[id].sloped ?? []) {
      const corners = [flat.slice(0, 3), flat.slice(3, 6), flat.slice(6, 9)];
      const first = corners[1].map((value, i) => value - corners[0][i]),
        second = corners[2].map((value, i) => value - corners[0][i]);
      const cross = [
        first[1] * second[2] - first[2] * second[1],
        first[2] * second[0] - first[0] * second[2],
        first[0] * second[1] - first[1] * second[0],
      ];
      const length = Math.hypot(cross[0], cross[1], cross[2]);
      if (length < 1e-6) continue;
      const normal = cross.map((value) => value / length);
      const middle = [0, 1, 2].map((i) => (corners[0][i] + corners[1][i] + corners[2][i]) / 3);
      const met: number[] = [];
      rayHit(
        model,
        middle.map((value, i) => value + normal[i] * 0.2),
        normal.map((value) => -value),
        0.25,
        met,
      );
      assert.ok(
        met.some((value) => Math.abs(value - 0.2) < 0.005),
        `${id}: a sloped triangle laid`,
      );
    }
  }
});

test('a wall meeting a floor takes a skirting off it; a door with room behind it a frame', () => {
  const lips = (model: ForgedModel, y: number): number => {
    let count = 0;
    for (let t = 0; t < model.indices.length; t += 3) {
      const heights = [0, 1, 2].map((k) => vertexOf(model, model.indices[t + k])[1]);
      if (model.normals[model.indices[t] * 3 + 1] > 0.99 && heights.every((value) => Math.abs(value - y) < 1e-4))
        count++;
    }
    return count;
  };
  const floor = kitTable[31006].faces.find((face) => face[0] === 3);
  assert.ok(floor, 'a room cell with a floor');
  assert.ok(lips(modelOf(31006), floor[1] + SKIRTING_M[0]) >= 4, "a room cell's walls each take a skirting's lip");
  const withDoors = ids.filter((id) => kitTable[id].doors);
  assert.ok(withDoors.length >= 80, `${withDoors.length} pieces with doors`);
  // A frame's own triangles lie off the door's plane, inside its frame's square and its depth. A door with room
  // behind it in its box takes a frame; a flat panel's box has none, and a frame there would leave it.
  let framed = 0;
  for (const id of withDoors) {
    const model = modelOf(id),
      measure = kitTable[id],
      fit = boxFrame(measure);
    for (const door of measure.doors ?? []) {
      const { corners, centre, n, across, up } = doorAxes(door);
      const plane = dot(n, centre),
        wide = corners.map((corner) => dot(corner, across)),
        tall = corners.map((corner) => dot(corner, up));
      const within = (corner: readonly number[]): boolean =>
        dot(corner, across) >= Math.min(...wide) - DOOR_FRAME_M - 1e-3 &&
        dot(corner, across) <= Math.max(...wide) + DOOR_FRAME_M + 1e-3 &&
        dot(corner, up) >= Math.min(...tall) - DOOR_FRAME_M - 1e-3 &&
        dot(corner, up) <= Math.max(...tall) + DOOR_FRAME_M + 1e-3 &&
        dot(corner, n) - plane >= -0.501 &&
        dot(corner, n) - plane <= 0.05;
      let own = 0;
      for (let t = 0; t < model.indices.length; t += 3) {
        const triangle = [0, 1, 2].map((k) => vertexOf(model, model.indices[t + k]));
        if (triangle.every(within) && triangle.some((corner) => Math.abs(dot(corner, n) - plane) > 1e-4)) own++;
      }
      const spans = [
        [fit.x0, fit.x1],
        [fit.y0, fit.y1],
        [fit.z0, fit.z1],
      ];
      const behind = spans.reduce(
        (least, [low, high], axis) =>
          Math.min(least, n[axis] > 0.9 ? centre[axis] - low : n[axis] < -0.9 ? high - centre[axis] : Infinity),
        Infinity,
      );
      if (behind > 0.03) {
        assert.ok(own >= 24, `${id}: its door framed, ${own} triangles of its frame`);
        framed++;
      } else assert.equal(own, 0, `${id}: a flat panel's door, no frame out of its box`);
    }
  }
  assert.ok(framed >= 1, `${framed} doors framed`);
});
