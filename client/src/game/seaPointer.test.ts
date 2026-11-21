import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { HeldMap } from '../heldmap/heldMap.ts';
import type { Sea } from './sea.ts';
import { type SeaPointing, seaPointer } from './seaPointer.ts';

/** The sea's pointer on a canvas that keeps its listeners, at sea with no menu up; `fire` runs each kind's listeners
 *  on a press at one spot. */
function pointed(pointing: Omit<SeaPointing, 'atSea'>) {
  const page = globalThis as unknown as Record<string, unknown>;
  const listeners = new Map<string, ((event: unknown) => void)[]>();
  const listen = (kind: string, run: (event: unknown) => void) =>
    listeners.set(kind, [...(listeners.get(kind) ?? []), run]);
  page['addEventListener'] = () => undefined;
  const canvas = { addEventListener: listen, setPointerCapture: () => undefined, clientHeight: 720 };
  seaPointer(canvas as unknown as HTMLCanvasElement, { locked: false }, { atSea: () => true, ...pointing });
  delete page['addEventListener'];
  const spot = { offsetX: 10, offsetY: 10, pointerId: 1, deltaY: 100, deltaMode: 0 };
  return (...kinds: string[]) => {
    for (const kind of kinds) for (const run of listeners.get(kind) ?? []) run(spot);
  };
}

test('a press on what the game draws over the sea is the interface’s: the sea is neither steered nor dragged', () => {
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
  const fire = pointed({ overInterface: () => over, sea: () => sea, map: () => null });
  fire('pointerdown', 'pointermove', 'pointerup');
  assert.deepEqual(heard, []);
  over = false;
  fire('pointerdown', 'pointermove', 'pointerup');
  assert.deepEqual(heard, ['down', 'move', 'up']);
});

test('the held map takes no press, drag or wheel that the interface is over, and takes them beside it', () => {
  const heard: string[] = [];
  const sea = {
    fight: null,
    boarding: { onDeck: false },
    pointerCancel: () => undefined,
    zoom: () => heard.push('sea'),
  };
  const map = {
    shown: true,
    pointerDown: () => heard.push('down'),
    pointerMove: () => heard.push('move'),
    pointerUp: () => heard.push('up'),
    pointerCancel: () => undefined,
    wheel: () => heard.push('wheel'),
  };
  let over = true;
  const fire = pointed({
    overInterface: () => over,
    sea: () => sea as unknown as Sea,
    map: () => map as unknown as HeldMap,
  });
  fire('pointerdown', 'pointermove', 'pointerup', 'wheel');
  assert.deepEqual(heard, [], 'over the interface, neither the map nor the sea');
  over = false;
  fire('pointerdown', 'pointermove', 'pointerup', 'wheel');
  assert.deepEqual(heard, ['down', 'move', 'up', 'wheel']);
});
