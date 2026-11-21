import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QUAD_FLOATS, QuadList } from '../ui/quads.ts';
import type { UiRenderer } from '../ui/uiRenderer.ts';
import { lidDrop, lidOf, lidShut } from './eyelids.ts';

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

/** The spans of column `x` the two lids cover wholly on a view 1920 by 1080 at `shut`, laid as the screen lays them. */
function covered(shut: number, x: number): (readonly [number, number])[] {
  const [width, height] = [1920, 1080];
  const [wide, tall] = [Math.round(width * 1.1), Math.round(height * 0.52)];
  const spans: (readonly [number, number])[] = [];
  for (const top of [true, false]) {
    const own = lidShut(shut)[top ? 'top' : 'bottom'];
    const y = (top ? 0 : height - tall) + Math.round(lidDrop(top, own, tall));
    const quads = new QuadList();
    lidOf(top, own, 0)(
      { quads } as unknown as UiRenderer,
      { x: (width - wide) / 2, y, width: wide, height: tall },
      1,
      {
        x: -1e6,
        y: -1e6,
        width: 2e6,
        height: 2e6,
      },
      1,
    );
    for (let index = 0; index < quads.count; index++) {
      const [left = 0, upper = 0, across = 0, down = 0] = quads.data.subarray(index * QUAD_FLOATS);
      const [alpha = 0, turn = 0] = [quads.data[index * QUAD_FLOATS + 11], quads.data[index * QUAD_FLOATS + 18]];
      if (alpha > 0.99 && turn === 0 && x >= left && x < left + across) spans.push([upper, upper + down]);
    }
  }
  return spans;
}

/** The share of column `x`'s height, 0 to 1, left open between the lids at `shut`. */
function open(shut: number, x: number): number {
  const spans = covered(shut, x).sort(([one], [two]) => one - two);
  let [reached, gaps] = [0, 0];
  for (const [from, to] of spans) {
    gaps += Math.max(0, Math.min(1080, from) - reached);
    reached = Math.max(reached, to);
  }
  return (gaps + Math.max(0, 1080 - reached)) / 1080;
}

test('shut, the lids close the whole view, from edge to edge; nearly shut, an almond open in the middle alone', () => {
  for (const x of [0, 40, 300, 880, 960, 1500, 1880, 1919]) assert.equal(open(1, x), 0, `column ${x} shut`);
  const slit = [40, 480, 900, 1440, 1880].map((x) => open(0.95, x));
  assert.ok((slit[2] ?? 0) > 0.02, `open in the middle: ${slit}`);
  assert.ok((slit[0] ?? 1) === 0 && (slit[4] ?? 1) === 0, `closed at the corners: ${slit}`);
  assert.ok((slit[1] ?? 0) < (slit[2] ?? 0) && (slit[3] ?? 0) < (slit[2] ?? 0), `widest about the middle: ${slit}`);
  assert.equal(open(0, 960), 1, 'open, nothing on the view');
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
