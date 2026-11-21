import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Node, Picture } from './node.ts';
import { PAD_CURSOR, curvedThrow, pullTargetAmong, stepPadCursor } from './padCursor.ts';
import type { Box } from './quads.ts';
import type { UiEvent } from './ui.ts';
import { fakeInterface } from './uiForTests.ts';

const near = (one: number, two: number, within = 1e-6) => Math.abs(one - two) <= within;
const FRAME_S = 1 / 60;
const SPEED = 900;
const feel = () => ({ across: 0, down: 0, full: 0 });
/** `frames` steps with the same stick, the steps summed. */
function run(state: ReturnType<typeof feel>, frames: number, move: Parameters<typeof stepPadCursor>[1]) {
  const sum = { x: 0, y: 0 };
  for (let frame = 0; frame < frames; frame++) {
    const step = stepPadCursor(state, move);
    [sum.x, sum.y] = [sum.x + step.x, sum.y + step.y];
  }
  return sum;
}

test('the curve: nothing inside the dead zone, a full lean is 1, half the throw past it well under half', () => {
  assert.equal(curvedThrow(0.05), 0);
  assert.equal(curvedThrow(0.2), 0);
  assert.equal(curvedThrow(1), 1);
  const half = curvedThrow(0.6);
  assert.ok(near(half, 0.5 ** PAD_CURSOR.CURVE), `curved: ${half}`);
  assert.ok(half < 0.35, 'a light lean is a fine move');
});

test('a flick eases in, a let-go stops dead, and a long full lean climbs to the boost', () => {
  const state = feel();
  const lean = { x: 1, y: 0, seconds: FRAME_S, speed: SPEED };
  const first = stepPadCursor(state, lean);
  assert.ok(first.x > 0 && first.x < SPEED * FRAME_S * 0.5, `the first frame a share of the full step: ${first.x}`);
  run(state, 20, lean);
  const cruise = stepPadCursor(state, lean);
  assert.ok(near(cruise.x, SPEED * FRAME_S, 0.5), `ramped to the full speed: ${cruise.x}`);
  assert.deepEqual(stepPadCursor(state, { ...lean, x: 0 }), { x: 0, y: 0 }, 'let go, nothing coasts past a press');
  const boosted = feel();
  const down = { x: 0, y: 1, seconds: FRAME_S, speed: SPEED };
  run(boosted, Math.ceil((PAD_CURSOR.BOOST_AFTER_S + PAD_CURSOR.BOOST_RAMP_S) / FRAME_S) + 30, down);
  const fast = stepPadCursor(boosted, down);
  assert.ok(
    near(fast.y, SPEED * PAD_CURSOR.BOOST * FRAME_S, 0.05),
    `held full, the boost, and down is down: ${fast.y}`,
  );
});

test('over a press it slows; light or at rest it is drawn to the middle; a firm push is never pulled; a boost goes through', () => {
  const [free, over] = [feel(), feel()];
  const lean = { x: 1, y: 0, seconds: FRAME_S, speed: SPEED };
  run(free, 20, lean);
  run(over, 20, { ...lean, over: true });
  const plain = stepPadCursor(free, lean);
  const slowed = stepPadCursor(over, { ...lean, over: true });
  assert.ok(near(slowed.x, plain.x * PAD_CURSOR.FRICTION, 0.05), `slowed over a press: ${slowed.x} of ${plain.x}`);
  const rest = { x: 0, y: 0, seconds: FRAME_S, speed: SPEED, target: { x: 110, y: 50 }, at: { x: 100, y: 50 } };
  const pulled = stepPadCursor(feel(), rest);
  assert.ok(pulled.x > 0 && pulled.x <= 10 && pulled.y === 0, `at rest it settles toward the middle: ${pulled.x}`);
  const firm = { ...rest, y: 0.9, target: { x: 300, y: 50 } };
  assert.equal(stepPadCursor(feel(), firm).x, 0, 'a firm push down is not dragged aside to a press');
  const boosting = feel();
  run(boosting, 80, lean);
  assert.ok(stepPadCursor(boosting, { ...lean, over: true }).x > SPEED * FRAME_S, 'a long full lean goes through');
});

