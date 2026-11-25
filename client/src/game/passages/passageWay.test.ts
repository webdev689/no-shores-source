import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DRAW_S,
  dotsOnScreen,
  LEG_DOTS,
  RISE_S,
  settledShot,
  WALK_M,
  WAY_S,
  type WayAsk,
  wayAt,
  wayClock,
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
  assert.equal(held.body, null);
});

test('the camera comes down behind the character, who walks 3 m in over 1.5 s to the arrival, inputs held till then', () => {
  const down = wayAt(way, RISE_S + DRAW_S + 0.01);
  assert.equal(down.beat, 'down');
  const walkStart = wayAt(way, WAY_S - 1.5);
  const end = wayAt(way, WAY_S);
  assert.equal(walkStart.beat, 'walk');
  assert.ok(walkStart.held && down.held);
  assert.equal(end.beat, 'done');
  assert.equal(end.held, false);
  assert.ok(walkStart.body && end.body);
  const walked = Math.hypot(end.body.at[0] - walkStart.body.at[0], end.body.at[1] - walkStart.body.at[1]);
  assert.ok(Math.abs(walked - WALK_M) < 1e-6);
  assert.deepEqual(end.body.at, [...ask.arrive.at]);
  // Behind them, facing east: the eye stands west of the body, looking along their bearing.
  assert.ok(end.shot.eye[0] < end.body.at[0]);
  assert.ok(Math.abs(end.shot.yaw - Math.PI / 2) < 1e-6);
  // The rail down ends where the walk's camera starts, so nothing jumps.
  const lastDown = wayAt(way, WAY_S - 1.5 - 1e-9);
  assert.ok(Math.hypot(...lastDown.shot.eye.map((along, axis) => along - (walkStart.shot.eye[axis] ?? 0))) < 0.01);
});

test('a lamp’s Home is the same way, its leg running back to the patrol zone', () => {
  const home = wayOf({ ...ask, to: ask.come[0] ?? [0, 0] });
  const leg = wayAt(home, RISE_S + DRAW_S - 0.001).dots.filter((dot) => dot.taking);
  assert.deepEqual(leg.at(-1)?.at.slice(0, 2), [...(ask.come[0] ?? [])]);
});

test('the way comes down in the zone’s own frame: the camera over the island is the same place, the arrival the zone’s', () => {
  const origin = [ask.to[0], ask.to[1], 0] as const;
  const zoned = wayOf({ ...ask, arrive: { at: [10, 20, 20], facing: Math.PI / 2 }, origin });
  const over = wayAt(zoned, RISE_S + DRAW_S);
  const down = wayAt(zoned, RISE_S + DRAW_S + 1e-9);
  assert.equal(over.inPlace, false, 'over the island in the world');
  assert.equal(down.inPlace, true);
  // The same eye, measured from the zone's frame: no jump as the way comes down.
  const moved = over.shot.eye.map((along, axis) => along - (origin[axis] ?? 0) - (down.shot.eye[axis] ?? 0));
  assert.ok(Math.hypot(...moved) < 0.01, `${moved.join(', ')}`);
  const end = wayAt(zoned, WAY_S);
  assert.deepEqual(end.body?.at, [10, 20, 20]);
  assert.equal(end.walked, 1);
  assert.ok(Math.abs(end.shot.eye[0] - (10 - 4.5)) < 1e-6, 'behind the arrival in the zone’s frame');
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
