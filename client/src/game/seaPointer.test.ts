import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Sea } from './sea.ts';
import { seaPointer } from './seaPointer.ts';

test('a press on what the game draws over the sea is the interface’s: the sea is neither steered nor dragged', () => {
  const page = globalThis as unknown as Record<string, unknown>;
  const listeners = new Map<string, ((event: unknown) => void)[]>();
  const listen = (kind: string, run: (event: unknown) => void) =>
    listeners.set(kind, [...(listeners.get(kind) ?? []), run]);
  page['addEventListener'] = () => undefined;
  const canvas = { addEventListener: listen, setPointerCapture: () => undefined, clientHeight: 720 };
  const heard: string[] = [];
  const sea = {
    fight: null,
    boarding: { onDeck: false },
    pointerDown: () => heard.push('down'),
    pointerMove: () => heard.push('move'),
    pointerUp: () => heard.push('up'),
    pointerCancel: () => undefined,
  } as unknown as Sea;
  let over = true;
  seaPointer(
    canvas as unknown as HTMLCanvasElement,
    { locked: false },
    {
      atSea: () => true,
      overInterface: () => over,
      sea: () => sea,
      map: () => null,
    },
  );
  const spot = { offsetX: 10, offsetY: 10, pointerId: 1 };
  for (const kind of ['pointerdown', 'pointermove', 'pointerup'])
    for (const run of listeners.get(kind) ?? []) run(spot);
  assert.deepEqual(heard, []);
  over = false;
  for (const kind of ['pointerdown', 'pointermove', 'pointerup'])
    for (const run of listeners.get(kind) ?? []) run(spot);
  assert.deepEqual(heard, ['down', 'move', 'up']);
  delete page['addEventListener'];
});