test('its target: in a box the middle of it, within the reach the nearest, beyond it none', () => {
  const boxes: Box[] = [
    { x: 0, y: 0, width: 40, height: 20 },
    { x: 100, y: 0, width: 40, height: 20 },
  ];
  assert.deepEqual(pullTargetAmong(boxes, 10, 10), { x: 20, y: 10, inside: true });
  assert.deepEqual(
    pullTargetAmong(boxes, 90, 10),
    { x: 120, y: 10, inside: false },
    '10 off the second, 50 off the first',
  );
  assert.equal(pullTargetAmong(boxes, 70, 200), null);
});

/** Two presses over a list of five rows that scrolls, 20 px in from the view's corner. */
const press = (id: string): Node => ({ id, press: true, width: 100, height: 30 });
const ROOT: Node = {
  direction: 'column',
  padding: 20,
  gap: 20,
  children: [
    press('one'),
    press('two'),
    {
      id: 'list',
      scroll: true,
      height: 60,
      direction: 'column',
      children: [0, 1, 2, 3, 4].map((row) => press(`row${row}`)),
    },
  ],
};
const stick = (x: number, y = 0, scroll = 0): UiEvent => ({ kind: 'stick', x, y, scroll });
const REST = stick(0);

/** An interface over `ROOT` as a window holds the pad, the pictures it draws kept. */
function windowUp() {
  const { ui } = fakeInterface();
  const drawn: { key: string; box: Box }[] = [];
  ui.renderer.picture = (picture: Picture, box: Box) => void drawn.push({ key: picture.key, box });
  const frame = (events: UiEvent[] = [], keys = true) => {
    drawn.length = 0;
    ui.frame({ width: 1280, height: 720, scale: 1 }, events, FRAME_S, true, keys);
    ui.draw(ROOT);
  };
  frame();
  const spot = () => ui.pointerAt ?? { x: Number.NaN, y: Number.NaN };
  return { ui, frame, drawn, spot };
}

test('the stick brings the cursor out at the focus, drawn last as the gauntlet, the mouse’s pointer hidden', () => {
  const { ui, frame, drawn, spot } = windowUp();
  frame([
    { kind: 'pad', button: 'down' },
    { kind: 'pad', button: 'down' },
  ]);
  assert.equal(ui.focusedId, 'two');
  frame([stick(0.5), REST]);
  assert.ok(near(spot().x, 70, 0.5) && near(spot().y, 85, 0.5), `on the focus's middle: ${spot().x}, ${spot().y}`);
  assert.equal(ui.cursor, 'none');
  assert.ok(ui.hovered('two'), 'what it stands on is lit as under the pointer');
  assert.equal(drawn.at(-1)?.key, 'gauntlet:point');
  assert.deepEqual([drawn.at(-1)?.box.x, drawn.at(-1)?.box.y], [Math.round(spot().x), Math.round(spot().y)]);
});

test('A goes down at the cursor and up as it is let go, pressed meanwhile; Y right-clicks; X presses there', () => {
  const { ui, frame, drawn } = windowUp();
  frame([{ kind: 'pointer', x: 70, y: 85 }, stick(0.5), REST]);
  frame([{ kind: 'pad', button: 'accept' }]);
  assert.ok(ui.pressing('two') && !ui.clicked('two'), 'held, not yet clicked');
  assert.equal(drawn.at(-1)?.key, 'gauntlet:press');
  frame([{ kind: 'pad', button: 'accept', up: true }]);
  assert.ok(ui.clicked('two'), 'let go over it, it is pressed');
  assert.equal(drawn.at(-1)?.key, 'gauntlet:point');
  frame([{ kind: 'pad', button: 'secondary' }]);
  assert.ok(ui.rightClicked('two') && !ui.clicked('two'));
  frame([{ kind: 'pad', button: 'quick' }]);
  assert.ok(ui.clicked('two'), 'a press and its letting go in one');
});

