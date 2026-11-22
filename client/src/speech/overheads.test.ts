import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Stack } from '../ui/stack.ts';
import { fakeInterface, laidOf } from '../ui/uiForTests.ts';
import type { Cast } from './cast.ts';
import { Overheads } from './overheads.ts';
import { GAP_PX } from './place.ts';

const CAST: Cast = {
  speakers: { kael: { name: 'Kael', voice: 'low' } },
  voices: { low: { pitchHz: 120, spreadHz: 10, muffleHz: 2000, volume: 0.5, syllableS: 0.1 } },
};

test('a bark stands over its head, hidden while the head is not seen, and goes once held and faded', () => {
  const stack = new Stack();
  const { ui } = fakeInterface();
  const barks = new Overheads(stack, () => null);
  barks.bark('kael', { who: 'kael', say: 'Brace!' }, CAST);
  barks.frame(0.1, new Map([['kael', null]]));
  assert.equal(stack.node(ui).children?.length, 1);
  assert.equal(laidOf(stack.node(ui)).filter((each) => each.node.text).length, 0, 'no head, no words');
  barks.frame(0.1, new Map([['kael', [400, 300]]]));
  const words = laidOf(stack.node(ui)).find((each) => each.node.text);
  assert.ok(words);
  assert.ok(Math.abs(words.box.x + words.box.width / 2 - 400) <= 1, 'centred over the head');
  assert.ok(words.box.y < 300 - GAP_PX, 'above it');
  for (let step = 0; step < 40; step++) barks.frame(0.1, new Map([['kael', [400, 300]]]));
  assert.equal(laidOf(stack.node(ui)).filter((each) => each.node.text).length, 0, 'gone');
  barks.remove();
});

test('a bark over a head at the side is moved in, never cut off', () => {
  const stack = new Stack();
  const { ui } = fakeInterface();
  const barks = new Overheads(stack, () => null);
  barks.bark('kael', { who: 'kael', say: 'Cut the lines, now!' }, CAST);
  barks.frame(0.1, new Map([['kael', [5, 200]]]));
  const words = laidOf(stack.node(ui)).find((each) => each.node.text);
  assert.equal(words?.box.x, 0);
  barks.remove();
});
