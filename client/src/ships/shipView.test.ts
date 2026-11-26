import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SHIP_PARTS } from '../textures/shipPictures.ts';
import { SAIL_COLUMNS, SAIL_ROWS, SailRig } from './sails.ts';
import { VERTEX_BYTES } from './shipMesh.ts';
import type { SailCorners } from './sails.ts';
import { flagFlat } from './flag.ts';
import { canvasVertices, mastheadOf, ShipView, shipSphere, shipTurn, sphereAt } from './shipView.ts';

/** Where the turn takes a vector of its own frame, in the world's (east, south, up). */
function turned(turn: Float32Array, vector: readonly [number, number, number]): number[] {
  return [0, 1, 2].map((row) =>
    [0, 1, 2].reduce((sum, column) => sum + (turn[column * 4 + row] ?? 0) * vector[column], 0),
  );
}

function near(found: readonly number[], wanted: readonly number[]): void {
  assert.ok(
    found.every((value, index) => Math.abs(value - (wanted[index] ?? Number.NaN)) < 1e-6),
    `${found.join(', ')} is not ${wanted.join(', ')}`,
  );
}

test('its bow points along its heading and its starboard side to its right', () => {
  near(turned(shipTurn(0, 0, 0), [1, 0, 0]), [0, -1, 0]);
  near(turned(shipTurn(0, 0, 0), [0, 1, 0]), [1, 0, 0]);
  near(turned(shipTurn(Math.PI / 2, 0, 0), [1, 0, 0]), [1, 0, 0]);
  near(turned(shipTurn(Math.PI / 2, 0, 0), [0, 1, 0]), [0, 1, 0]);
});

test('a pitch lifts its bow and a roll puts its starboard side down', () => {
  const pitch = 0.1;
  near(turned(shipTurn(0, pitch, 0), [1, 0, 0]), [0, -Math.cos(pitch), Math.sin(pitch)]);
  const roll = 0.2;
  near(turned(shipTurn(0, 0, roll), [0, 1, 0]), [Math.cos(roll), 0, -Math.sin(roll)]);
  near(turned(shipTurn(0, 0, roll), [0, 0, 1]), [Math.sin(roll), 0, Math.cos(roll)]);
});

test("its masthead is its spars' highest point, whatever else stands higher", () => {
  const points = [
    [0, 0, 5, 'spar'],
    [1, 0.2, 14, 'spar'],
    [3, 0, 20, 'sail'],
    [0, 0, 9, 'spar'],
  ] as const;
  const vertices = new ArrayBuffer(points.length * VERTEX_BYTES);
  const view = new DataView(vertices);
  points.forEach(([x, y, z, part], vertex) => {
    [x, y, z].forEach((value, axis) => view.setFloat32(vertex * VERTEX_BYTES + axis * 4, value, true));
    view.setUint8(vertex * VERTEX_BYTES + 24, SHIP_PARTS.indexOf(part));
  });
  const mesh = { name: 'test', vertexCount: points.length, vertices, indices: new Uint32Array(0) };
  const top = mastheadOf({ ...mesh, waterline: { lengthM: 1, beamM: 1, draughtM: 1 } });
  near(top, [1, 0.2, 14]);
});

test('its sphere holds a mast fallen flat about its foot, so its shadow is cast as it falls', () => {
  // A bow, a stern and a mast 30 m tall stepped 12 m forward of its middle.
  const points = [
    [-20, 0, 0],
    [25, 3, 0],
    [12, 0, 0],
    [12, 0, 30],
  ] as const;
  const vertices = new ArrayBuffer(points.length * VERTEX_BYTES);
  const view = new DataView(vertices);
  points.forEach((point, vertex) =>
    point.forEach((value, axis) => view.setFloat32(vertex * VERTEX_BYTES + axis * 4, value, true)),
  );
  const waterline = { lengthM: 45, beamM: 6, draughtM: 2 };
  const [x, y, z, radius] = shipSphere(
    { name: 'test', vertexCount: points.length, vertices, indices: new Uint32Array(0), waterline },
    [],
  );
  // The masthead laid flat 30 m from its foot, any way round.
  for (let bearing = 0; bearing < 360; bearing += 15) {
    const turn = (bearing * Math.PI) / 180;
    const top = [12 + 30 * Math.cos(turn), 30 * Math.sin(turn), 0];
    assert.ok(Math.hypot(top[0] - x, top[1] - y, top[2] - z) <= radius, `fallen at ${bearing} degrees`);
  }
});

test("its canvas wears the sail's picture, and its flag the layer it is given", () => {
  const grid = new Float32Array(SAIL_COLUMNS * SAIL_ROWS * 3);
  const view = canvasVertices([grid, grid], [grid, grid], [SHIP_PARTS.indexOf('sail'), 7]);
  const partOf = (sail: number) => view.getUint8(sail * SAIL_COLUMNS * SAIL_ROWS * VERTEX_BYTES + 24);
  assert.deepEqual([partOf(0), partOf(1)], [SHIP_PARTS.indexOf('sail'), 7]);
});

