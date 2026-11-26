import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DOWN_S,
  DRAW_S,
  dotsOnScreen,
  LEG_DOTS,
  LOW,
  RISE_S,
  settledShot,
  WALK_S,
  type WayAsk,
  wayAt,
  wayClock,
  wayLength,
  wayOf,
} from './passageWay.ts';

const viewport = { width: 1280, height: 720 };
// Saltmere's first zones and a deeper one, as the web lays them, and the patrol zone west of them.
const ask: WayAsk = {
  from: { eye: [2_812_500, 1_291_504, 22], look: [2_812_500, 1_291_500, 20], fov: 1.2 },
  come: [
    [2_826_000, 1_291_500],
    [2_812_500, 1_291_500],
  ],
  to: [2_798_500, 1_305_500],
  framed: [
    [2_784_500, 1_291_500],
    [2_770_000, 1_320_000],
    [2_740_000, 1_360_000],
  ],
  arrive: { at: [2_798_510, 1_305_520, 20], facing: Math.PI / 2 },
  open: true,
  viewport,
};
const way = wayOf(ask);

test('the camera rises off the player over 1.5 s and holds over the island, every place of the web in the picture', () => {
  const first = wayAt(way, 0);
  assert.equal(first.beat, 'rise');
  assert.deepEqual(first.shot.eye, [...ask.from.eye]);
  assert.equal(wayAt(way, RISE_S - 0.01).beat, 'rise');
  const over = wayAt(way, RISE_S + 0.01);
  assert.equal(over.beat, 'draw');
  assert.ok(over.shot.eye[2] > 1_000, 'the island is seen whole from high over it');
  const places = [...ask.framed, ...ask.come, ask.to].map(([x, y]) => ({ at: [x, y, 0] as const, taking: false }));
  const shown = dotsOnScreen(over.shot, viewport, places);
  assert.equal(shown.length, places.length);
  for (const { x, y } of shown)
    assert.ok(x >= 0 && x <= viewport.width && y >= 0 && y <= viewport.height, `${x}, ${y}`);
});

test('the way so far shows as dots, the way being taken drawn a dot at a time over 2 s to the next zone', () => {
  const taking = (seconds: number) => wayAt(way, seconds).dots.filter((dot) => dot.taking).length;
  const come = wayAt(way, 0).dots;
  assert.equal(come.length, 1 + LEG_DOTS, 'the patrol zone, then a leg to the zone left');
  assert.equal(taking(RISE_S), 0);
  assert.equal(taking(RISE_S + DRAW_S / 2), LEG_DOTS / 2);
  assert.equal(taking(RISE_S + DRAW_S - 0.001), LEG_DOTS);
  const last = wayAt(way, RISE_S + DRAW_S - 0.001).dots.at(-1);
  assert.deepEqual(last?.at.slice(0, 2), [...ask.to]);
});

test('the clock waits over the island until the room gone to is ready', () => {
  assert.equal(wayClock(1, 0.5, false), 1.5);
  assert.equal(wayClock(RISE_S + DRAW_S - 0.1, 0.5, false), RISE_S + DRAW_S);
  assert.equal(wayClock(RISE_S + DRAW_S, 0.5, false), RISE_S + DRAW_S);
  assert.equal(wayClock(RISE_S + DRAW_S, 0.5, true), RISE_S + DRAW_S + 0.5);
  const held = wayAt(way, wayClock(RISE_S + DRAW_S - 0.1, 0.5, false));
  assert.equal(held.beat, 'draw', 'held over the island, not on the way down');
  assert.equal(held.dots.filter((dot) => dot.taking).length, LEG_DOTS);
  assert.equal(held.inPlace, false);
});

