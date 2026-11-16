import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { ForgedModel } from './model.ts';
import { PROP_FAMILIES, propModel } from './props.ts';
import { PROP_ROLES } from './propRoles.ts';
import { PLAIN_WOOD, TEXELS_PER_METRE, partBuilder } from './parts.ts';
import { boxFrame, doorAxes, towardDoor } from './frame.ts';
import { DOOR_FRAME_M, carve, passageOf, type CutVertex } from './doors.ts';
import { CHAIR_SEAT_M } from './familiesHome.ts';
import { dot, idsOf, propTable, rayHit, vertexOf, woundOutward } from './fixtures.test.ts';

const ids = idsOf(propTable);
const models = new Map<number, ForgedModel>();
for (const id of ids) {
  const model = propModel(propTable, id);
  if (model) models.set(id, model);
}
const modelOf = (id: number): ForgedModel => {
  const model = models.get(id);
  assert.ok(model, `${id}: a model`);
  return model;
};
const doorIds = ids.filter((id) => propTable[id].doors);

test('every measured piece has a family that builds it, and the table measures those pieces, no more', () => {
  assert.equal(ids.length, 434);
  for (const id of ids) {
    const relief = propTable[id].relief;
    if (relief)
      assert.equal(relief.tops.length, relief.grid[0] * relief.grid[1], `${id}: a relief's nodes fill its grid`);
    if (relief) assert.ok(relief.grid[0] >= 2 && relief.grid[1] >= 2, `${id}: a relief's grid reads between nodes`);
  }
  for (const id of ids) {
    const role = PROP_ROLES.get(id);
    assert.ok(role, `${id}: a family`);
    assert.equal(typeof PROP_FAMILIES[role], 'function', `${id}: ${role} builds`);
  }
  assert.deepEqual(
    [...PROP_ROLES.keys()].sort((a, b) => a - b),
    [...ids].sort((a, b) => a - b),
  );
  assert.equal(propModel(propTable, 99999), null, 'an id the Prop Forge does not stand');
});

test('every piece fills its box: inside it, on its floor and touching each face (one with a door may stand short of all but its floor), its faces outward, in its own pictures', () => {
  for (const id of ids) {
    const model = modelOf(id),
      measure = propTable[id];
    const low = [Infinity, Infinity, Infinity],
      high = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < model.positions.length / 3; k++) {
      const corner = vertexOf(model, k);
      for (let axis = 0; axis < 3; axis++) {
        assert.ok(
          corner[axis] >= measure.min[axis] - 0.011 && corner[axis] <= measure.max[axis] + 0.011,
          `${id}: vertex ${k} inside the box`,
        );
        low[axis] = Math.min(low[axis], corner[axis]);
        high[axis] = Math.max(high[axis], corner[axis]);
      }
    }
    assert.ok(Math.abs(low[1] - measure.min[1]) < 0.011, `${id}: on its floor`);
    if (!measure.doors)
      for (let axis = 0; axis < 3; axis++) {
        assert.ok(low[axis] - measure.min[axis] < 0.011, `${id}: touches its low face on axis ${axis}`);
        assert.ok(measure.max[axis] - high[axis] < 0.011, `${id}: touches its high face on axis ${axis}`);
      }
    assert.equal(woundOutward(model), 0, `${id}: every triangle faces its normal`);
    const own = [...measure.looks, PLAIN_WOOD];
    if (measure.doorLook) own.push(measure.doorLook);
    if (measure.bedding) own.push(measure.bedding);
    const allowed = new Set(own.map(([archive, record]) => `${archive}.${record}`));
    for (const part of model.parts)
      assert.ok(allowed.has(`${part.archive}.${part.record}`), `${id}: wears ${part.archive}.${part.record}, its own`);
    assert.ok(model.indices.length / 3 < 400, `${id}: ${model.indices.length / 3} triangles`);
    const doors = (measure.doors ?? []).map((door, place) => ({
      index: door.index ?? place,
      type: door.type,
      corners: [door.a, door.b, door.c],
      normal: door.n,
    }));
    assert.deepEqual(model.doors, doors, `${id}: the doors as measured`);
  }
});

