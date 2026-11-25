import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { ForgedModel } from './model.ts';
import { buildingModel, withoutDoors } from './buildings.ts';
import { doorAxes } from './frame.ts';
import { buildingTable, dot, idsOf, rayHit, vertexOf, woundOutward } from './fixtures.test.ts';

const ids = idsOf(buildingTable);
const models = new Map<number, ForgedModel>();
for (const id of ids) {
  const model = buildingModel(buildingTable, id);
  if (model) models.set(id, model);
}
const modelOf = (id: number): ForgedModel => {
  const model = models.get(id);
  assert.ok(model, `${id}: a model`);
  return model;
};
const minus = (a: readonly number[], b: readonly number[]): number[] => a.map((value, i) => value - b[i]);

test('every town building a block places is measured: a plan inside its grid, each wing no higher at its eaves than its ridge', () => {
  assert.equal(ids.length, 387);
  for (const id of ids) {
    const measure = buildingTable[id];
    assert.ok(measure.plan.length > 0, `${id}: a plan`);
    for (const wing of measure.plan) {
      assert.ok(wing.eaves <= wing.ridge, `${id}: eaves under ridge`);
      for (const [column0, row0, column1, row1] of wing.rects)
        assert.ok(
          column0 >= 0 &&
            row0 >= 0 &&
            column1 <= measure.grid[0] &&
            row1 <= measure.grid[1] &&
            column0 < column1 &&
            row0 < row1,
          `${id}: a rectangle in the grid`,
        );
    }
  }
});

test('every building stands in its box, on its floor, its faces outward, in its own pictures, its doors as measured', () => {
  for (const id of ids) {
    const model = modelOf(id),
      measure = buildingTable[id];
    let lowest = Infinity;
    for (let k = 0; k < model.positions.length / 3; k++) {
      const corner = vertexOf(model, k);
      for (let axis = 0; axis < 3; axis++)
        assert.ok(
          corner[axis] >= measure.min[axis] - 0.011 && corner[axis] <= measure.max[axis] + 0.011,
          `${id}: vertex ${k} inside the box (${corner})`,
        );
      lowest = Math.min(lowest, corner[1]);
    }
    if (measure.plan.some((wing) => wing.low === undefined))
      assert.ok(lowest - measure.min[1] < 0.011, `${id}: on its floor`);
    assert.equal(woundOutward(model), 0, `${id}: every triangle faces its normal`);
    const own = [...measure.walls, ...measure.roofs, ...measure.looks, ...(measure.glass ? [measure.glass] : [])];
    if (measure.doorLook) own.push(measure.doorLook);
    const allowed = new Set(own.map(([archive, record]) => `${archive}.${record}`));
    for (const part of model.parts)
      assert.ok(allowed.has(`${part.archive}.${part.record}`), `${id}: wears ${part.archive}.${part.record}, its own`);
    const doors = (measure.doors ?? []).map((door, place) => ({
      index: door.index ?? place,
      type: door.type,
      corners: [door.a, door.b, door.c],
      normal: door.n,
    }));
    assert.deepEqual(model.doors, doors, `${id}: the doors as measured`);
  }
  // A door's index is its place among its picture's doors, counted from 0, as saves and anchors match it.
  for (const [id, indices] of [
    [444, [0, 1, 2, 0]],
    [521, [0, 1, 2, 3, 0, 1, 2, 3, 4, 5]],
    [522, [0, 0]],
  ] as const)
    assert.deepEqual(
      modelOf(id).doors.map((door) => door.index),
      indices,
      `${id}: the classic's door indices`,
    );
});

