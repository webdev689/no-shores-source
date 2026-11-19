import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SHIP_PARTS } from '../textures/shipPictures.ts';
import { SAIL_COLUMNS, SAIL_ROWS } from './sails.ts';
import { VERTEX_BYTES } from './shipMesh.ts';
import { canvasVertices, mastheadOf, shipTurn } from './shipView.ts';

/** Where the turn takes a vector of her own frame, in the world's (east, south, up). */
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

test('her bow points along her heading and her starboard side to its right', () => {
  near(turned(shipTurn(0, 0, 0), [1, 0, 0]), [0, -1, 0]);
  near(turned(shipTurn(0, 0, 0), [0, 1, 0]), [1, 0, 0]);
  near(turned(shipTurn(Math.PI / 2, 0, 0), [1, 0, 0]), [1, 0, 0]);
  near(turned(shipTurn(Math.PI / 2, 0, 0), [0, 1, 0]), [0, 1, 0]);
});

test('a pitch lifts her bow and a roll puts her starboard side down', () => {
  const pitch = 0.1;
  near(turned(shipTurn(0, pitch, 0), [1, 0, 0]), [0, -Math.cos(pitch), Math.sin(pitch)]);
  const roll = 0.2;
  near(turned(shipTurn(0, 0, roll), [0, 1, 0]), [Math.cos(roll), 0, -Math.sin(roll)]);
  near(turned(shipTurn(0, 0, roll), [0, 0, 1]), [Math.sin(roll), 0, Math.cos(roll)]);
});

test("her masthead is her spars' highest point, whatever else stands higher", () => {
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

test("her canvas wears the sail's picture, and her flag the layer it is given", () => {
  const grid = new Float32Array(SAIL_COLUMNS * SAIL_ROWS * 3);
  const bytes = canvasVertices([grid, grid], [grid, grid], [SHIP_PARTS.indexOf('sail'), 7]);
  const partOf = (sail: number) => new DataView(bytes).getUint8(sail * SAIL_COLUMNS * SAIL_ROWS * VERTEX_BYTES + 24);
  assert.deepEqual([partOf(0), partOf(1)], [SHIP_PARTS.indexOf('sail'), 7]);
});
