import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QUAD_FLOATS, QuadList } from '../ui/quads.ts';
import type { UiRenderer } from '../ui/uiRenderer.ts';
import { lidOf, lidShut } from './eyelids.ts';

/** The quads a lid draws in a box 800 by 300, each as its box, colour and turn. */
function drawn(top: boolean, shut: number, light: number) {
  const quads = new QuadList();
  lidOf(top, shut, light)(
    { quads } as unknown as UiRenderer,
    { x: 0, y: 0, width: 800, height: 300 },
    1,
    {
      x: -1e6,
      y: -1e6,
      width: 2e6,
      height: 2e6,
    },
    1,
  );
  return Array.from({ length: quads.count }, (unused, index) => {
    const floats = quads.data.subarray(index * QUAD_FLOATS, (index + 1) * QUAD_FLOATS);
    return {
      height: floats[3] ?? 0,
      colour: [floats[8] ?? 0, floats[9] ?? 0, floats[10] ?? 0, floats[11] ?? 0],
      turn: floats[18] ?? 0,
    };
  });
}

test('the upper lid leads and the lower lags, the two meeting shut', () => {
  const half = lidShut(0.5);
  assert.ok(half.top > 0.5 && half.bottom < 0.5, JSON.stringify(half));
  assert.deepEqual(lidShut(1), { top: 1, bottom: 1 });
  assert.deepEqual(lidShut(0), { top: 0, bottom: 0 });
});

test('shut, a lid glows warm red with the light through it; open or in the dark it is near black', () => {
  const body = (shut: number, light: number) => drawn(true, shut, light)[0]?.colour ?? [];
  const [red = 0, green = 0] = body(1, 1);
  assert.ok(red > 0.2 && red > green * 3, `warm red: ${body(1, 1)}`);
  assert.ok((body(1, 0)[0] ?? 1) < 0.03, 'no light, no glow');
  assert.ok((body(0.2, 1)[0] ?? 1) < 0.03, 'barely down, no glow yet');
});

test("a lid's edge fades into the eye, and its lashes show as it comes down", () => {
  const faint = drawn(true, 0.9, 0).filter(({ colour }) => (colour[3] ?? 0) > 0 && (colour[3] ?? 0) < 0.5);
  assert.ok(faint.length > 20, `${faint.length} soft quads`);
  const lashes = (shut: number) => drawn(true, shut, 0).filter(({ turn }) => turn !== 0).length;
  assert.equal(lashes(0.05), 0, 'none while barely down');
  assert.ok(lashes(0.9) >= 50, `${lashes(0.9)} lashes along the upper lid`);
  const lower = drawn(false, 0.9, 0).filter(({ turn }) => turn !== 0).length;
  assert.ok(lower > 20 && lower < lashes(0.9), `${lower} on the lower`);
});