test('a building stands on its plan: solid to its eaves, open beneath its covered ways, its open ground clear to walk', () => {
  for (const id of ids) {
    const model = modelOf(id),
      measure = buildingTable[id];
    const [columns, rows] = measure.grid;
    const stepX = (measure.max[0] - measure.min[0]) / columns,
      stepZ = (measure.max[2] - measure.min[2]) / rows;
    const xAt = (column: number): number => measure.min[0] + column * stepX,
      zAt = (row: number): number => measure.min[2] + row * stepZ;
    const owned = new Set<number>();
    // A wing's middle in a door's way (four metres out, over its sill) is the door's: cut clear, not stood.
    const inWay = (point: readonly number[], top: number): boolean =>
      (measure.doors ?? []).some((door) => {
        const { centre, n, across, width } = doorAxes(door);
        const out = dot(minus(point, centre), n),
          side = Math.abs(dot(minus(point, centre), across));
        return out > 0 && out < 4 && side < width / 2 + 0.1 && top > Math.min(door.a[1], door.b[1], door.c[1]) + 0.5;
      });
    for (const wing of measure.plan)
      for (const [column0, row0, column1, row1, stepTop] of wing.rects) {
        for (let row = row0; row < row1; row++)
          for (let column = column0; column < column1; column++) owned.add(row * columns + column);
        const top = stepTop ?? wing.eaves;
        const middle = [(xAt(column0) + xAt(column1)) / 2, 0, (zAt(row0) + zAt(row1)) / 2];
        if (inWay(middle, top)) continue;
        const above = measure.max[1] + 1;
        const down = rayHit(
          model,
          [middle[0] + 1e-3, above, middle[2] + 2e-3],
          [0, -1, 0],
          measure.max[1] - measure.min[1] + 2,
        );
        assert.ok(down !== null, `${id}: something over the wing's middle`);
        assert.ok(
          above - down >= top - 0.02,
          `${id}: the wing's middle stands to its top (${(above - down).toFixed(2)} for ${top})`,
        );
        if (wing.low !== undefined) {
          const floor = measure.min[1] + 0.05;
          const up = rayHit(
            model,
            [middle[0] + 1e-3, floor, middle[2] + 2e-3],
            [0, 1, 0],
            measure.max[1] - measure.min[1],
          );
          assert.ok(up !== null && floor + up >= wing.low - 0.02, `${id}: open beneath the covered way to its low`);
        }
      }
    // Open ground a square clear of every wing: nothing over it to a walker's height.
    let checked = 0;
    for (let row = 1; row < rows - 1 && checked < 40; row += 2)
      for (let column = 1; column < columns - 1 && checked < 40; column += 2) {
        const around = [-1, 0, 1].every((rowStep) =>
          [-1, 0, 1].every((columnStep) => !owned.has((row + rowStep) * columns + column + columnStep)),
        );
        if (!around) continue;
        checked++;
        const ground = [xAt(column) + stepX / 2, measure.min[1] + 0.05, zAt(row) + stepZ / 2];
        assert.equal(
          rayHit(model, ground, [0, 1, 0], 1.8),
          null,
          `${id}: open ground at ${column},${row} clear to walk`,
        );
      }
  }
});

test("a town gate (446) is open: rays through its passage, a post's width in from each side, meet nothing; its passage is roofed", () => {
  const model = modelOf(446),
    measure = buildingTable[446];
  // The classic gate's way through runs from x -8.05 to 1.68 m of its own frame.
  const along = -3.185,
    half = 4.865;
  for (let x = along - half + 0.9; x <= along + half - 0.9; x += 0.5)
    for (const y of [0.5, 1.5, 3])
      for (const sign of [1, -1]) {
        const from = [x, y, sign > 0 ? measure.min[2] - 1 : measure.max[2] + 1];
        assert.equal(
          rayHit(model, from, [0, 0, sign], measure.max[2] - measure.min[2] + 2),
          null,
          `the gate shut at x ${x.toFixed(2)}, y ${y}`,
        );
      }
  const over = rayHit(model, [along, 0.05, 0.1], [0, 1, 0], measure.max[1]);
  assert.ok(over !== null && over > 4.5, `the passage roofed over its way: ${over}`);
});

test("a building's way in is clear: nothing of it stands within two metres before a door; each door is pictured over its middle", () => {
  const withDoors = ids.filter((id) => buildingTable[id].doors);
  assert.ok(withDoors.length >= 350, `${withDoors.length} buildings with doors`);
  for (const id of withDoors) {
    const model = modelOf(id),
      measure = buildingTable[id];
    const look = measure.doorLook;
    assert.ok(look, `${id}: a door's picture`);
    for (const door of measure.doors ?? []) {
      const { corners, n, centre } = doorAxes(door);
      const [corner, right, , down] = corners;
      for (const across of [0.25, 0.5, 0.75])
        for (const downward of [0.25, 0.5, 0.75]) {
          const point = corner.map(
            (value, i) => value + (right[i] - value) * across + (down[i] - value) * downward + n[i] * 0.01,
          );
          const blocked = rayHit(model, point, n, 1.9);
          assert.equal(blocked, null, `${id}: before its door at ${across},${downward}, a face ${blocked} m out`);
        }
      const pictured = model.parts
        .filter((part) => part.archive === look[0] && part.record === look[1])
        .some((part) => {
          const own = {
            positions: model.positions,
            indices: model.indices.subarray(part.start, part.start + part.count),
          };
          return (
            rayHit(
              own,
              centre.map((value, i) => value + n[i]),
              n.map((value) => -value),
              1.01,
            ) !== null
          );
        });
      assert.ok(pictured, `${id}: its door's picture over the door's middle`);
    }
  }
});

