import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellHeight, HULL_DECKS, SLOOP_DECK } from '../ships/deck.ts';
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

test('a hand sent to a post walks there only once the deck leaves a clear way; never through what stands on it', () => {
  const deck = HULL_DECKS[2] ?? SLOOP_DECK;
  const crew = new Crew(deck, 5, 4);
  const spots = new Crew(deck, 9, 40).hands.map((hand) => [hand.x, hand.y, hand.z] as const);
  // A post across the deck from each hand, as a run-out battery's guns stand across from a hand on the other side.
  const posts = crew.hands.map((hand) => {
    const far = spots.reduce((best, spot) =>
      Math.hypot(spot[0] - hand.x, spot[1] - hand.y) > Math.hypot(best[0] - hand.x, best[1] - hand.y) ? spot : best,
    );
    return { x: far[0], y: far[1], z: far[2], facing: 0 };
  });
  for (let tick = 0; tick < 60 * 30; tick++) {
    const before = crew.hands.map((hand) => [hand.x, hand.y] as const);
    crew.step(1 / 60, posts);
    crew.hands.forEach((hand, index) => {
      const [x = 0, y = 0] = before[index] ?? [];
      assert.ok(
        clearLeg(deck, [x, y], [hand.x, hand.y]),
        `a hand stepped through what stands on the deck at ${x}, ${y}`,
      );
    });
  }
});

test('a hand at one post sent to another with no clear way there leaves it, walks on and asks again', () => {
  let reached = 0;
  for (const deck of HULL_DECKS) {
    const crew = new Crew(deck, 5, 4);
    crew.step(
      1,
      crew.hands.map((hand) => ({ x: hand.x, y: hand.y, z: hand.z, facing: 0 })),
    );
    const spots = new Crew(deck, 9, 40).hands.map((hand) => [hand.x, hand.y, hand.z] as const);
    // The farthest spot each hand has no straight way to, as a battery's guns across the deck behind the mast.
    const posts = crew.hands.map((hand) => {
      const shut = spots.filter((spot) => !clearLeg(deck, [hand.x, hand.y], [spot[0], spot[1]]));
      const far = shut.reduce((best, spot) =>
        Math.hypot(spot[0] - hand.x, spot[1] - hand.y) > Math.hypot(best[0] - hand.x, best[1] - hand.y) ? spot : best,
      );
      return { x: far[0], y: far[1], z: far[2], facing: 0 };
    });
    const walked = crew.hands.map(() => 0);
    for (let tick = 0; tick < 60 * 60; tick++) {
      const before = crew.hands.map((hand) => [hand.x, hand.y] as const);
      crew.step(1 / 60, posts);
      crew.hands.forEach((hand, index) => {
        const [x = 0, y = 0] = before[index] ?? [];
        walked[index] = (walked[index] ?? 0) + Math.hypot(hand.x - x, hand.y - y);
      });
    }
    walked.forEach((metres, index) => assert.ok(metres > 5, `hand ${index} walked ${metres.toFixed(2)} m`));
    crew.hands.forEach((hand, index) => {
      const post = posts[index];
      if (post && Math.hypot(post.x - hand.x, post.y - hand.y) < 0.01) reached++;
    });
  }
  assert.ok(reached > 0, 'a hand that comes to a clear way takes it');
});
