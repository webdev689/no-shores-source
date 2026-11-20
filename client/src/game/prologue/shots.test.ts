import assert from 'node:assert/strict';
import { test } from 'node:test';
import { railShot } from '../../cinema/rail.ts';
import { fightMove } from './fighters.ts';
import { homeRail, type IslandFrame, shipsOff, titleEye } from './introShots.ts';
import { thrownAt } from './overboard.ts';
import { lidsAt } from './wake.ts';

const FRAME: IslandFrame = {
  town: [1000, 1000, 40],
  out: Math.PI / 2,
  plaza: [1010, 1000, 52],
  anchorage: [2600, 1000],
};

test('Saltmere is glided into from the cloud over the sea, and ends on the title view, still', () => {
  const home = homeRail(FRAME);
  const first = home[0];
  assert.ok(first && first.eye[2] > 1000, 'it starts in the cloud');
  assert.ok(first.eye[0] > FRAME.town[0] + 2000, 'out over the sea, past the harbour');
  const end = railShot(home, 999, 0.9);
  assert.deepEqual(end.eye, titleEye(FRAME, 0));
  assert.ok(end.pitch > 0, 'looking down at the town');
});

test('ships off an island sail out from it, and the anchored one stays', () => {
  const [early, later] = [shipsOff(FRAME, 0), shipsOff(FRAME, 10)];
  assert.equal(early.length, 3);
  assert.ok(Math.hypot((later[0]?.x ?? 0) - (early[0]?.x ?? 0), (later[0]?.y ?? 0) - (early[0]?.y ?? 0)) > 40);
  assert.deepEqual([later[2]?.x, later[2]?.y], [early[2]?.x, early[2]?.y]);
});

test('a pair of fighters take turns: one strikes while the other guards', () => {
  const blows = ['over1h', 'side1h'];
  const striking = (clock: number, phase: number) => blows.includes(fightMove(blows, clock, phase));
  for (let clock = 0; clock < 9; clock += 0.25) assert.ok(!(striking(clock, 0) && striking(clock, 2.2)), `at ${clock}`);
  assert.ok([0, 0.5, 1, 2.5, 3].some((clock) => striking(clock, 0)));
});

test('the eyes blink open over the first seconds and stay open', () => {
  assert.equal(lidsAt(0), 1);
  assert.ok(lidsAt(1.1) < 0.5);
  assert.ok(lidsAt(1.9) > 0.9, 'shut again');
  assert.equal(lidsAt(10), 0);
});

test('the body thrown goes up and over the rail and into the sea', () => {
  const from = [0, 0, 5] as const;
  const top = Math.max(...[0.2, 0.4, 0.6].map((into) => thrownAt(from, into)[2]));
  assert.ok(top > 5.5, 'up first');
  const landed = thrownAt(from, 5);
  assert.ok(landed[0] > 8, 'clear over the side');
  assert.ok(landed[2] < 0, 'under the sea');
});
