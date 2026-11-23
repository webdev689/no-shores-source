import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CanvasEvents } from './canvasEvents.ts';
import { gauntletCss, gauntletOver } from './gauntlet.ts';

test('the interface hears the pointer as it goes down to the canvas, before a world handler there can stop it', () => {
  const page = globalThis as unknown as Record<string, unknown>;
  const heard = new Map<string, unknown>();
  const listen = (kind: string, _run: unknown, options?: unknown) => heard.set(kind, options);
  Object.assign(page, { addEventListener: listen, document: { pointerLockElement: null } });
  const canvas = { tabIndex: 0, addEventListener: listen } as unknown as HTMLCanvasElement;
  new CanvasEvents(canvas);
  for (const kind of ['pointermove', 'pointerdown', 'pointerup'])
    assert.deepEqual(heard.get(kind), { capture: true }, kind);
  delete page['addEventListener'];
  delete page['document'];
});

/** A page with `CanvasEvents` on a canvas, its listeners kept, and a field being typed in; `editing` puts the
 *  browser's `EditContext` in place. Answers a key pressed, what it did to the page, and the events heard. */
function typingPage(editing: boolean, secret = false) {
  const page = globalThis as unknown as Record<string, unknown>;
  const listeners = new Map<string, (event: unknown) => void>();
  const listen = (kind: string, run: (event: unknown) => void) => listeners.set(kind, run);
  class EditContext {
    text = '';
    selectionStart = 0;
    selectionEnd = 0;
    addEventListener() {}
    updateText(start: number, end: number, text: string) {
      this.text = this.text.slice(0, start) + text + this.text.slice(end);
    }
    updateSelection() {}
    updateControlBounds() {}
    updateSelectionBounds() {}
  }
  Object.assign(page, {
    addEventListener: listen,
    document: { pointerLockElement: null },
    DOMRect: class {},
    ...(editing ? { EditContext } : {}),
  });
  const canvas = {
    tabIndex: 0,
    addEventListener: listen,
    editContext: null as unknown,
    style: { cursor: '' },
    focus() {},
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  };
  const events = new CanvasEvents(canvas as unknown as HTMLCanvasElement);
  const state = { text: 'pass', caret: 4, anchor: 4 };
  events.sync({ id: 'field', state, secret, box: { x: 0, y: 0, width: 100, height: 20 } }, 'text');
  const press = (key: string, more: { ctrlKey?: boolean; altKey?: boolean; repeat?: boolean } = {}) => {
    let prevented = false;
    const event = { key, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...more };
    listeners.get('keydown')?.({ ...event, preventDefault: () => (prevented = true) });
    return prevented;
  };
  const done = () => {
    for (const name of ['addEventListener', 'document', 'DOMRect', 'EditContext']) delete page[name];
  };
  return { events, press, canvas, done };
}

test("while the browser's own typing types, Space and Backspace are left to it and only Tab is kept from it", () => {
  const { events, press, done } = typingPage(true);
  assert.deepEqual(
    [' ', 'Backspace', 'a', 'Tab'].map((key) => press(key)),
    [false, false, false, true],
  );
  assert.ok(events.typingHere, 'the page asks whether words are typed');
  done();
});

test('without the browser’s typing, every key that types words is kept from the page, AltGr’s too', () => {
  const { events, press, done } = typingPage(false);
  assert.deepEqual(
    ["'", '/', ' ', 'Backspace', 'Tab'].map((key) => press(key)),
    [true, true, true, true, true],
  );
  events.take();
  press('@', { ctrlKey: true, altKey: true });
  assert.deepEqual(
    events.take().filter((event) => event.kind === 'text'),
    [{ kind: 'text', text: '@' }],
    'AltGr is no Ctrl',
  );
  assert.equal(press('c', { ctrlKey: true }), false, 'Ctrl+C is the page’s to copy');
  done();
});

test('a held Enter or Space is heard as a key once, not again as it repeats; a held letter still types', () => {
  const { events, press, done } = typingPage(false);
  events.take();
  for (const key of ['Enter', ' ', 'x']) press(key);
  for (const key of ['Enter', ' ', 'x']) press(key, { repeat: true });
  assert.deepEqual(
    events.take().map((event) => (event.kind === 'key' ? `key ${event.key}` : event.kind === 'text' ? event.text : '')),
    ['key Enter', 'key  ', ' ', 'key x', 'x', ' ', 'key x', 'x'],
  );
  done();
});

test("a hidden field's words are never handed to the browser's typing; its keys are typed as words", () => {
  const { events, press, canvas, done } = typingPage(true, true);
  assert.equal(canvas.editContext, null);
  events.take();
  assert.equal(press('x'), true);
  assert.deepEqual(
    events.take().filter((event) => event.kind === 'text'),
    [{ kind: 'text', text: 'x' }],
  );
  done();
});

