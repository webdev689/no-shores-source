import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Box } from '../ui/quads.ts';
import type { UiRenderer } from '../ui/uiRenderer.ts';
import { edges, grownBy } from './barDraw.ts';

/** A renderer that keeps each quad's box and colour as it is added. */
function keeping(): { readonly ui: UiRenderer; readonly added: [Box, number[]][] } {
  const added: [Box, number[]][] = [];
  const ui = {
    quads: { add: (box: Box, colour: number[]) => added.push([box, [...colour]]) },
  } as unknown as UiRenderer;
  return { ui, added };
}

test('a border lies inside its box as CSS lists its sides, the top and foot across, the sides between', () => {
  const { ui, added } = keeping();
  const box = { x: 10, y: 20, width: 30, height: 40 };
  edges({ ui, box, scale: 1, clip: box }, box, ['#ffffff', '#000000'], [1, 1, 2]);
  assert.deepEqual(
    added.map(([part]) => part),
    [
      { x: 10, y: 20, width: 30, height: 1 },
      { x: 10, y: 58, width: 30, height: 2 },
      { x: 10, y: 21, width: 1, height: 37 },
      { x: 39, y: 21, width: 1, height: 37 },
    ],
  );
  assert.deepEqual(
    added.map(([, colour]) => colour[0]),
    [1, 1, 0, 0],
    'the top and foot the first colour, the sides the second',
  );
});

test('a side with no colour is not drawn and takes no room; a box grows or shrinks by a step all round', () => {
  const { ui, added } = keeping();
  const box = { x: 10, y: 20, width: 30, height: 40 };
  edges({ ui, box, scale: 2, clip: box }, box, ['', '', '', '#ff0000']);
  assert.deepEqual(
    added.map(([part]) => part),
    [{ x: 10, y: 20, width: 2, height: 40 }],
  );
  assert.deepEqual(grownBy(box, -2), { x: 12, y: 22, width: 26, height: 36 });
});
