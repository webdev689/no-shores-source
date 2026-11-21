import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Node } from './node.ts';
import { SCREEN_KEY } from './screenKeys.ts';
import type { UiEvent } from './ui.ts';
import { fakeInterface } from './uiForTests.ts';

const form: Node = {
  id: 'form',
  direction: 'column',
  padding: 20,
  gap: 10,
  children: [
    { id: 'name', field: { placeholder: 'Name' }, width: 200, height: 22, role: 'well' },
    { id: 'go', press: true, width: 60, height: 22, role: 'button' },
  ],
};

/** A touch, or a click, on what `id` was laid as. */
function tapOn(ui: ReturnType<typeof fakeInterface>['ui'], id: string, touch = true): UiEvent[] {
  const box = ui.boxOf(id);
  assert.ok(box, `${id} is laid`);
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  return [
    { kind: 'down', x, y, button: 0, touch },
    { kind: 'up', x, y, button: 0 },
  ];
}

test('a field touched opens the keys the game draws, which type into it as keys would', () => {
  const { ui, step } = fakeInterface(400, 300);
  step(form);
  step(form, tapOn(ui, 'name'));
  step(form);
  assert.ok(ui.boxOf(`${SCREEN_KEY}h`), 'the keys are laid');
  assert.equal(ui.typing?.onScreen, true, "so the page's own typing stays away");
  for (const key of ['shift', 'h', 'i', 'space', 'x', 'back']) {
    step(form, tapOn(ui, `${SCREEN_KEY}${key}`));
  }
  assert.equal(ui.fieldText('name'), 'Hi ');
  assert.equal(ui.focused('name'), true, 'the field keeps the focus');
  step(form, tapOn(ui, `${SCREEN_KEY}done`));
  assert.equal(ui.submitted('name'), true, 'Done is Enter');
  step(form);
  assert.equal(ui.boxOf(`${SCREEN_KEY}h`), null, 'and the keys go');
});

test('a field clicked with a mouse opens no keys, and a key pressed on a keyboard sends them away', () => {
  const { ui, step } = fakeInterface(400, 300);
  step(form);
  step(form, tapOn(ui, 'name', false));
  step(form);
  assert.equal(ui.boxOf(`${SCREEN_KEY}h`), null);
  step(form, tapOn(ui, 'name'));
  step(form);
  assert.ok(ui.boxOf(`${SCREEN_KEY}h`));
  step(form, [
    { kind: 'key', key: 'a' },
    { kind: 'text', text: 'a' },
  ]);
  step(form);
  assert.equal(ui.boxOf(`${SCREEN_KEY}h`), null);
  assert.equal(ui.fieldText('name'), 'a');
});

test("the pad walks the keys, A types the one it stands on, and B puts them away, the field's focus kept", () => {
  const { ui, step } = fakeInterface(400, 300);
  step(form);
  step(form, [{ kind: 'pad', button: 'down' }]);
  assert.equal(ui.focused('name'), true, 'the pad reached the field');
  step(form);
  assert.ok(ui.boxOf(`${SCREEN_KEY}q`), 'which opens the keys');
  // The cross starts on Q (the first letter); one right is W.
  step(form, [
    { kind: 'pad', button: 'right' },
    { kind: 'pad', button: 'accept' },
  ]);
  step(form, [{ kind: 'pad', button: 'accept' }]);
  assert.equal(ui.fieldText('name'), 'ww');
  step(form, [{ kind: 'pad', button: 'back' }]);
  step(form);
  assert.equal(ui.boxOf(`${SCREEN_KEY}q`), null);
  assert.equal(ui.focused('name'), true);
  assert.equal(ui.escaped, false, 'B put the keys away, nothing more');
});

test('focus taken from the field sends the keys away', () => {
  const { ui, step } = fakeInterface(400, 300);
  step(form);
  step(form, tapOn(ui, 'name'));
  step(form);
  step(form, tapOn(ui, 'go'));
  assert.equal(ui.clicked('go'), true);
  step(form);
  assert.equal(ui.boxOf(`${SCREEN_KEY}h`), null);
});