test('windows: a building with glass wears it on its upright walls, never over a door, on at least 250 buildings', () => {
  let windowed = 0;
  for (const id of ids) {
    const model = modelOf(id),
      measure = buildingTable[id];
    const { glass } = measure;
    if (!glass) continue;
    const parts = model.parts.filter((part) => part.archive === glass[0] && part.record === glass[1]);
    for (const part of parts)
      for (let t = part.start; t < part.start + part.count; t += 3) {
        const triangle = [0, 1, 2].map((k) => vertexOf(model, model.indices[t + k]));
        assert.ok(Math.abs(model.normals[model.indices[t] * 3 + 1]) < 1e-6, `${id}: glass on an upright wall`);
        for (const door of measure.doors ?? []) {
          const { corners } = doorAxes(door);
          const overlap = [0, 1, 2].every(
            (axis) =>
              Math.min(...triangle.map((corner) => corner[axis])) <
                Math.max(...corners.map((corner) => corner[axis])) + 0.25 &&
              Math.max(...triangle.map((corner) => corner[axis])) >
                Math.min(...corners.map((corner) => corner[axis])) - 0.25,
          );
          assert.ok(!overlap, `${id}: a window over a door`);
        }
      }
    if (parts.length) windowed++;
  }
  assert.ok(windowed >= 250, `${windowed} buildings with windows`);
});

test('a building built again without doors has none: its faces whole, no door picture worn; an unknown model or id has none', () => {
  for (const id of [107, 444, 446]) {
    const doorless = withoutDoors(modelOf(id));
    assert.ok(doorless, `${id}: built again`);
    assert.deepEqual(doorless.doors, []);
    const look = buildingTable[id].doorLook;
    if (look)
      assert.ok(
        !doorless.parts.some((part) => part.archive === look[0] && part.record === look[1]),
        `${id}: no door's picture`,
      );
    assert.deepEqual(buildingModel(buildingTable, id, { doors: false }), doorless);
  }
  assert.equal(withoutDoors({ ...modelOf(107) }), null, 'a model the forge did not build');
  assert.equal(buildingModel(buildingTable, 99999), null, 'an id the Building Forge does not stand');
});

test("an open building's doorways let a body's sight straight through, from either side, a hand clear of the frame", () => {
  const table = buildingTable;
  for (const id of idsOf(table).filter((each) => (table[each].doors ?? []).length)) {
    const model = buildingModel(table, id, { open: true });
    assert.ok(model, `${id} builds`);
    for (const door of table[id].doors ?? []) {
      const { centre, n } = doorAxes(door);
      const sill = Math.min(door.a[1], door.b[1], door.c[1]);
      for (const side of [1, -1]) {
        const from = [0, 1, 2].map((axis) => centre[axis] + n[axis] * side * 0.5) as [number, number, number];
        from[1] = sill + 1.2;
        const through = n.map((value) => -value * side) as [number, number, number];
        assert.equal(
          rayHit(model, from, through, 1),
          null,
          `${id}: its door at ${centre.map((value) => value.toFixed(2))} is open`,
        );
      }
    }
  }
});

test("an open building's rooms show its windows: each is laid again on the lining's face, facing in", () => {
  const table = buildingTable;
  const glassFaces = (model: ForgedModel, glass: readonly number[]) =>
    model.parts
      .filter((part) => part.archive === glass[0] && part.record === glass[1])
      .reduce((sum, part) => sum + part.count / 3, 0);
  let checked = 0;
  for (const id of idsOf(table).filter((each) => table[each].glass)) {
    const glass = table[id].glass!;
    const [closed, open] = [buildingModel(table, id), buildingModel(table, id, { open: true })];
    if (!closed || !open || !glassFaces(closed, glass)) continue;
    // A window beside a doorway can be trimmed by the doorway's cut, so nearly every window, not each.
    const [outside, both] = [glassFaces(closed, glass), glassFaces(open, glass)];
    assert.ok(both >= outside * 1.9, `${id}: a window inside for (nearly) each outside: ${both} of ${2 * outside}`);
    checked++;
  }
  assert.ok(checked > 20, `buildings with windows checked: ${checked}`);
});

