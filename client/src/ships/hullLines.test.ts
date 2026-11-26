import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FAIR_LINE, HULL_FIT, lineAt, STATIONS } from '../water/hullMask.ts';
import { HullLines, waterlineOf } from './hullLines.ts';
import { type ShipMesh, VERTEX_BYTES } from './shipMesh.ts';

/** A diamond hull 20 m long and 4 m wide at its waterline, 1 m deep and 1 m high: its widest amidships, pointed at
 *  both ends, each face crossing its waterline. */
function diamond(): ShipMesh {
  const corners = [
    [10, 0, 0.5],
    [0, 2, 1],
    [0, 2, -1],
    [-10, 0, 0.5],
    [0, -2, 1],
    [0, -2, -1],
    [10, 0, -0.5],
    [-10, 0, -0.5],
  ];
  // Bow to side's top to stern below, so each face is cut by its waterline.
  const faces = [0, 1, 7, 0, 4, 7, 6, 2, 3, 6, 5, 3, 1, 2, 3, 4, 5, 0];
  return meshOf(corners, faces, 20, 4);
}

/** A mesh of `corners` (x toward its bow, y to starboard, z up from its waterline) and its faces' corners in threes. */
function meshOf(corners: readonly number[][], faces: readonly number[], lengthM: number, beamM: number): ShipMesh {
  const bytes = new ArrayBuffer(corners.length * VERTEX_BYTES);
  const view = new DataView(bytes);
  corners.forEach(([x = 0, y = 0, z = 0], vertex) => {
    [x, y, z].forEach((value, axis) => view.setFloat32(vertex * VERTEX_BYTES + axis * 4, value, true));
  });
  return {
    name: 'hull',
    vertexCount: corners.length,
    vertices: bytes,
    indices: Uint32Array.from(faces),
    waterline: { lengthM, beamM, draughtM: 1 },
  };
}

/** A Frigate-like waterline, its half beam (metres from amidships toward its bow, metres to one side): a rudder's
 *  thin post at its stern, its body flaring out of it some way forward, its widest amidships, fine at its bow. */
const FRIGATE_LINE = [
  [-19, 0.15],
  [-17.5, 0.15],
  [-16.5, 1.1],
  [-15, 2.5],
  [-12, 3],
  [12, 3],
  [16, 1.8],
  [19, 0.1],
];

/** A hull walled straight up and down along `outline` on both its sides, each wall crossing its waterline. */
function walled(outline: readonly number[][]): ShipMesh {
  const corners = outline.flatMap(([x = 0, y = 0]) => [
    [x, y, -1],
    [x, y, 1],
    [x, -y, -1],
    [x, -y, 1],
  ]);
  const faces = outline.slice(1).flatMap((_point, index) =>
    [0, 2].flatMap((side) => {
      const [low, high, nextLow, nextHigh] = [
        index * 4 + side,
        index * 4 + side + 1,
        index * 4 + 4 + side,
        index * 4 + 5 + side,
      ];
      return [low, high, nextLow, high, nextHigh, nextLow];
    }),
  );
  return meshOf(corners, faces, 38, 6);
}

/** Its true half beam at `x` metres along it, between the outline's points. */
function halfBeamAt(outline: readonly number[][], x: number): number {
  const after = outline.findIndex(([along = 0]) => along >= x);
  if (after <= 0) return outline[Math.max(0, after)]?.[1] ?? 0;
  const [[aftX = 0, aftY = 0], [foreX = 0, foreY = 0]] = [outline[after - 1] ?? [], outline[after] ?? []];
  return aftY + ((foreY - aftY) * (x - aftX)) / (foreX - aftX);
}

test("its own line is read where its mesh's faces cross its waterline", () => {
  const line = waterlineOf(diamond());
  assert.equal(line.length, STATIONS);
  assert.ok(line.every((share) => share >= 0 && share <= 1));
  const middle = lineAt(line, 0);
  assert.ok(middle > 0.6, `full amidships: ${middle}`);
  assert.ok(lineAt(line, 0.95) < middle && lineAt(line, -0.95) < middle, 'fining to its ends');
});

test('its footprint keeps inside its hull from its stern to its bow, a thin stern post and all', () => {
  const line = waterlineOf(walled(FRIGATE_LINE));
  for (let step = 0; step <= 400; step++) {
    const share = (step / 400) * 2 - 1;
    const footprint = 3 * HULL_FIT * lineAt(line, share);
    const hull = halfBeamAt(FRIGATE_LINE, 19 * HULL_FIT * share);
    assert.ok(
      footprint <= hull + 0.02,
      `at ${share.toFixed(3)} of its half length: ${footprint} past its hull's ${hull}`,
    );
  }
  for (const share of [-0.75, -0.5, 0.5, 0.85]) {
    const hull = halfBeamAt(FRIGATE_LINE, 19 * HULL_FIT * share);
    assert.ok(3 * HULL_FIT * lineAt(line, share) > hull - 0.35, `near its hull at ${share} of its half length`);
  }
  const past = waterlineOf(walled([...FRIGATE_LINE, [19.5, 2], [20, 2.5]]));
  assert.ok(Math.abs(lineAt(past, 0.95) - lineAt(line, 0.95)) < 0.01, 'a face past its bow is no part of its line');
  assert.ok(lineAt(line, 0) > 0.95, 'whole amidships');
  assert.ok(lineAt(line, 0.5) > 0.9, 'full forward of amidships');
});

test('a hull whose mesh has not come keeps the fair line, and takes its own once it has', async () => {
  const lines = new HullLines(async () => diamond());
  assert.equal(lines.line(2), FAIR_LINE);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.notEqual(lines.line(2), FAIR_LINE);
  assert.deepEqual([...lines.table().slice(2 * STATIONS, 3 * STATIONS)], [...lines.line(2)]);
  assert.deepEqual([...lines.table().slice(0, STATIONS)], [...FAIR_LINE]);
  assert.ok(lineAt(FAIR_LINE, 1) < 0.05 && lineAt(FAIR_LINE, 0) > 0.95, 'the fair line is pointed at its bow');
});
