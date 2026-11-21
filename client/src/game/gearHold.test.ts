import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Interface } from '../ui/ui.ts';
import { HOLD_MS, Holds, dismantleMs, quiver } from './gearHold.ts';

/** An interface where `state` says what is held, under the pointer and focused. */
function fakeUi(state: { pressing?: string; hovered?: string; focused?: string; keyFocused?: boolean }): Interface {
  return {
    pressing: (id: string) => state.pressing === id,
    hovered: (id: string) => state.hovered === id,
    focused: (id: string) => state.focused === id,
    get keyFocused() {
      return Boolean(state.keyFocused);
    },
    boxOf: () => ({ x: 0, y: 0, width: 10, height: 10 }),
  } as unknown as Interface;
}

/** Holds on a clock moved by hand, and a frame of `press` on `id`. */
function setup() {
  let now = 0;
  const holds = new Holds(() => now);
  const acted: string[] = [];
  const frame = (ui: Interface, id = 'buy') => {
    holds.frame(ui);
    const share = holds.press(ui, id, () => acted.push(id));
    holds.end();
    return share;
  };
  return { holds, acted, frame, wait: (span: number) => (now += span) };
}

test('a press held by the pointer acts once its time is up, and only once while it stays held', () => {
  const { acted, frame, wait } = setup();
  const ui = fakeUi({ pressing: 'buy', hovered: 'buy' });
  assert.equal(frame(ui), 0);
  wait(HOLD_MS / 2);
  assert.equal(frame(ui), 0.5);
  wait(HOLD_MS / 2);
  frame(ui);
  assert.deepEqual(acted, ['buy']);
  for (let again = 0; again < 3; again++) {
    wait(HOLD_MS);
    frame(ui);
  }
  assert.deepEqual(acted, ['buy'], 'still held, it does not act again');
  frame(fakeUi({}));
  frame(ui);
  wait(HOLD_MS);
  frame(ui);
  assert.deepEqual(acted, ['buy', 'buy'], 'let go and held again, it acts again');
});

test('let go early, or moved off, or its page gone, a hold does nothing', () => {
  const { acted, frame, wait, holds } = setup();
  frame(fakeUi({ pressing: 'buy', hovered: 'buy' }));
  wait(HOLD_MS - 1);
  frame(fakeUi({ pressing: 'buy' }));
  wait(HOLD_MS);
  frame(fakeUi({}));
  assert.deepEqual(acted, []);
  frame(fakeUi({ pressing: 'buy', hovered: 'buy' }));
  holds.frame(fakeUi({ pressing: 'buy', hovered: 'buy' }));
  holds.end();
  assert.ok(!holds.holding, 'a press no longer laid is let go');
});

test('Enter held on the focused press holds it until Enter is let go', () => {
  const { acted, frame, wait, holds } = setup();
  const ui = fakeUi({ focused: 'buy', keyFocused: true });
  holds.key('Enter', true);
  frame(ui);
  wait(HOLD_MS / 2);
  holds.key('Enter', false);
  wait(HOLD_MS);
  frame(ui);
  assert.deepEqual(acted, []);
  holds.key('Enter', true);
  frame(ui);
  wait(HOLD_MS);
  frame(ui);
  assert.deepEqual(acted, ['buy']);
});

test('F held over a carried piece dismantles it after as long as its rarity asks; a chord is the browser’s', () => {
  let now = 0;
  const holds = new Holds(() => now);
  const gone: number[] = [];
  const ui = fakeUi({ hovered: 'item-3' });
  const frame = () => {
    holds.frame(ui);
    holds.dismantle(ui, 'item-3', 4, '1,2,3', () => gone.push(3));
    holds.end();
  };
  frame();
  assert.ok(!holds.key('f', true, false, true), 'Ctrl F is not a hold');
  assert.ok(holds.key('f', true));
  frame();
  now += dismantleMs(4) - 1;
  frame();
  assert.deepEqual(gone, []);
  now += 1;
  frame();
  assert.deepEqual(gone, [3]);
  assert.ok(dismantleMs(4) > dismantleMs(0), 'the rarer, the longer');
});

test('a picture quivers only in the last half of its hold', () => {
  assert.equal(quiver(0.3), undefined);
  assert.ok(quiver(0.9));
});
