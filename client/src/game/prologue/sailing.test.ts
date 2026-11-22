import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellHeight } from '../../ships/deck.ts';
import { actorFrame } from './actors.ts';
import { BRIG_DECK, Brig, deckPoint, helmSpot } from './brig.ts';
import { creationEye, helmInShip } from './helm.ts';
import { onDeck } from './sailing.ts';

const near = (actual: number, expected: number, within = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= within, `${actual} is not ${expected}`);

test('a point on its deck lies forward along its heading and to starboard at its right', () => {
  const place = { x: 100, y: 200, z: 0.5, heading: Math.PI / 2, pitch: 0, roll: 0 };
  const bow = onDeck(place, 10, 0, 2);
  near(bow[0], 110);
  near(bow[1], 200);
  near(bow[2], 2.5);
  const starboard = onDeck(place, 0, 3, 0);
  near(starboard[0], 100);
  near(starboard[1], 203, 1e-9);
  const heeled = onDeck({ ...place, roll: 0.2 }, 0, 3, 0);
  assert.ok(heeled[2] < place.z, 'heeled to starboard, its starboard side goes down');
  assert.ok(onDeck({ ...place, pitch: 0.1 }, 10, 0, 0)[2] > place.z, 'its bow rises');
  near(onDeck({ ...place, scale: 2 }, 5, 0, 0)[0], 110);
});

test('every hand of its crew stands on its deck, and the helm is behind its wheel aft', () => {
  const brig = new Brig([0, 0], 0);
  const place = { x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0 };
  const crew = brig.crew(place, 0);
  assert.equal(crew.length, 7);
  for (const hand of crew) {
    // Heading north, its deck's x is east and y south: the deck under each hand has a height.
    assert.notEqual(cellHeight(BRIG_DECK, hand.x, hand.y), null, `${hand.anim} at ${hand.x}, ${hand.y}`);
  }
  const [, helmY, helmZ] = helmSpot();
  assert.ok(helmY > 8, 'the helm is aft');
  assert.ok(helmZ > 2.8, 'on its quarterdeck');
  assert.deepEqual(deckPoint(place, 1, 2, 3), [1, 2, 3]);
  assert.deepEqual([...brig.heads(place).keys()].sort(), ['bosun', 'gunner', 'lookout', 'mate']);
});

test('it sails along its heading at its storm way, and stops when the story stops it', () => {
  const brig = new Brig([0, 0], Math.PI / 2);
  brig.step(10);
  near(brig.x, 32, 1e-9);
  brig.way = 0;
  brig.step(10);
  near(brig.x, 32, 1e-9);
  assert.equal(brig.sailed().underWay, false);
});

test('the creation camera opens off the helm to port, clear of the wheel before the player, and looks to their side', () => {
  const [forward, starboard] = helmInShip();
  const { eye, look } = creationEye(0);
  assert.ok(eye[1] < starboard - 3, 'off their port side');
  assert.ok(Math.abs(eye[0] - forward) < 0.5, 'abeam of them on a wide view, not over the wheel before them');
  // Looking to starboard from their port side, the camera's right is aft: the look goes aft of them, so they stand
  // left on the view.
  assert.ok(look[0] < forward, 'the look to their side');
  const turned = creationEye(Math.PI / 2).eye;
  assert.ok(turned[0] > forward + 3, 'a quarter turn round them stands in front of them');
  assert.ok(creationEye(0, 9 / 16).eye[0] > forward + 1, 'on a tall view a little forward of abeam');
});

test('a move held plays through once and stays on its last frame; a looping one goes round', () => {
  assert.equal(actorFrame({ since: 0, hold: true }, 10, 6), 5);
  assert.equal(actorFrame({ since: 0, hold: true }, 0.2, 6), 1);
  assert.equal(actorFrame({ since: 0 }, 1, 4), 2);
  assert.equal(actorFrame({ since: 5 }, 4, 4), 0, 'not yet begun is its first frame');
});