test("an open building's windows are holes through its wall, seen through from either side; a closed one's are not", () => {
  const table = buildingTable;
  /** The model's mesh without its glass: an open building's clear panes, a closed one's windows. */
  const without = (model: ForgedModel, glass: readonly number[]) => {
    const kept = model.parts.filter((part) => part.archive !== glass[0] || part.record !== glass[1]);
    return {
      positions: model.positions,
      indices: Uint32Array.from(
        kept.flatMap((part) => [...model.indices.subarray(part.start, part.start + part.count)]),
      ),
    };
  };
  let [panes, through, shut] = [0, 0, 0];
  for (const id of idsOf(table).filter((each) => table[each].glass)) {
    const glass = table[id].glass!;
    const [closed, open] = [buildingModel(table, id), buildingModel(table, id, { open: true })];
    if (!closed || !open) continue;
    const worn = (model: ForgedModel) =>
      model.parts.filter((part) => part.archive === glass[0] && part.record === glass[1]);
    assert.ok(
      worn(open).every((part) => part.clear),
      `${id}: an open building's panes are clear`,
    );
    assert.ok(!closed.parts.some((part) => part.clear), `${id}: a closed building's are not`);
    for (const [model, mesh, isOpen] of [
      [open, without(open, glass), true],
      [closed, without(closed, glass), false],
    ] as const)
      for (const part of worn(model))
        for (let quad = part.start; quad + 5 < part.start + part.count; quad += 6) {
          const corners = [0, 1, 2, 5].map((k) => vertexOf(model, model.indices[quad + k]));
          const middle = [0, 1, 2].map((axis) => corners.reduce((sum, corner) => sum + corner[axis], 0) / 4);
          const normal = [0, 1, 2].map((axis) => model.normals[model.indices[quad] * 3 + axis]);
          // From a hand before the pane, through the wall's depth and the lining's place behind it: at its middle and
          // near each corner, so nothing reaches into any part of it.
          const points = [
            middle,
            ...corners.map((corner) => corner.map((value, axis) => middle[axis] + (value - middle[axis]) * 0.9)),
          ];
          const hit = points.some(
            (point) =>
              rayHit(
                mesh,
                point.map((value, axis) => value + normal[axis] * 0.05),
                normal.map((value) => -value),
                0.35,
              ) !== null,
          );
          if (isOpen) [panes, through] = [panes + 1, through + (hit ? 0 : 1)];
          else shut += hit ? 1 : 0;
        }
  }
  // None looks into a lower wing's roof: no window is laid where its gable's end stands in the wall's plane.
  assert.ok(panes > 1000 && through === panes, `seen through: ${through} of ${panes}`);
  assert.ok(shut > 500, `a closed building's windows are pictures on a whole wall: ${shut}`);
});

test("a window is its picture's frame alone, 2 m wide at the frame's proportions, narrower where a storey holds no more", () => {
  const table = buildingTable;
  const id = Number(idsOf(table).find((each) => table[each].glass && buildingModel(table, each)?.parts.length));
  const glass = table[id].glass!;
  for (const [box, width, height] of [
    // A leaded window 48 by 36 texels; a slit 16 by 60, too tall for a storey over its sill at 2 m wide.
    [[8, 48, 56, 84], 2, 1.5],
    [[24, 40, 40, 100], 2 / 3.75, 2],
  ] as const) {
    const model = buildingModel(table, id, { frameOf: () => box });
    assert.ok(model, `${id} builds`);
    const window = model.parts.find((part) => part.archive === glass[0] && part.record === glass[1]);
    assert.ok(window, `${id} has windows`);
    const corners = [0, 1, 2, 5].map((k) => model.indices[window.start + k]);
    const places = corners.map((vertex) => vertexOf(model, vertex));
    const span = (axis: number) =>
      Math.max(...places.map((point) => point[axis])) - Math.min(...places.map((point) => point[axis]));
    assert.ok(Math.abs(Math.max(span(0), span(2)) - width) < 1e-4, `${id}: ${Math.max(span(0), span(2))} m wide`);
    assert.ok(Math.abs(span(1) - height) < 1e-4, `${id}: ${span(1)} m tall`);
    const uvs = corners.map((vertex) => [model.uvs[vertex * 2], model.uvs[vertex * 2 + 1]]);
    const [across, down] = [uvs.map((share) => share[0]), uvs.map((share) => share[1])];
    assert.deepEqual(
      [Math.min(...across), Math.min(...down), Math.max(...across), Math.max(...down)].map((share) => share.toFixed(4)),
      [box[0] / glass[2], box[1] / glass[3], box[2] / glass[2], box[3] / glass[3]].map((share) => share.toFixed(4)),
      `${id}: shows its frame's share of the picture`,
    );
  }
});
