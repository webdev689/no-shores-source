import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Node } from '../ui/node.ts';
import { uiScale } from '../ui/uiRenderer.ts';
import { inwardAt, PANEL_WIDTH, panelCss } from './panelKit.ts';
import { inView, labelNode, onScreen } from './viewMarks.ts';

/** At these screens the interface's pixel is not a CSS pixel: 1.25 draws it at 1 device pixel, 1.5 at 2. */
const FRACTIONAL = [1.25, 1.5];

test('the panel is as wide in CSS pixels as the interface draws it, so the view starts at its edge', () => {
  assert.deepEqual(
    [1, 1.25, 1.5, 2].map((ratio) => [inwardAt(ratio), panelCss(ratio)]),
    [
      [1, 300],
      [1.25, 240],
      [0.75, 400],
      [1, 300],
    ],
  );
});

test('a name, a plate and a readout over the view stand where the view shows their point', () => {
  for (const ratio of FRACTIONAL) {
    const inward = ratio / uiScale(ratio);
    const viewLeft = (PANEL_WIDTH * uiScale(ratio)) / ratio;
    // The view's point (100, 50) in CSS pixels is the page's (viewLeft + 100, 50): in the interface's pixels, times
    // inward.
    const [atX, atY] = [(viewLeft + 100) * inward, 50 * inward];
    const label = labelNode({ x: 100, y: 50, text: 'Saltmere', colour: '#fff' }, PANEL_WIDTH, inward);
    assert.ok(Math.abs((label.float?.x ?? 0) - atX) < 1e-9, `the name's x at ${ratio}`);
    const plate = onScreen(
      { width: 40, height: 10, float: { to: 'screen', x: 100, y: 50 } } satisfies Node,
      PANEL_WIDTH,
      inward,
    );
    assert.ok(Math.abs((plate.float?.x ?? 0) - atX) < 1e-9, `the plate's x at ${ratio}`);
    assert.ok(Math.abs((plate.float?.y ?? 0) - atY) < 1e-9, `the plate's y at ${ratio}`);
    const readout = inView({ width: 10, height: 10 }, PANEL_WIDTH, 800, 600, inward);
    assert.deepEqual([readout.width, readout.height], [800 * inward, 600 * inward], `the readout's box at ${ratio}`);
  }
});
