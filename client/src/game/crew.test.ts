import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellHeight, SLOOP_DECK } from '../ships/deck.ts';
import { clearLeg, Crew, STAND_INS } from './crew.ts';

test('the stand-in hands walk its deck from spot to spot, always on it and clear of its wheel', () => {
  const crew = new Crew(SLOOP_DECK, 7);
  assert.equal(crew.hands.length, STAND_INS);
  const [helmX, helmY] = SLOOP_DECK.helm;
  const start = crew.hands.map((hand) => [hand.x, hand.y]);
  let walked = false;
  for (let tick = 0; tick < 60 * 40; tick++) {
    crew.step(1 / 60);
    for (const hand of crew.hands) {
      assert.notEqual(cellHeight(SLOOP_DECK, hand.x, hand.y), null, `on its deck at ${hand.x}, ${hand.y}`);
      walked ||= hand.walking;
    }
  }
  assert.ok(walked, 'they set off');
  assert.ok(
    crew.hands.some(
      (hand, index) => Math.hypot(hand.x - (start[index]?.[0] ?? 0), hand.y - (start[index]?.[1] ?? 0)) > 0.5,
    ),
    'and are somewhere else forty seconds on',
  );
  for (const hand of crew.hands) if (!hand.walking) assert.ok(Math.hypot(hand.x - helmX, hand.y - helmY) > 1.2);
});

test('the same seed walks the same crew, however the seconds are cut', () => {
  const where = (crew: Crew) => crew.hands.map((hand) => [hand.x.toFixed(6), hand.y.toFixed(6)]);
  for (const seed of [3, 7, 11, 19]) {
    const [byTicks, bySeconds] = [new Crew(SLOOP_DECK, seed), new Crew(SLOOP_DECK, seed)];
    for (let tick = 0; tick < 1800; tick++) byTicks.step(1 / 60);
    for (let second = 0; second < 30; second++) bySeconds.step(1);
    assert.deepEqual(where(byTicks), where(bySeconds), `seed ${seed}`);
  }
});

test("a leg is clear only where every point of it is deck, without a step past the planks' own", () => {
  assert.ok(clearLeg(SLOOP_DECK, SLOOP_DECK.helm, [SLOOP_DECK.helm[0] - 0.3, SLOOP_DECK.helm[1]]));
  assert.ok(!clearLeg(SLOOP_DECK, SLOOP_DECK.helm, [5, SLOOP_DECK.helm[1]]), 'over its side');
});