test('a piece with a door keeps its way in clear: nothing of it stands before the door, seen from nine points across it', () => {
  assert.ok(doorIds.length >= 10, 'the huts, temples, tents, caves, boats and the great tree');
  for (const id of doorIds) {
    const model = modelOf(id);
    for (const door of propTable[id].doors ?? []) {
      const [corner, right, , down] = doorAxes(door).corners;
      for (const across of [0.25, 0.5, 0.75])
        for (const downward of [0.25, 0.5, 0.75]) {
          const point = corner.map(
            (value, i) => value + (right[i] - value) * across + (down[i] - value) * downward + door.n[i] * 0.01,
          );
          const blocked = rayHit(model, point, door.n, 2);
          assert.equal(blocked, null, `${id}: before its door at ${across},${downward}, a face ${blocked} m out`);
        }
    }
  }
});

test('a door wears its picture on its face, over its middle, and a frame round it', () => {
  for (const id of doorIds) {
    const model = modelOf(id),
      measure = propTable[id];
    const look = measure.doorLook;
    assert.ok(look, `${id}: a door's picture`);
    const part = model.parts.find((each) => each.archive === look[0] && each.record === look[1]);
    for (const door of measure.doors ?? []) {
      const { centre, n } = doorAxes(door);
      let over = false;
      for (let t = part ? part.start : 0; part && t < part.start + part.count; t += 3) {
        const triangle = [0, 1, 2].map((k) => vertexOf(model, model.indices[t + k]));
        if (triangle.some((corner) => Math.abs(dot(corner, n) - dot(centre, n) - 0.004) > 1e-4)) continue;
        const face = { positions: triangle.flat(), indices: [0, 1, 2] };
        if (
          rayHit(
            face,
            centre.map((value, i) => value + n[i]),
            n.map((value) => -value),
            2,
          ) !== null
        )
          over = true;
      }
      assert.ok(over, `${id}: the door's picture over its middle`);
    }
  }
  const { centre, n, across, width } = doorAxes((propTable[41619].doors ?? [])[0]);
  const jamb = rayHit(
    modelOf(41619),
    centre.map((value, i) => value - across[i] * (width / 2 + DOOR_FRAME_M / 2) + n[i] * 0.5),
    n.map((value) => -value),
    1,
  );
  assert.ok(jamb !== null && jamb < 0.5, "a hut's door framed: its jamb stands proud of the wall");
});

test("a door's passage cuts a face clean: what is kept and what is cut make the face, and nothing kept lies within", () => {
  const passage = passageOf({ a: [-0.5, 2, 0], b: [0.5, 2, 0], c: [0.5, 0, 0], n: [0, 0, 1] });
  const corner = (point: number[]): CutVertex => ({ p: point, n: [0, 0, 1], uv: [point[0], point[1]] });
  const wall = [corner([-3, 0, 1]), corner([3, 0, 1]), corner([3, 3, 1]), corner([-3, 3, 1])];
  const area = (poly: readonly CutVertex[]): number => {
    let sum = 0;
    for (let k = 1; k < poly.length - 1; k++) {
      const [a, b, third] = [poly[0].p, poly[k].p, poly[k + 1].p];
      sum += Math.abs((b[0] - a[0]) * (third[1] - a[1]) - (third[0] - a[0]) * (b[1] - a[1])) / 2;
    }
    return sum;
  };
  const { kept, cut } = carve(wall, passage);
  assert.ok(cut, 'a wall a metre before the door is cut');
  assert.ok(
    Math.abs(kept.reduce((sum, poly) => sum + area(poly), 0) + area(cut) - 18) < 1e-9,
    'kept and cut make the wall',
  );
  assert.ok(
    Math.abs(area(cut) - (1 + 0.12) * (2 + 0.06 - 0.005)) < 1e-9,
    'the cut is the door a hand wider, from just over its sill',
  );
  for (const poly of kept)
    for (const vertex of poly)
      assert.ok(Math.abs(vertex.uv[0] - vertex.p[0]) < 1e-12, "a new corner's picture place follows it");
  const behind = [corner([-3, 0, -1]), corner([3, 0, -1]), corner([3, 3, -1])];
  assert.deepEqual(carve(behind, passage), { kept: [behind], cut: null }, 'a face behind the door is whole');
});