test('Y and X bring the cursor out at the focus to act there', () => {
  const { ui, frame, spot } = windowUp();
  frame([{ kind: 'pad', button: 'down' }]);
  frame([{ kind: 'pad', button: 'secondary' }]);
  assert.ok(ui.rightClicked('one'));
  assert.ok(near(spot().x, 70, 0.5) && near(spot().y, 35, 0.5));
  assert.equal(ui.cursor, 'none');
});

test('the right stick scrolls the list under the cursor', () => {
  const { ui, frame } = windowUp();
  frame([{ kind: 'pointer', x: 70, y: 150 }, stick(0.5), REST]);
  const top = ui.boxOf('row0')?.y ?? 0;
  frame([stick(0, 0, 0.6)]);
  frame();
  frame([REST]);
  assert.equal(top - (ui.boxOf('row0')?.y ?? 0), 2 * Math.trunc(0.6 * PAD_CURSOR.SPEED * FRAME_S));
});

test('a move of the mouse or a key puts it away; the page’s own move of the pointer does not', () => {
  const { ui, frame, spot } = windowUp();
  frame([{ kind: 'pointer', x: 70, y: 85 }, stick(0.5), REST]);
  frame([{ kind: 'pointer', x: 600, y: 600, still: true }]);
  assert.equal(ui.cursor, 'none', 'still out');
  assert.ok(near(spot().y, 85, 1));
  frame([{ kind: 'pointer', x: 600, y: 600 }]);
  assert.notEqual(ui.cursor, 'none');
  assert.deepEqual(spot(), { x: 600, y: 600 });
  frame([stick(0.5), REST]);
  assert.equal(ui.cursor, 'none');
  frame([{ kind: 'key', key: 'Tab' }]);
  assert.notEqual(ui.cursor, 'none');
});

test('at rest near a press it settles on its middle', () => {
  const { frame, spot } = windowUp();
  frame([{ kind: 'pointer', x: 125, y: 40 }, stick(0.5), REST]);
  for (let index = 0; index < 60; index++) frame();
  assert.ok(Math.hypot(spot().x - 70, spot().y - 35) < 1, `settled on one: ${spot().x}, ${spot().y}`);
});

test('the cross steps from the press under the cursor and carries it onto the next', () => {
  const { ui, frame, spot } = windowUp();
  frame([{ kind: 'pointer', x: 70, y: 35 }, stick(0.5), REST]);
  frame([{ kind: 'pad', button: 'down' }]);
  assert.equal(ui.focusedId, 'two');
  assert.ok(near(spot().x, 70, 0.5) && near(spot().y, 85, 0.5), `on two: ${spot().x}, ${spot().y}`);
  assert.equal(ui.cursor, 'none');
});

test('a stick leant as the window opens moves nothing until it has come back; the window closing puts it away', () => {
  const { ui, frame } = windowUp();
  frame([stick(0.9)], false);
  frame([stick(0.9)]);
  assert.notEqual(ui.cursor, 'none', 'stale');
  frame([REST]);
  frame([stick(0.9)]);
  assert.equal(ui.cursor, 'none');
  frame([], false);
  assert.notEqual(ui.cursor, 'none');
});

test('carried onto a press its list scrolls into sight, the cursor goes with it', () => {
  const { ui, frame, spot } = windowUp();
  frame([{ kind: 'pointer', x: 70, y: 165 }, stick(0.5), REST]);
  frame([{ kind: 'pad', button: 'down' }]);
  assert.equal(ui.focusedId, 'row2');
  frame();
  frame();
  assert.ok(near(spot().y, 165, 0.5), `on row2 as scrolled: ${spot().y}`);
  assert.ok(ui.hovered('row2'));
});
