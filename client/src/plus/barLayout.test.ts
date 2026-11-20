import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BarLayout, type BarSpot } from './barLayout.ts';
import { UNDER_COMPASS } from './compass.ts';

const bar = (key: number, x: number, depth: number, y = 300): BarSpot => ({ key, x, y, width: 120, height: 26, depth });

/** Each bar's box as drawn: left, top, right and bottom. */
function boxes(spots: readonly BarSpot[], laid: Map<number, { lift: number }>) {
  return spots.map((spot) => {
    const bottom = spot.y - (laid.get(spot.key)?.lift ?? 0);
    return [spot.x - spot.width / 2, bottom - spot.height, spot.x + spot.width / 2, bottom] as const;
  });
}

function assertApart(spots: readonly BarSpot[], laid: Map<number, { lift: number }>) {
  const drawn = boxes(spots, laid);
  drawn.forEach(([left, top, right, bottom], index) => {
    for (const [otherLeft, otherTop, otherRight, otherBottom] of drawn.slice(index + 1)) {
      const overlap = left < otherRight && otherLeft < right && top < otherBottom && otherTop < bottom;
      assert.ok(!overlap, `bars ${index} and another overlap`);
    }
  });
}

test('three foes side by side: the nearest keeps its place in front, the others lifted clear of it and each other', () => {
  const spots = [bar(7, 400, 12), bar(3, 430, 6), bar(5, 380, 18)];
  const laid = new BarLayout().lay(spots, Infinity);
  assert.equal(laid.get(3)?.lift, 0, 'the nearest stays over its figure');
  assert.deepEqual(
    [3, 7, 5].map((key) => laid.get(key)?.front),
    [0, 1, 2],
    'nearer in front',
  );
  assert.ok((laid.get(5)?.lift ?? 0) > (laid.get(7)?.lift ?? 0), 'the farthest stands highest');
  assertApart(spots, laid);
});

test('bars apart on the screen stay where they are', () => {
  const spots = [bar(1, 100, 10), bar(2, 400, 12), bar(3, 700, 8)];
  const laid = new BarLayout().lay(spots, Infinity);
  assert.deepEqual(
    [1, 2, 3].map((key) => laid.get(key)?.lift),
    [0, 0, 0],
  );
});

test('a bar above another is not moved, and a pile of five is laid with none over another', () => {
  const higher = new BarLayout().lay([bar(1, 400, 10), bar(2, 400, 20, 200)], Infinity);
  assert.equal(higher.get(2)?.lift, 0);
  const pile = [0, 1, 2, 3, 4].map((key) => bar(key, 400 + key * 15, 10 + key));
  assertApart(pile, new BarLayout().lay(pile, Infinity));
});

test('two figures at nearly one depth keep their order from frame to frame, until one is clearly nearer', () => {
  const layout = new BarLayout();
  layout.lay([bar(1, 400, 10), bar(2, 420, 10.5)], Infinity);
  const close = layout.lay([bar(1, 400, 10.2), bar(2, 420, 10)], Infinity);
  assert.equal(close.get(1)?.front, 0, 'the first stays in front through a little change');
  assert.equal(close.get(1)?.lift, 0);
  const clear = layout.lay([bar(1, 400, 12), bar(2, 420, 10)], Infinity);
  assert.equal(clear.get(2)?.front, 0, 'a figure clearly nearer goes in front');
  assert.equal(clear.get(2)?.lift, 0);
});

test('a lifted bar stays lifted while it is only just clear, and comes down once it is well clear', () => {
  const layout = new BarLayout();
  const touching = layout.lay([bar(1, 400, 10), bar(2, 515, 12)], Infinity);
  assert.ok((touching.get(2)?.lift ?? 0) > 0, 'lifted while the two overlap');
  const justClear = layout.lay([bar(1, 400, 10), bar(2, 526, 12)], Infinity);
  assert.ok((justClear.get(2)?.lift ?? 0) > 0, 'held up while within the slack');
  const fresh = new BarLayout().lay([bar(1, 400, 10), bar(2, 526, 12)], Infinity);
  assert.equal(fresh.get(2)?.lift, 0, 'never lifted, the same spot is clear');
  const wellClear = layout.lay([bar(1, 400, 10), bar(2, 560, 12)], Infinity);
  assert.equal(wellClear.get(2)?.lift, 0);
});

test('a bar eases to its new height over a few frames rather than jumping', () => {
  const layout = new BarLayout();
  layout.lay([bar(1, 400, 10), bar(2, 700, 12)], 1 / 60);
  const first = layout.lay([bar(1, 400, 10), bar(2, 420, 12)], 1 / 60).get(2)?.lift ?? 0;
  assert.ok(first > 0 && first < 10, `a frame on it has risen a little: ${first}`);
  let lift = first;
  for (let frame = 0; frame < 60; frame++)
    lift = layout.lay([bar(1, 400, 10), bar(2, 420, 12)], 1 / 60).get(2)?.lift ?? 0;
  assert.ok(Math.abs(lift - 28) < 0.5, `a second on it stands just above the other: ${lift}`);
});

test('a bar gone is forgotten, and comes back at its place at once', () => {
  const layout = new BarLayout();
  layout.lay([bar(1, 400, 10), bar(2, 420, 12)], Infinity);
  layout.lay([bar(1, 400, 10)], 1 / 60);
  const back = layout.lay([bar(1, 400, 10), bar(2, 420, 12)], 1 / 60);
  assert.equal(back.get(2)?.lift, 28);
});

test('a plate over a figure high on the screen, or lifted over another, stands under the compass, never over it', () => {
  const high = [bar(1, 400, 10, 40), bar(2, 410, 20, UNDER_COMPASS + 30)];
  const drawn = boxes(high, new BarLayout().lay(high, Infinity));
  for (const [, top] of drawn) assert.ok(top >= UNDER_COMPASS, `a plate's top at ${top} px`);
  assertApart(high, new BarLayout().lay(high, Infinity));
});

test("while the sea fight's card stands under the compass, a plate high on the screen stands under the card", () => {
  const high = [bar(1, 400, 10, 40), bar(2, 410, 20, 60)];
  const layout = new BarLayout();
  layout.top = 160;
  const laid = layout.lay(high, Infinity);
  for (const [, top] of boxes(high, laid)) assert.ok(top >= 160, `a plate's top at ${top} px`);
  assertApart(high, laid);
});