test('above ground the way comes down from a low framing over the arrival, the place filling the view', () => {
  const down = wayAt(way, RISE_S + DRAW_S + 1e-9);
  assert.equal(down.beat, 'down');
  assert.ok(down.inPlace && down.held && !down.walking);
  assert.ok(down.settled < 1e-6, 'it starts from the low framing itself');
  const [x, y, z] = ask.arrive.at;
  const { eye, pitch } = down.shot;
  assert.ok(eye[2] - z <= LOW.upM + 1e-6 && eye[2] - z > 5, 'low over the place, not over the island');
  assert.ok(Math.abs(Math.hypot(eye[0] - x, eye[1] - y) - LOW.backM) < 1e-6, 'in front of the way in');
  // The view's top edge no higher than the horizon, the place's walls standing along it and no sky past them, and
  // the ground the arrival faces in the middle of the picture.
  const top = (pitch ?? 0) - down.shot.fov / 2;
  assert.ok(top > -0.02, `the view's top no higher than the horizon (${top})`);
  // Facing east: the ground ahead of the arrival lies east of it.
  const faced = dotsOnScreen(down.shot, viewport, [{ at: [x + LOW.aheadM, y, z], taking: false }]);
  assert.ok(
    faced[0] && Math.abs(faced[0].x - viewport.width / 2) < 1 && Math.abs(faced[0].y - viewport.height / 2) < 1,
  );
  // The camera settles into the foot's own over the down beat, eased.
  assert.ok(wayAt(way, RISE_S + DRAW_S + DOWN_S / 2).settled > 0.4);
  assert.ok(wayAt(way, RISE_S + DRAW_S + DOWN_S - 1e-6).settled > 0.99);
});

test('the character walks in with the foot’s own camera, inputs held till the way has played', () => {
  const walk = wayAt(way, RISE_S + DRAW_S + DOWN_S + 0.01);
  assert.equal(walk.beat, 'walk');
  assert.ok(walk.walking && walk.held && walk.inPlace);
  assert.equal(walk.settled, 1, 'the camera is the foot’s own, which keeps out of the walls');
  const end = wayAt(way, wayLength(way));
  assert.equal(end.beat, 'done');
  assert.ok(!end.walking && !end.held);
});

test('under ground the way cuts from the island to the foot’s own camera, no rail through the rock over it', () => {
  const under = wayOf({ ...ask, open: false });
  const first = wayAt(under, RISE_S + DRAW_S + 1e-9);
  assert.equal(first.beat, 'walk');
  assert.equal(first.settled, 1);
  assert.equal(wayLength(under), RISE_S + DRAW_S + WALK_S);
});

test('a lamp’s Home is the same way, its leg running back to the patrol zone', () => {
  const home = wayOf({ ...ask, to: ask.come[0] ?? [0, 0] });
  const leg = wayAt(home, RISE_S + DRAW_S - 0.001).dots.filter((dot) => dot.taking);
  assert.deepEqual(leg.at(-1)?.at.slice(0, 2), [...(ask.come[0] ?? [])]);
});

test('the low framing stands in the place’s own frame, over the arrival there', () => {
  const zoned = wayOf({ ...ask, arrive: { at: [10, 20, 20], facing: Math.PI / 2 } });
  const down = wayAt(zoned, RISE_S + DRAW_S + 1e-9);
  assert.equal(wayAt(zoned, RISE_S + DRAW_S).inPlace, false, 'over the island in the world');
  assert.ok(down.inPlace);
  assert.deepEqual(down.shot.eye, [10 - LOW.backM, 20, 20 + LOW.upM]);
  assert.ok(Math.abs(down.shot.yaw - Math.PI / 2) < 1e-6, 'looking east, along the arrival');
});

test('the way’s camera settles into the foot’s own as the character walks in, its yaw the shorter way round', () => {
  const shot = { eye: [0, 0, 10] as [number, number, number], yaw: 3, pitch: 0.2, fov: 1 };
  const own = { eye: [4, 2, 2] as const, yaw: -3, pitch: 0.1, fov: 1.2 };
  assert.deepEqual(settledShot(shot, own, 0), shot);
  const settled = settledShot(shot, own, 1);
  assert.deepEqual(settled.eye, [4, 2, 2]);
  assert.ok(Math.abs(Math.sin(settled.yaw - own.yaw)) < 1e-9 && Math.cos(settled.yaw - own.yaw) > 0);
  assert.ok(Math.abs(settledShot(shot, own, 0.5).yaw - (3 + (2 * Math.PI - 6) / 2)) < 1e-9, 'through south, not round');
  assert.ok(Math.abs((settled.pitch ?? 0) - 0.1) < 1e-9 && Math.abs(settled.fov - 1.2) < 1e-9);
});