test('a canvas laid again lays into the bytes it was given, the same as afresh, and only as many as it needs', () => {
  const grid = Float32Array.from({ length: SAIL_COLUMNS * SAIL_ROWS * 3 }, (unused, index) => (index * 7) % 5);
  const fresh = canvasVertices([grid, grid], [grid, grid]);
  const kept = new DataView(new ArrayBuffer(fresh.byteLength * 2));
  const laid = canvasVertices([grid, grid], [grid, grid], [], kept);
  assert.equal(laid.buffer, kept.buffer);
  assert.equal(laid.byteLength, fresh.byteLength);
  assert.deepEqual(new Uint8Array(laid.buffer, 0, laid.byteLength), new Uint8Array(fresh.buffer));
});

test('its sphere holds its mesh and its sails twice over, and goes where it lies, turned and scaled', () => {
  const points = [
    [-12, -3, -2],
    [14, 3, 1],
    [2, 0, 22],
  ];
  const vertices = new ArrayBuffer(points.length * VERTEX_BYTES);
  const view = new DataView(vertices);
  points.forEach((point, vertex) =>
    point.forEach((value, axis) => view.setFloat32(vertex * VERTEX_BYTES + axis * 4, value, true)),
  );
  const mesh = { name: 'test', vertexCount: points.length, vertices, indices: new Uint32Array(0) };
  const waterline = { lengthM: 26, beamM: 6, draughtM: 2 };
  const jib: SailCorners = { kind: 'stay', tack: [20, 0, 2], clew: [10, 0, 1], head: [2, 0, 20] };
  const own = shipSphere({ ...mesh, waterline }, [jib]);
  const corners = [...points, jib.tack, jib.clew, jib.head];
  const farthest = Math.max(...corners.map(([x = 0, y = 0, z = 0]) => Math.hypot(x - own[0], y - own[1], z - own[2])));
  near([own[0], own[1], own[2]], [4, 0, 10]);
  near([own[3]], [farthest * 2]);
  const place = { x: 500, y: -300, z: 1, heading: 2.1, pitch: 0.05, roll: -0.2, scale: 1.5 };
  const eye = [480, -250, 12] as const;
  const [x, y, z, radius] = sphereAt(own, place, eye);
  const turn = shipTurn(place.heading, place.pitch, place.roll);
  for (const point of corners) {
    const world = turned(turn, point as [number, number, number]).map((value) => value * place.scale);
    const away = Math.hypot(
      world[0]! + place.x - eye[0] - x,
      world[1]! + place.y - eye[1] - y,
      world[2]! + place.z - eye[2] - z,
    );
    assert.ok(away <= radius / 2 + 1e-6, `${point.join(', ')} lies ${away} m out`);
  }
  near([radius], [own[3] * 1.5]);
});

test('a settled rig lays its sails once, but its flag again each frame, flying on the clock', () => {
  const gaff: SailCorners = {
    kind: 'gaff',
    tack: [-0.059, 0, 1.409],
    clew: [-2.859, 0, 1.491],
    throat: [-0.077, 0, 3.509],
    peak: [-2.377, 0, 4.391],
  };
  const writes: { buffer: string; offset: number; bytes: number }[] = [];
  const named = (buffer: string) => ({ label: buffer });
  const view = Object.create(ShipView.prototype) as ShipView;
  Object.assign(view, {
    slots: [{ uniforms: named('uniforms'), canvas: named('canvas'), canvasIndices: named('indices') }],
    sails: [gaff],
    paint: { atM: 0, rise: 0 },
    tags: { yards: [], pivots: [null], masts: [{ footZ: 0, topZ: 5 }] },
    masthead: [0, 0, 5],
    waterline: { lengthM: 10, beamM: 3 },
    flat: [flagFlat()],
    laid: [],
    device: {
      queue: {
        writeBuffer: (buffer: { label: string }, offset: number, data: ArrayBufferLike | ArrayBufferView) =>
          void writes.push({ buffer: buffer.label, offset, bytes: data.byteLength }),
      },
    },
  });
  const prepare = (rig: SailRig) =>
    (view as unknown as { prepare(...args: unknown[]): number | null }).prepare(
      { x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0 },
      { fromEye: new Float32Array(16), eye: [0, 0, 0] },
      0,
      { side: 'player' },
      rig,
    );
  const rig = new SailRig([gaff]);
  for (let tick = 0; tick < 600; tick++) rig.step(1 / 60, { offDeg: 90, set: true }, tick / 60);
  assert.ok((prepare(rig) ?? 0) > 0);
  const flagAt = SAIL_COLUMNS * SAIL_ROWS * VERTEX_BYTES;
  const canvasWrites = () => writes.filter((write) => write.buffer === 'canvas');
  assert.deepEqual(
    canvasWrites().map((write) => write.offset),
    [0],
    'laid whole at first',
  );
  writes.length = 0;
  prepare(rig);
  assert.deepEqual(canvasWrites(), [], 'the same frame again, a shadow pass: nothing laid');
  const changes = rig.changes;
  rig.step(1 / 60, { offDeg: 90, set: true }, 10.1);
  assert.equal(rig.changes, changes, 'the rig settled');
  prepare(rig);
  assert.deepEqual(canvasWrites(), [{ buffer: 'canvas', offset: flagAt, bytes: flagAt }], 'its flag alone, flying on');
});