test('the pad in a window: its cross repeats, A, B, X, Y and the bumpers act once, A is let go, the sticks are sent as they lean and once at rest', () => {
  const page = globalThis as unknown as Record<string, unknown>;
  Object.assign(page, { addEventListener: () => undefined, document: { pointerLockElement: null } });
  const held = { buttons: new Set<number>(), axes: [0, 0, 0, 0] };
  const pad = () => ({
    mapping: 'standard',
    buttons: Array.from({ length: 17 }, (unused, place) => ({ pressed: held.buttons.has(place), value: 0 })),
    axes: held.axes,
  });
  Object.defineProperty(navigator, 'getGamepads', { value: () => [pad()], configurable: true });
  const now = performance.now;
  let clock = 0;
  performance.now = () => clock;
  const events = new CanvasEvents({ tabIndex: 0, addEventListener: () => undefined } as unknown as HTMLCanvasElement);
  const take = (seconds = 1 / 60) => {
    clock += seconds * 1000;
    return events
      .take()
      .map((event) => (event.kind === 'pad' ? `${event.button}${event.up ? ' let go' : ''}` : JSON.stringify(event)));
  };
  held.buttons = new Set([13]);
  assert.deepEqual(take(), ['down']);
  assert.deepEqual(take(0.3), [], 'a moment before it repeats');
  assert.deepEqual(take(0.3), ['down'], 'then it repeats');
  held.buttons = new Set();
  held.axes = [0, -0.9, 0, 0.1];
  const leant = JSON.stringify({ kind: 'stick', x: 0, y: -0.9, scroll: 0.1 });
  assert.deepEqual(take(), [leant], 'the left stick is the cursor’s, not the cross');
  assert.deepEqual(take(), [leant], 'and is sent each frame it leans');
  held.axes = [0.1, 0, 0, 0];
  assert.deepEqual(take(), [JSON.stringify({ kind: 'stick', x: 0, y: 0, scroll: 0 })], 'once at rest');
  assert.deepEqual(take(), [], 'then no more');
  held.axes = [0, 0, 0, -0.5];
  assert.deepEqual(take(), [JSON.stringify({ kind: 'stick', x: 0, y: 0, scroll: -0.5 })], 'the right stick scrolls');
  held.axes = [0, 0, 0, 0];
  take();
  held.buttons = new Set([0, 4]);
  assert.deepEqual(take(), ['accept', 'previous']);
  assert.deepEqual(take(1), [], 'neither repeats however long it is held');
  held.buttons = new Set([1, 2, 3, 5]);
  assert.deepEqual(take(), ['accept let go', 'back', 'quick', 'secondary', 'next']);
  assert.deepEqual(take(1), [], 'none repeats');
  performance.now = now;
  delete page['addEventListener'];
  delete page['document'];
});

test('the canvas wears the gauntlet asked for, pressed while a mouse button is down, never while the pointer is locked', () => {
  const page = globalThis as unknown as Record<string, unknown>;
  const listeners = new Map<string, (event: unknown) => void>();
  const listen = (kind: string, run: (event: unknown) => void) => listeners.set(kind, run);
  const lock = { pointerLockElement: null as unknown };
  Object.assign(page, { addEventListener: listen, document: lock });
  const worn: string[] = [];
  const style = {
    set cursor(value: string) {
      worn.push(value);
    },
  };
  const canvas = { tabIndex: 0, addEventListener: listen, style, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  const events = new CanvasEvents(canvas as unknown as HTMLCanvasElement);
  const [plain, sharp] = gauntletCss('point');
  events.sync(null, gauntletOver('pointer'));
  assert.deepEqual(worn, [plain, sharp], 'the plain picture first, for a browser that cannot choose by the ratio');
  assert.match(
    sharp,
    /^image-set\(url\("data:image\/svg\+xml,[^"]+"\) 1x, url\("data:image\/svg\+xml,[^"]+"\) 2x\) 0 0, auto$/,
  );
  events.sync(null, gauntletOver('default'));
  assert.equal(worn.length, 2, 'the same look is not worn again');
  const press = (pointerType: string) =>
    listeners.get('pointerdown')?.({ pointerType, button: 0, shiftKey: false, clientX: 1, clientY: 1 });
  press('mouse');
  assert.equal(worn.at(-1), gauntletCss('press')[1], 'pressed at once, with no frame between');
  listeners.get('pointerup')?.({ button: 0, clientX: 1, clientY: 1 });
  assert.equal(worn.at(-1), sharp);
  press('touch');
  assert.equal(worn.at(-1), sharp, 'a touch shows no press');
  events.sync(null, gauntletOver('text'));
  assert.equal(worn.at(-1), 'text', 'a field keeps the caret');
  events.sync(null, gauntletOver('none'));
  assert.equal(worn.at(-1), 'none', 'the pad’s cursor drawn instead');
  lock.pointerLockElement = canvas;
  const before = worn.length;
  events.sync(null, gauntletOver('default'));
  assert.equal(worn.length, before, 'locked, the pointer has no look to wear');
  delete page['addEventListener'];
  delete page['document'];
});

test('a move of the pointer that went nowhere, or within 0.3 s of a lock or its letting go, is not the mouse moving', () => {
  const page = globalThis as unknown as Record<string, unknown>;
  const listeners = new Map<string, (event: unknown) => void>();
  const listen = (kind: string, run: (event: unknown) => void) => listeners.set(kind, run);
  const lock = { pointerLockElement: null as unknown };
  Object.assign(page, { addEventListener: listen, document: lock });
  const now = performance.now;
  let clock = 10_000;
  performance.now = () => clock;
  const canvas = { tabIndex: 0, addEventListener: listen, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  const events = new CanvasEvents(canvas as unknown as HTMLCanvasElement);
  const move = (movementX: number) => {
    listeners.get('pointermove')?.({ clientX: 5, clientY: 5, movementX, movementY: 0 });
    return events.take().flatMap((event) => (event.kind === 'pointer' ? [Boolean(event.still)] : []));
  };
  assert.deepEqual(move(3), [false]);
  assert.deepEqual(move(0), [true], 'it went nowhere');
  lock.pointerLockElement = canvas;
  events.take();
  lock.pointerLockElement = null;
  clock += 100;
  events.take();
  clock += 200;
  assert.deepEqual(move(40), [true], 'the jump as the pointer is let go');
  clock += 150;
  assert.deepEqual(move(4), [false]);
  performance.now = now;
  delete page['addEventListener'];
  delete page['document'];
});
