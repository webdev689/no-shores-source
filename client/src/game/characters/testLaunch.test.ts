import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NodeInfo } from '../worldData.ts';
import { characterMarked, keepTestRun } from './characterMark.ts';
import { type StandingIn, enterTestRun } from './testLaunch.ts';

const storeOf = (kept: Record<string, string> = {}) => ({
  kept,
  getItem: (key: string) => kept[key] ?? null,
  setItem: (key: string, value: string) => void (kept[key] = value),
  removeItem: (key: string) => void delete kept[key],
});
const NODES = [
  { id: 'pearl-tomb', kind: 'patrol' },
  { id: 'saltgrass-downs', kind: 'patrol' },
] as NodeInfo[];

/** The watch over a tab kept for `room`, the player standing as `standing` says, a second a look. */
function watching(room: string | null) {
  const tab = storeOf();
  if (room) keepTestRun(tab, room);
  let standing: StandingIn = null;
  let look: () => void = () => undefined;
  let [now, stopped, left] = [0, false, 0];
  const asked: string[] = [];
  enterTestRun(
    tab,
    NODES,
    () => standing,
    {
      intoRun: (node, run) => asked.push(`run ${node.id} ${run}`),
      toBreach: (run) => asked.push(`breach ${run}`),
    },
    () => left++,
    { every: (work) => ((look = work), () => (stopped = true)), now: () => now },
  );
  const tick = (where: StandingIn) => {
    standing = where;
    now += 1000;
    if (!stopped) look();
  };
  return { tab, asked, tick, left: () => left, stopped: () => stopped };
}

test('a playlist test run is gone into once on foot, asked again while refused, and left back to the Test Room', () => {
  const room = 'node-pearl-tomb--elite--playlist-32--test-ab12cd34';
  const watch = watching(room);
  watch.tick(null);
  assert.deepEqual(watch.asked, [], 'not while under way');
  watch.tick(['node-overlook-social', null, null]);
  assert.deepEqual(watch.asked, [`run pearl-tomb ${room}`]);
  watch.tick([null, null, null]);
  assert.equal(watch.asked.length, 1, 'not asked again within three seconds');
  watch.tick([null, null, null]);
  watch.tick([null, null, null]);
  assert.equal(watch.asked.length, 2, 'asked again once refused');
  watch.tick([room, null, null]);
  assert.equal(characterMarked(watch.tab), 'test', 'a reload in it opens the Test Room');
  watch.tick([room, null, null]);
  assert.equal(watch.left(), 0);
  watch.tick([null, null, null]);
  assert.equal(watch.left(), 1, 'out of it, back to the Test Room');
  assert.ok(watch.stopped());
});

test('a Breach test goes to its gate, its zone copy counting as the test; nothing without a test kept', () => {
  const run = 'node-saltgrass-downs--breach-hard--test-ab12cd34';
  const watch = watching(run);
  watch.tick([]);
  assert.deepEqual(watch.asked, [`breach ${run}`], 'at sea too, the way to the gate is asked');
  watch.tick([null, null, run]);
  watch.tick([null, run, null]);
  assert.equal(watch.left(), 0, 'the zone copy and the run are both the test');
  const none = watching(null);
  none.tick([]);
  assert.deepEqual(none.asked, []);
  const real = watching('node-pearl-tomb--elite--run-ab12cd34');
  real.tick([]);
  assert.deepEqual(real.asked, [], 'only a test room is launched so');
});

test('a test room refused ten times over goes back to the Test Room', () => {
  const watch = watching('node-pearl-tomb--elite--playlist-32--test-ab12cd34');
  for (let look = 0; look < 40; look++) watch.tick([null, null, null]);
  assert.equal(watch.asked.length, 10);
  assert.equal(watch.left(), 1);
  assert.ok(watch.stopped());
});
