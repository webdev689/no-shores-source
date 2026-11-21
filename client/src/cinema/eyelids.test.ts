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
      x: floats[0] ?? 0,
      y: floats[1] ?? 0,
      width: floats[2] ?? 0,
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

test('shut, a lid glows warm red with the light through it, most toward the eye; open or in the dark near black', () => {
  // The body's bands, from the far edge of the view to the curve: the first sixteen quads.
  const bands = (shut: number, light: number) => drawn(true, shut, light).slice(0, 16);
  const lit = bands(1, 1);
  const [far, near] = [lit[0]?.colour ?? [], lit.at(-1)?.colour ?? []];
  const [red = 0, green = 0] = near;
  assert.ok(red > 0.2 && red > green * 3, `warm red by the eye: ${near}`);
  assert.ok((far[0] ?? 1) < red * 0.6, `dimmer at the brow: ${far}`);
  const brightest = (shut: number, light: number) =>
    Math.max(...bands(shut, light).map(({ colour }) => colour[0] ?? 1));
  assert.ok(brightest(1, 0) < 0.03, 'no light, no glow');
  assert.ok(brightest(0.2, 1) < 0.03, 'barely down, no glow yet');
});

test('each lid closes the whole width of its box, though its tip stands off the middle', () => {
  for (const top of [true, false]) {
    // The rows of the curve, by where each stands: none runs on flat past where the curve has come in.
    const rows = new Map<number, [number, number]>();
    for (const { x, y, width, height, turn } of drawn(top, 0.9, 0)) {
      if (height !== 1 || turn !== 0) continue;
      const [left, right] = rows.get(y) ?? [Infinity, -Infinity];
      rows.set(y, [Math.min(left, x), Math.max(right, x + width)]);
    }
    const ordered = [...rows.entries()].sort(([one], [two]) => (top ? one - two : two - one)).map(([, span]) => span);
    const [widest, tip] = [ordered[0] ?? [0, 0], ordered.at(-1) ?? [0, 0]];
    assert.ok(widest[0] < 1 && widest[1] > 799, `the widest row spans the box: ${widest}`);
    assert.ok(tip[0] > 100 && tip[1] < 700, `the tip is narrow: ${tip}`);
    assert.ok(Math.abs((tip[0] + tip[1]) / 2 - 400) > 5, `off the middle: ${tip}`);
  }
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
