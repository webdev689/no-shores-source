import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BAND, EDGE, OUTSET, frameSvg } from './frame.ts';
import { ROLES, kitCss } from './kit.ts';
import { TONES } from './tones.ts';

/** The colour of the frame's pixel at (x, y), or null where the picture is clear. */
function pixelAt(svg: string, x: number, y: number): string | null {
  const found = new RegExp(`<rect x='${x}' y='${y}' width='1' height='1' fill='([^']+)'/>`).exec(svg);
  return found?.[1] ?? null;
}

test('the kit writes paint only: no width, padding or size, so dressing a surface never moves it', () => {
  const css = kitCss();
  assert.doesNotMatch(css, /(^|[\s;{])(width|height|padding|margin|border-width|min-height|min-width|font-size)\s*:/m);
  assert.doesNotMatch(css, /border(-(top|right|bottom|left))?\s*:\s*\d/, 'no border shorthand that could set a width');
});

test('every role is one class, and each is dressed', () => {
  const css = kitCss();
  const classes = Object.values(ROLES);
  assert.equal(new Set(classes).size, classes.length);
  for (const name of classes) {
    assert.match(name, /^plus-[a-z]+$/);
    assert.ok(css.includes(`.${name}`), `${name} is dressed`);
  }
});

test('every press answers the same way: brass under the pointer, sunk while held, flat when it cannot be pressed', () => {
  const css = kitCss();
  for (const name of [ROLES.button, ROLES.primary]) {
    for (const state of [':hover', ':focus-visible', ':active:not(:disabled)', ':disabled'])
      assert.ok(css.includes(`.${name}${state}`), `${name}${state}`);
  }
  assert.ok(css.includes(`.${ROLES.warn}:hover:not(:disabled)`), 'a warn lights in blood, never brass');
});

test('the window frame is a square picture used at 1:1 that lands its inner 2 px on the box border', () => {
  assert.equal(OUTSET, EDGE - 2);
  const svg = frameSvg();
  const size = BAND * 2 + 1;
  assert.match(svg, new RegExp(`width='${size}' height='${size}'`));
  assert.match(svg, /shape-rendering='crispEdges'/);
});

test('each edge is lit from the top left, and each corner carries a brass fitting with its rivet', () => {
  const svg = frameSvg();
  const size = BAND * 2 + 1;
  const middle = BAND;
  assert.equal(pixelAt(svg, middle, 1), TONES.stoneHi, 'the top edge is lit');
  assert.equal(pixelAt(svg, 1, middle), TONES.stoneHi, 'the left edge is lit');
  assert.equal(pixelAt(svg, middle, size - 2), TONES.stoneDark, 'the bottom edge is shaded');
  assert.equal(pixelAt(svg, size - 2, middle), TONES.stoneDark, 'the right edge is shaded');
  assert.equal(pixelAt(svg, middle, EDGE), null, 'inside the edge the picture is clear');
  for (const [x, y] of [
    [5, 5],
    [size - 6, 5],
    [5, size - 6],
    [size - 6, size - 6],
  ] as const)
    assert.equal(pixelAt(svg, x, y), TONES.brassHi, `the rivet's lit pixel at ${x}, ${y}`);
});
