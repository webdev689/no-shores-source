import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Child } from '../ui/node.ts';
import type { UiEvent } from '../ui/ui.ts';
import { fakeInterface } from '../ui/uiForTests.ts';
import { EntranceCardView } from './entranceCard.ts';
import { fakeWindow } from './pageForTests.ts';

test('the pad’s B closes an entrance’s card, as Escape does', () => {
  fakeWindow();
  const pressed: string[] = [];
  const view = new EntranceCardView({
    enter: () => void pressed.push('enter'),
    close: () => void pressed.push('close'),
    find: () => void pressed.push('find'),
    stop: () => void pressed.push('stop'),
  });
  view.show({
    name: 'The Mire Cells',
    tier: 'Normal · Level 5',
    rank: 0,
    rules: [],
    modifiers: [],
    pays: '',
    shut: null,
    finds: null,
  });
  const { ui, step } = fakeInterface(1280, 720);
  let built: Child = null;
  const frame = (events: UiEvent[] = []) =>
    step(() => ({ width: 'grow', height: 'grow', children: [(built = view.layer(ui))] }), events);
  frame();
  frame();
  assert.ok(built, 'the card stands');
  frame([{ kind: 'pad', button: 'back' }]);
  assert.deepEqual(pressed, ['close']);
});
