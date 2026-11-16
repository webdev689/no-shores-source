import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shipTurn } from './shipView.ts';

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
