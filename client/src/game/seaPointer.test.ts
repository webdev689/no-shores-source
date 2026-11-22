import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { HeldMap } from '../heldmap/heldMap.ts';
import { FakeEvent, fakePage } from './pageForTests.ts';
import type { Sea } from './sea.ts';
import type { SeaCombat } from './seaCombat.ts';
import { type SeaPointing, fightControls, seaPointer } from './seaPointer.ts';

/** The sea's pointer on a canvas that keeps its listeners, at sea with no menu up; `fire` runs each kind's listeners
 *  on a press at one spot. */
function pointed(pointing: Omit<SeaPointing, 'atSea'>) {
  const page = globalThis as unknown as Record<string, unknown>;
  const listeners = new Map<string, ((event: unknown) => void)[]>();
  const listen = (kind: string, run: (event: unknown) => void) =>
    listeners.set(kind, [...(listeners.get(kind) ?? []), run]);
  page['addEventListener'] = () => undefined;
  page['document'] = { addEventListener: () => undefined };
  const canvas = { addEventListener: listen, setPointerCapture: () => undefined, clientHeight: 720 };
  seaPointer(canvas as unknown as HTMLCanvasElement, { locked: false }, { atSea: () => true, ...pointing });
  delete page['addEventListener'];
  delete page['document'];
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

test('the fight hears a key by the name it is bound by: a digit by its place on the row, Shift held or not', () => {
  const { window } = fakePage();
  const heard: string[] = [];
  const combat = { key: (key: string) => heard.push(key) > 0 } as unknown as SeaCombat;
  fightControls({ addEventListener: () => undefined } as unknown as HTMLCanvasElement, () => combat);
  window.dispatchEvent(new FakeEvent('keydown', { key: '@', code: 'Digit2' }));
  window.dispatchEvent(new FakeEvent('keydown', { key: 'W', code: 'KeyW' }));
  assert.deepEqual(heard, ['2', 'w']);
});

test('a key held in a fight is let go as the window loses focus or the page is hidden, never left held', () => {
  const { window } = fakePage();
  let letGo = 0;
  const combat = { key: () => true, letGo: () => letGo++ } as unknown as SeaCombat;
  fightControls({ addEventListener: () => undefined } as unknown as HTMLCanvasElement, () => combat);
  window.dispatchEvent(new FakeEvent('keydown', { key: 'a', code: 'KeyA' }));
  window.dispatchEvent(new FakeEvent('blur', {}));
  (globalThis as unknown as { document: EventTarget }).document.dispatchEvent(new FakeEvent('visibilitychange', {}));
  assert.equal(letGo, 2, 'let go on each');
});
