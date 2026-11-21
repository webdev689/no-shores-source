import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addressOf, HeardEvents, KeptStorage, pageAway } from './pageAway.ts';
import type { Start, ToPage } from './pageOps.ts';
import { BROWSERS_SIGN_INS, SIGN_INS, useSignIns } from '../ui/page.ts';

test('storage reads what the page had and sends each change on at once', () => {
  const sent: ToPage[] = [];
  const kept = new KeptStorage([['look', 'brown']], 'local', (message) => sent.push(message));
  assert.equal(kept.getItem('look'), 'brown');
  kept.setItem('volume', '0.5');
  kept.removeItem('look');
  assert.equal(kept.getItem('look'), null);
  assert.equal(kept.length, 1);
  assert.deepEqual(sent, [
    { kind: 'store', area: 'local', key: 'volume', value: '0.5' },
    { kind: 'store', area: 'local', key: 'look', value: null },
  ]);
});

test("the page's address reads as a page's, and leaving it is the page's to do", () => {
  const sent: ToPage[] = [];
  const address = addressOf('https://example.org/overlook/?at=overlook-social&room=a', (message) => sent.push(message));
  assert.equal(address.search, '?at=overlook-social&room=a');
  assert.equal(address.pathname, '/overlook/');
  address.assign('?at=elsewhere');
  address.reload();
  assert.deepEqual(sent, [
    { kind: 'go', how: 'assign', url: 'https://example.org/overlook/?at=elsewhere' },
    { kind: 'go', how: 'reload', url: 'https://example.org/overlook/?at=overlook-social&room=a' },
  ]);
});

test('what the interface types in is sent to the page only as it changes', () => {
  const sent: ToPage[] = [];
  const events = new HeardEvents((message) => sent.push(message));
  events.heard([{ kind: 'pointer', x: 4, y: 5 }], { x: 4, y: 5 });
  assert.deepEqual(events.take(), [{ kind: 'pointer', x: 4, y: 5 }]);
  assert.deepEqual(events.take(), []);
  events.sync(null, 'pointer');
  events.sync(null, 'pointer');
  events.sync(null, 'default');
  assert.equal(sent.length, 2);
});

test("an event the page heard on its canvas reaches the canvas's listeners, then the window's; the lock is the page's", async () => {
  const before = new Map(
    [
      'location',
      'localStorage',
      'sessionStorage',
      'devicePixelRatio',
      'document',
      'window',
      'matchMedia',
      'open',
      'addEventListener',
      'dispatchEvent',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const),
  );
  const sent: ToPage[] = [];
  const canvas = Object.assign(new EventTarget(), { width: 0, height: 0 }) as unknown as OffscreenCanvas;
  const start: Start = {
    kind: 'start',
    canvas,
    href: 'https://example.org/?at=overlook-social',
    local: [['seen', '1']],
    session: [],
    view: { width: 640, height: 360, left: 0, top: 0, ratio: 2 },
    media: { '(prefers-reduced-motion: reduce)': true },
    hidden: false,
  };
  // A worker's global hears events, as Node's does not.
  const scope = new EventTarget();
  Object.assign(globalThis, {
    addEventListener: scope.addEventListener.bind(scope),
    dispatchEvent: scope.dispatchEvent.bind(scope),
  });
  try {
    const away = pageAway(start, (message) => sent.push(message));
    assert.deepEqual([canvas.width, canvas.height], [1280, 720], 'drawn at the screen’s pixels');
    assert.equal(localStorage.getItem('seen'), '1');
    assert.equal(location.search, '?at=overlook-social');
    assert.equal(matchMedia('(prefers-reduced-motion: reduce)').matches, true);
    const heard: string[] = [];
    away.canvas.addEventListener('pointerdown', (event) => heard.push(`canvas ${(event as PointerEvent).button}`));
    addEventListener('pointerdown', () => heard.push('window'));
    away.heard({ kind: 'event', on: 'canvas', type: 'pointerdown', fields: { button: 2 }, pointer: { x: 1, y: 2 } });
    assert.deepEqual(heard, ['canvas 2', 'window']);
    assert.deepEqual(away.events.pointer, { x: 1, y: 2 });
    void away.canvas.requestPointerLock();
    assert.equal(document.pointerLockElement, null, 'locked only once the page says so');
    away.heard({ kind: 'lock', locked: true });
    assert.equal(document.pointerLockElement, away.canvas);
    away.heard({ kind: 'view', view: { width: 800, height: 600, left: 0, top: 0, ratio: 1 } });
    assert.deepEqual([canvas.width, canvas.height, away.canvas.clientWidth], [800, 600, 800]);
    assert.ok(sent.some((message) => message.kind === 'lock' && message.locked));
    // The password store is the page's: an ask goes to it, and its answer comes back to the one who asked.
    const asked = SIGN_INS.kept();
    const signIn = sent.find((message) => message.kind === 'signIn');
    assert.ok(signIn?.kind === 'signIn' && signIn.keep === null);
    away.heard({ kind: 'signIn', id: signIn.id, kept: { id: 'Wren', password: 'hunter22' } });
    assert.deepEqual(await asked, { id: 'Wren', password: 'hunter22' });
    useSignIns(BROWSERS_SIGN_INS);
  } finally {
    for (const [name, descriptor] of before)
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete (globalThis as Record<string, unknown>)[name];
  }
});
