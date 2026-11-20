import assert from 'node:assert/strict';
import { test } from 'node:test';
import { railShot } from '../../cinema/rail.ts';
import { fightMove } from './fighters.ts';
import { fightRail, homeRail, type IslandFrame, passingRail, shipsOff, titleEye } from './introShots.ts';
import { thrownAt } from './overboard.ts';
import { lidsAt } from './wake.ts';

const FRAME: IslandFrame = {
  town: [1000, 1000, 40],
  out: Math.PI / 2,
  plaza: [1010, 1000, 52],
  anchorage: [2600, 1000],
};

test('a passing island is flown into from the cloud over the sea and out into the cloud again', () => {
  const rail = passingRail(FRAME, 1);
  const [first, last] = [rail[0], rail[rail.length - 1]];
  assert.ok(first && last);
  assert.ok(first.eye[2] > 1000 && last.eye[2] > 1000, 'in the cloud at both ends');
  assert.ok(first.eye[0] > FRAME.town[0] + 2000, 'coming in from the sea, out past the harbour');
  const lowest = Math.min(...rail.map((key) => key.eye[2]));
  assert.ok(lowest < 300 && lowest > FRAME.town[2] + 100, 'down under the cloud, over the town');
});

test('the fight is seen from low over the plaza, and Saltmere ends on the title view, still', () => {
  const fight = fightRail(FRAME, -1);
  const closest = Math.min(...fight.map((key) => Math.hypot(key.eye[0] - FRAME.plaza[0], key.eye[1] - FRAME.plaza[1])));
  assert.ok(closest < 30, `within ${closest} m of the plaza`);
  const home = homeRail(FRAME);
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
