import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Gpu } from '../gpu.ts';
import { type Face } from '../ui/text.ts';
import type { Interface } from '../ui/ui.ts';
import { fakeInterface } from '../ui/uiForTests.ts';
import { PagePanels } from './pagePanels.ts';

test('the panels take the pad only while they hold the player: the stick walks the player until a control has focus', () => {
  const page = globalThis as unknown as Record<string, unknown>;
  const stick = { axes: [0, 0, 0, 0] };
  Object.defineProperty(navigator, 'getGamepads', {
    value: () => [{ mapping: 'standard', axes: stick.axes, buttons: [] }],
    configurable: true,
  });
  Object.assign(page, {
    addEventListener: () => undefined,
    document: { pointerLockElement: null },
    window: { devicePixelRatio: 1 },
    devicePixelRatio: 1,
  });
  const canvas = {
    tabIndex: 0,
    width: 1280,
    height: 720,
    clientWidth: 1280,
    clientHeight: 720,
    style: { cursor: '' },
    addEventListener: () => undefined,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  };
  const panels = new PagePanels(
    {} as Gpu,
    canvas as unknown as HTMLCanvasElement,
    new Promise<Face>(() => undefined),
    () => false,
  );
  const { ui } = fakeInterface();
  Object.assign(ui.renderer, { present: () => undefined });
  (panels as unknown as { ui: Interface }).ui = ui;
  panels.stack.add(() => ({ id: 'tool', press: true, width: 100, height: 30 }));
  const frame = (axes: number[]) => {
    stick.axes = axes;
    panels.hear();
    panels.draw();
  };
  frame([0, 0, 0, 0]);
  frame([0.9, 0, 0, 0]);
  frame([0.9, 0, 0, 0]);
  assert.ok(!panels.takesKeys);
  assert.notEqual(ui.cursor, 'none', 'no cursor: the stick walks the player');
  assert.equal(canvas.style.cursor.startsWith('image-set('), true, 'the mouse wears the gauntlet');
  ui.focusOn('tool');
  frame([0, 0, 0, 0]);
  assert.ok(panels.takesKeys);
  frame([0.9, 0, 0, 0]);
  assert.equal(ui.cursor, 'none', 'with a control focused the stick is the cursor’s');
  for (const name of ['addEventListener', 'document', 'window', 'devicePixelRatio']) delete page[name];
});
