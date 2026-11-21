import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CanvasEvents } from './canvasEvents.ts';

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
  const press = (key: string, more: { ctrlKey?: boolean; altKey?: boolean } = {}) => {
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
