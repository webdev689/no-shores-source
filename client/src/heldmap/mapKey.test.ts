import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CoastField } from './coastField.ts';
import type { Rect } from './heldMapLaw.ts';
import { keyPlace, keySize, landUnder } from './mapKey.ts';

const INK = { width: 400, height: 300, margin: 20 } as const;
const SIZE = { width: 100, height: 80 } as const;
const ROW = { width: 380, height: 16 } as const;
const noLand = () => false;

test('the key keeps its corner while it stays clear, and moves only when a word comes under it', () => {
  const first = keyPlace(INK, SIZE, ROW, 1, [], noLand, null);
  assert.equal(first?.corner, 'lower-left');
  assert.deepEqual(first?.box, { x: 10, y: 210, width: 100, height: 80 });
  const word: Rect = { x: 20, y: 250, width: 60, height: 14 };
  const moved = keyPlace(INK, SIZE, ROW, 1, [word], noLand, first);
  assert.equal(moved?.corner, 'lower-right');
  // The word gone again, the key stays where it moved: it never moves back and forth.
  assert.equal(keyPlace(INK, SIZE, ROW, 1, [], noLand, moved)?.corner, 'lower-right');
});

test('the key never covers land: it takes a clear corner, or the margin under the map when every corner is taken', () => {
  const landLowerLeft = (box: Rect) => box.x < 200 && box.y > 150;
  assert.equal(keyPlace(INK, SIZE, ROW, 1, [], landLowerLeft, null)?.corner, 'lower-right');
  const everywhere = () => true;
  assert.deepEqual(keyPlace(INK, SIZE, ROW, 1, [], everywhere, null), {
    corner: 'margin',
    box: { x: 10, y: 302, width: 380, height: 16 },
  });
  assert.equal(
    keyPlace(INK, SIZE, { width: 500, height: 16 }, 1, [], everywhere, null),
    null,
    'a row wider than the map',
  );
});

test('the key is one panel: the holders in two columns under their title, then the levels, at most a third as wide as one row', () => {
  const measured = keySize({ font: '', measureText: (text: string) => ({ width: text.length * 7 }) });
  // Four lines of 16 with three gaps of 2 and a padding of 7 above and below.
  assert.equal(measured.height, 84);
  assert.ok(measured.width < measured.row / 2.5, `${measured.width} against ${measured.row}`);
});

test('land under a box is a discovered island’s, asked across the whole box', () => {
  // Four cells of 1 km: the lower right one land of island 0, the rest sea.
  const field: CoastField = {
    columns: 2,
    rows: 2,
    cellM: 1_000,
    distance: Float32Array.from([500, 500, 500, -200]),
    island: Uint8Array.from([0, 0, 0, 0]),
  };
  const view = { left: 0, top: 0, scale: 0.1 };
  assert.equal(landUnder(field, 1, view, { x: 0, y: 0, width: 90, height: 90 }), false);
  assert.equal(landUnder(field, 1, view, { x: 0, y: 0, width: 110, height: 110 }), true, 'its corner reaches the land');
  assert.equal(landUnder(field, 0, view, { x: 0, y: 0, width: 200, height: 200 }), false, 'an undiscovered island');
});