test('a piece with a door is built turned to face it, whichever way it faces', () => {
  const fit = boxFrame({ min: [-2, 0, -3], max: [2, 2, 3] });
  for (const n of [
    [0, 0, 1],
    [0, 0, -1],
    [1, 0, 0],
    [-1, 0, 0],
  ]) {
    const parts = partBuilder();
    const view = towardDoor(parts, fit, [{ a: [0, 1, 0], b: [0, 1, 0], c: [0, 0, 0], n }]);
    assert.ok(view.doors[0].n[2] > 0.99, `${n}: the door faces +z in the family's frame`);
    view.add.box([0, 0, 1, 1], [view.fit.x0, view.fit.x1], [0, 1], [view.fit.z1 - 0.1, view.fit.z1]);
    const model = parts.model();
    const reach = Math.max(
      ...Array.from({ length: model.positions.length / 3 }, (unused, k) => dot(vertexOf(model, k), n)),
    );
    const half = Math.abs(n[0]) * 2 + Math.abs(n[2]) * 3;
    assert.ok(Math.abs(reach - half) < 1e-9, `${n}: the family's front stands on the door's side`);
  }
});

test('a round piece fills its box: a filled ring touches all four sides whatever its count', () => {
  for (const sides of [5, 6, 8, 9, 12]) {
    const parts = partBuilder();
    parts.prism([0, 0, 1, 1], 1, -2, 3, 1.5, 0, 1, sides, { fill: true });
    const model = parts.model();
    const spanX: number[] = [],
      spanZ: number[] = [];
    for (let k = 0; k < model.positions.length / 3; k++) {
      spanX.push(model.positions[k * 3]);
      spanZ.push(model.positions[k * 3 + 2]);
    }
    assert.ok(
      Math.abs(Math.min(...spanX) + 2) < 1e-5 && Math.abs(Math.max(...spanX) - 4) < 1e-5,
      `${sides} sides: across x`,
    );
    assert.ok(
      Math.abs(Math.min(...spanZ) + 3.5) < 1e-5 && Math.abs(Math.max(...spanZ) + 0.5) < 1e-5,
      `${sides} sides: across z`,
    );
  }
});

test("a piece wears its first picture among its own, each laid at 40 texels a metre by the face's own plane", () => {
  assert.equal(TEXELS_PER_METRE, 40);
  for (const id of ids) {
    const model = modelOf(id),
      measure = propTable[id];
    const [first] = measure.looks;
    assert.ok(
      model.parts.some((part) => part.archive === first[0] && part.record === first[1]),
      `${id}: wears ${first[0]}.${first[1]}`,
    );
    const pictures = [...measure.looks, PLAIN_WOOD];
    if (measure.doorLook) pictures.push(measure.doorLook);
    if (measure.bedding) pictures.push(measure.bedding);
    const sizeOf = new Map(pictures.map(([archive, record, wide, tall]) => [`${archive}.${record}`, [wide, tall]]));
    // A door's picture is laid once over the door, not by the metre.
    const onDoor = (i: number): boolean =>
      (measure.doors ?? []).some((door) => {
        const { n, centre } = doorAxes(door);
        const normal = [0, 1, 2].map((axis) => model.normals[i * 3 + axis]);
        return Math.abs(dot(vertexOf(model, i), n) - dot(centre, n) - 0.004) < 1e-4 && dot(normal, n) > 0.999;
      });
    for (const part of model.parts) {
      const [wide, tall] = sizeOf.get(`${part.archive}.${part.record}`) ?? [NaN, NaN];
      for (let t = part.start; t < part.start + part.count; t += 3) {
        const [i, j] = [model.indices[t], model.indices[t + 1]];
        if (onDoor(i) && onDoor(j)) continue;
        const n = [0, 1, 2].map((axis) => Math.abs(model.normals[i * 3 + axis]));
        const [uAxis, vAxis] = n[0] >= n[1] && n[0] >= n[2] ? [2, 1] : n[1] >= n[2] ? [0, 2] : [0, 1];
        const acrossStep = model.positions[j * 3 + uAxis] - model.positions[i * 3 + uAxis],
          upStep = model.positions[j * 3 + vAxis] - model.positions[i * 3 + vAxis];
        const uStep = Math.abs(model.uvs[j * 2] - model.uvs[i * 2]),
          vStep = Math.abs(model.uvs[j * 2 + 1] - model.uvs[i * 2 + 1]);
        assert.ok(Math.abs(uStep - (Math.abs(acrossStep) * 40) / wide) < 1e-4, `${id}: u at 40 texels a metre`);
        assert.ok(Math.abs(vStep - (Math.abs(upStep) * 40) / tall) < 1e-4, `${id}: v at 40 texels a metre`);
      }
    }
  }
});

