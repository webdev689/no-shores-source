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
