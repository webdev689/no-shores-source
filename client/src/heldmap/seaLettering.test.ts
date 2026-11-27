import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Lettering } from './mapLayout.ts';
import { recorder } from './painterForTests.ts';
import { SeaLettering, type SeaPainting } from './seaLettering.ts';

const PICTURE = { width: 1600, height: 1000 } as const;
const INK_AT = { x: 40, y: 30 } as const;
const LETTERING: Lettering = {
  letters: [{ text: 'The Elmwater', x: 600, y: 300, kind: 'water', chosen: false, side: 'centre' }],
  ship: { x: 200, y: 400, heading: 1 },
  key: null,
  scale: 1,
  named: [],
};
const painting = (changes: Partial<SeaPainting> = {}): SeaPainting => ({
  ...{ lettering: LETTERING, isles: [], others: [], said: null, asked: null, fonts: 'loaded' },
  ...{ ink: { width: 1400, height: 900 } },
  ...changes,
});
const sailed = (x: number, y: number) => painting({ lettering: { ...LETTERING, ship: { x, y, heading: 1 } } });

test('under way only the pixels round the ship’s arrow, where it was and is, are painted and sent', () => {
  const sea = new SeaLettering();
  const { painter, calls } = recorder();
  assert.equal(sea.paint(painter, PICTURE, INK_AT, 2, painting()), 'all', 'the first painting is whole');
  assert.equal(sea.paint(painter, PICTURE, INK_AT, 2, painting()), null, 'a still frame paints nothing');
  calls.length = 0;
  const part = sea.paint(painter, PICTURE, INK_AT, 2, sailed(203, 401));
  assert.ok(part && part !== 'all', 'the arrow moving paints a part');
  // The arrow's middle on the picture, device pixels: where it was and where it is now, both inside the part.
  for (const [x, y] of [
    [(INK_AT.x + 200) * 2, (INK_AT.y + 400) * 2],
    [(INK_AT.x + 203) * 2, (INK_AT.y + 401) * 2],
  ] as const) {
    assert.ok(x - 24 >= part.x && x + 24 <= part.x + part.width, `across ${x}`);
    assert.ok(y - 24 >= part.y && y + 24 <= part.y + part.height, `down ${y}`);
  }
  assert.ok(part.width < 100 && part.height < 100, 'a small part');
  const clipped = calls.findIndex((call) => call.name === 'clip');
  const cleared = calls.findIndex((call) => call.name === 'clearRect');
  assert.ok(clipped >= 0 && clipped < cleared, 'the painting held to the part before it is cleared');
  assert.deepEqual(calls.find((call) => call.name === 'rect')?.args, [part.x, part.y, part.width, part.height]);
});

test('anything else changing paints the picture whole, and so does a picture made anew', () => {
  const sea = new SeaLettering();
  const { painter } = recorder();
  sea.paint(painter, PICTURE, INK_AT, 1, painting());
  const named = { ...LETTERING, letters: [], ship: { x: 210, y: 400, heading: 1 } };
  assert.equal(
    sea.paint(painter, PICTURE, INK_AT, 1, painting({ lettering: named })),
    'all',
    'a name gone, the ship on',
  );
  assert.equal(sea.paint(painter, PICTURE, INK_AT, 1, painting({ lettering: named, fonts: 'loading' })), 'all');
  sea.forget();
  assert.equal(sea.paint(painter, PICTURE, INK_AT, 1, painting({ lettering: named, fonts: 'loading' })), 'all');
});