test("a chair's and a bench's seat stands over the box's middle, between 0.2 and 0.9 m up; a chair's at 0.45 m", () => {
  assert.equal(CHAIR_SEAT_M, 0.45);
  for (const id of ids.filter((each) => PROP_ROLES.get(each) === 'chair' || PROP_ROLES.get(each) === 'bench')) {
    const model = modelOf(id),
      measure = propTable[id];
    const middleX = (measure.min[0] + measure.max[0]) / 2,
      middleZ = (measure.min[2] + measure.max[2]) / 2;
    let seat = -Infinity;
    for (let t = 0; t < model.indices.length; t += 3) {
      if (model.normals[model.indices[t] * 3 + 1] < 0.99) continue;
      const triangle = [0, 1, 2].map((k) => vertexOf(model, model.indices[t + k]));
      const spanX = triangle.map((corner) => corner[0]),
        spanZ = triangle.map((corner) => corner[2]);
      if (
        middleX < Math.min(...spanX) ||
        middleX > Math.max(...spanX) ||
        middleZ < Math.min(...spanZ) ||
        middleZ > Math.max(...spanZ)
      )
        continue;
      const y = triangle[0][1] - measure.min[1];
      if (y >= 0.2 && y <= 0.9) seat = Math.max(seat, y);
    }
    assert.ok(seat >= 0.2, `${id}: a seat over its middle`);
    if (PROP_ROLES.get(id) === 'chair') assert.ok(Math.abs(seat - CHAIR_SEAT_M) < 1e-5, `${id}: at 0.45 m (${seat})`);
  }
});

test("the families' own marks: a wide wardrobe four doors and a narrow one two; a long table more legs; a canopy bed's posts to its top", () => {
  const quadsWhere = (id: number, holds: (triangle: number[][]) => boolean): number => {
    const model = modelOf(id);
    let count = 0;
    for (let t = 0; t < model.indices.length; t += 6)
      if (holds([0, 1, 2].map((k) => vertexOf(model, model.indices[t + k])))) count++;
    return count;
  };
  const doorFronts = (id: number): number =>
    quadsWhere(id, (triangle) =>
      triangle.every((corner) => Math.abs(corner[2] - propTable[id].max[2] + 0.03 * 0.4) < 1e-6),
    );
  assert.equal(doorFronts(41004), 2 * doorFronts(41003), 'the wide wardrobe twice the doors');
  const feet = (id: number): number =>
    quadsWhere(id, (triangle) => {
      const onFloor = triangle.map((corner) => Math.abs(corner[1] - propTable[id].min[1]) < 1e-6);
      return onFloor.some(Boolean) && !onFloor.every(Boolean);
    });
  assert.ok(feet(41121) > feet(41108), 'the long table more legs');
  const tall = quadsWhere(41002, (triangle) =>
    triangle.some((corner) => Math.abs(corner[1] - propTable[41002].max[1]) < 1e-6),
  );
  assert.ok(tall >= 4, "the canopy's posts and frame reach its top");
});
