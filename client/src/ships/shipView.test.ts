import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SHIP_PARTS } from '../textures/shipPictures.ts';
import { SAIL_COLUMNS, SAIL_ROWS } from './sails.ts';
import { VERTEX_BYTES } from './shipMesh.ts';
import type { SailCorners } from './sails.ts';
import { canvasVertices, mastheadOf, shipSphere, shipTurn, sphereAt } from './shipView.ts';

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

test("its canvas wears the sail's picture, and its flag the layer it is given", () => {
  const grid = new Float32Array(SAIL_COLUMNS * SAIL_ROWS * 3);
  const bytes = canvasVertices([grid, grid], [grid, grid], [SHIP_PARTS.indexOf('sail'), 7]);
  const partOf = (sail: number) => new DataView(bytes).getUint8(sail * SAIL_COLUMNS * SAIL_ROWS * VERTEX_BYTES + 24);
  assert.deepEqual([partOf(0), partOf(1)], [SHIP_PARTS.indexOf('sail'), 7]);
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
