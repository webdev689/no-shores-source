import assert from 'node:assert/strict';
import { test } from 'node:test';
import { courseOf, inArea, pointAlong, readWreck, topAt } from './wreckLayout.ts';
import {
  ARENA_CLEAR_M,
  ALIVE_MOST,
  BOSS_SECONDS,
  BROUGHT_BACK_S,
  IN_THE_SEA_M,
  type Seen,
  WreckProgress,
} from './wreckProgress.ts';

const layout = readWreck();
const middle = (zone: number) => {
  const [minX, minY, maxX, maxY] = layout.zones[zone]?.area ?? [0, 0, 0, 0];
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: 3 };
};
const standing = (zone: number, more: Partial<Seen> = {}): Seen => ({
  ...middle(zone),
  dead: false,
  alive: [],
  thule: null,
  ...more,
});
/** A point of a zone's area over the open sea, no block of the wreck under it, a body fallen in there. */
const sea = (zone: number, more: Partial<Seen> = {}): Seen => {
  const [minX, minY, maxX, maxY] = layout.zones[zone]?.area ?? [0, 0, 0, 0];
  const course = courseOf(layout);
  for (let x = minX; x <= maxX; x += 0.25)
    for (let y = minY; y <= maxY; y += 0.25)
      if (topAt(course, x, y) === 0) return { ...standing(zone), x, y, z: 0, ...more };
  throw new Error(`no sea in ${layout.zones[zone]?.name}`);
};

test('waking on the quiet deck reaches the first zone and keeps its checkpoint, with no foe stood', () => {
  const progress = new WreckProgress(layout);
  assert.equal(progress.zone, -1);
  const asks = progress.frame(standing(0), 0.016);
  assert.equal(progress.zone, 0);
  assert.deepEqual(asks.checkpoint, layout.zones[0]?.checkpoint);
  assert.deepEqual(asks.stand, [], 'the deck the player wakes on is quiet');
  for (let frame = 0; frame < 600; frame++)
    assert.deepEqual(progress.frame(standing(0), 0.1).stand, [], 'however long they stay');
});

test("no zone's wave stands before the player enters it, and all of it stands as they do", () => {
  const progress = new WreckProgress(layout);
  progress.frame(standing(0), 0.016);
  for (let zone = 1; zone < layout.arena.zone; zone++) {
    const alive = layout.zones.map(() => 0);
    const asks = progress.frame(standing(zone, { alive }), 0.016);
    const wave = (layout.zones[zone]?.wave ?? []).map((foe) => ({ ...foe, zone }));
    assert.deepEqual(asks.stand, wave, `${layout.zones[zone]?.name}'s wave, and no later one`);
    // Its wave falls: the way on opens a frame later.
    progress.frame(standing(zone, { alive }), 0.016);
  }
});

test('each zone along the path is reached in turn with its checkpoint, and never twice', () => {
  const progress = new WreckProgress(layout);
  layout.zones.forEach((zone, index) => {
    assert.deepEqual(progress.frame(standing(index), 0.016).checkpoint, zone.checkpoint);
    assert.equal(progress.frame(standing(index), 0.016).checkpoint, null);
  });
  assert.equal(progress.zone, layout.zones.length - 1);
  assert.equal(progress.arena, true);
});

test('no more foes stand than may be alive at once; the rest wait until some fall', () => {
  const progress = new WreckProgress(layout);
  progress.frame(standing(0), 0.016);
  assert.deepEqual(progress.frame(standing(1, { alive: [ALIVE_MOST] }), 0.016).stand, [], 'six alive: nobody more');
  assert.equal(progress.frame(standing(1, { alive: [ALIVE_MOST - 1] }), 0.016).stand.length, 1, 'five alive');
  const wave = layout.zones[1]?.wave.length ?? 0;
  assert.equal(progress.frame(standing(1, { alive: [0, 1] }), 0.016).stand.length, wave - 1, 'the rest');
});

test('a body in the sea reaches no zone, and the sea brings no one back who lies dead', () => {
  const progress = new WreckProgress(layout);
  progress.frame(standing(0), 0.016);
  assert.equal(progress.frame(sea(1), 0.016).checkpoint, null);
  assert.equal(progress.zone, 0);
  for (let frame = 0; frame < 30; frame++) assert.equal(progress.frame(sea(0, { dead: true }), 0.1).bringBack, null);
});

test("the wreck's own ground lower than the sea's line, as the Sloop's side, is never the sea", () => {
  const progress = new WreckProgress(layout);
  layout.zones.slice(0, 5).forEach((unused, index) => progress.frame(standing(index), 0.016));
  const [x, y] = [25.75, 26.85];
  const z = topAt(courseOf(layout), x, y);
  assert.ok(z > 0 && z < IN_THE_SEA_M, `the Sloop's side is ${z} m up`);
  for (let frame = 0; frame < 40; frame++)
    assert.equal(progress.frame({ ...standing(4), x, y, z }, 0.1).bringBack, null, 'walked, never brought back');
});

test('once the boss fight begins, no wave still waiting comes', () => {
  const progress = new WreckProgress(layout);
  progress.frame(standing(0, { alive: [ALIVE_MOST] }), 0.016);
  progress.beginBoss();
  assert.deepEqual(progress.frame(standing(0, { alive: [] }), 0.016).stand, []);
});

test('a fall into the sea is brought back to the last checkpoint after a moment, never a death', () => {
  const progress = new WreckProgress(layout);
  progress.frame(standing(0), 0.016);
  progress.frame(standing(1), 0.016);
  const fallen = sea(1);
  let back = null;
  let waited = 0;
  while (!back && waited < 5) {
    back = progress.frame(fallen, 0.1).bringBack;
    waited += 0.1;
  }
  assert.deepEqual(back, layout.zones[1]?.checkpoint);
  assert.ok(waited >= BROUGHT_BACK_S - 1e-9, `after ${waited} s`);
  assert.equal(progress.frame(standing(1), 0.1).bringBack, null);
});

const inArena = (more: Partial<Seen> = {}) => standing(layout.arena.zone, more);

/** A progress through the whole path and into the boss fight. */
function atTheBoss(): WreckProgress {
  const progress = new WreckProgress(layout);
  layout.zones.forEach((unused, index) => progress.frame(standing(index), 0.016));
  progress.beginBoss();
  return progress;
}

test('the boss fight ends felled when the player falls', () => {
  const progress = atTheBoss();
  progress.frame(inArena({ thule: { health: 900, healthMax: 1000 } }), 1);
  assert.equal(progress.outcome, null);
  progress.frame(inArena({ dead: true, thule: { health: 900, healthMax: 1000 } }), 1);
  assert.equal(progress.outcome, 'felled');
});

test('the boss fight ends overpowered once Thule is brought under a third, never with him dead', () => {
  const progress = atTheBoss();
  progress.frame(inArena({ thule: { health: 340, healthMax: 1000 } }), 1);
  assert.equal(progress.outcome, null);
  progress.frame(inArena({ thule: { health: 330, healthMax: 1000 } }), 1);
  assert.equal(progress.outcome, 'overpowered');
  progress.frame(inArena({ dead: true, thule: { health: 330, healthMax: 1000 } }), 1);
  assert.equal(progress.outcome, 'overpowered', 'the end is kept');
});

test('the boss fight ends overpowered once its time runs out', () => {
  const progress = atTheBoss();
  for (let second = 0; second < BOSS_SECONDS - 1; second++)
    progress.frame(inArena({ thule: { health: 900, healthMax: 1000 } }), 1);
  assert.equal(progress.outcome, null);
  progress.frame(inArena({ thule: { health: 900, healthMax: 1000 } }), 1);
  assert.equal(progress.outcome, 'overpowered');
});

test('once the boss fight begins, a player out of the arena is brought back into it', () => {
  const progress = atTheBoss();
  assert.deepEqual(progress.frame(standing(4), 0.016).bringBack, layout.zones[layout.arena.zone]?.checkpoint);
  assert.equal(progress.zone, layout.arena.zone, 'going back reaches no earlier zone');
});

test('the way on from a zone stays closed until its wave has fallen: climbed over, it brings the player back', () => {
  const progress = new WreckProgress(layout);
  progress.frame(standing(0), 0.016);
  progress.frame(standing(1), 0.016);
  const fighting = progress.frame(standing(2, { alive: [0, 2] }), 0.016);
  assert.deepEqual(fighting.open, [], 'the first wave stands');
  assert.deepEqual(fighting.bringBack, layout.zones[1]?.checkpoint, 'over the heap and back');
  assert.equal(progress.zone, 1, 'beyond a closed way no zone is reached');
  assert.deepEqual(progress.frame(standing(1, { alive: [0, 0] }), 0.016).open, [1], 'the first wave has fallen');
  assert.deepEqual(progress.frame(standing(2, { alive: [0, 0] }), 0.016).checkpoint, layout.zones[2]?.checkpoint);
  assert.deepEqual(progress.frame(standing(3, { alive: [0, 0, 1] }), 0.016).bringBack, layout.zones[2]?.checkpoint);
});

test('a wave stood this frame is not yet fallen, nor one with foes still waiting their turn', () => {
  const progress = new WreckProgress(layout);
  progress.frame(standing(0), 0.016);
  assert.deepEqual(progress.frame(standing(1), 0.016).open, [], 'stood, not yet seen');
  const crowded = new WreckProgress(layout);
  crowded.frame(standing(0), 0.016);
  crowded.frame(standing(1, { alive: [ALIVE_MOST] }), 0.016);
  assert.deepEqual(crowded.frame(standing(1, { alive: [ALIVE_MOST] }), 0.016).open, [], 'its foes still wait');
});

test("a player anywhere on the arena's side of its heap, on its deck or up on its rails, is never brought back", () => {
  const progress = atTheBoss();
  const course = courseOf(layout);
  const [minX, minY, maxX, maxY] = layout.zones[layout.arena.zone]?.area ?? [0, 0, 0, 0];
  let rails = 0;
  for (let y = minY; y <= maxY + 1; y += 0.1)
    for (let x = minX - 0.6; x <= maxX + 0.6; x += 0.05) {
      const z = topAt(course, x, y);
      if (z < IN_THE_SEA_M) continue;
      if (z > topAt(course, 0, 34) + 0.5) rails += 1;
      assert.equal(progress.frame({ ...inArena(), x, y, z }, 0.016).bringBack, null, `at ${x.toFixed(2)}, ${y}`);
    }
  assert.ok(rails > 100, `its rails are sampled: ${rails}`);
});

test("once the boss fight begins, a player back over the arena's heap is brought back in; over its rail is the sea", () => {
  const course = courseOf(layout);
  const zone = layout.zones[layout.arena.zone];
  assert.ok(zone);
  // Where the path stands before it comes into the arena, over its heap.
  const [x, y] = layout.path[layout.path.findIndex((point) => inArea(zone.area, ...point)) - 1] ?? [0, 0];
  const over = { ...inArena(), x, y, z: topAt(course, x, y) };
  assert.deepEqual(atTheBoss().frame(over, 0.016).bringBack, zone.checkpoint, 'over the heap');
  for (const x of [-5.6, 5.6]) assert.equal(topAt(course, x, 34), 0, `outboard of its rail at ${x}, the sea`);
});

test('while held, a zone reached keeps its wave waiting and its way on shut; let go, the wave stands', () => {
  const progress = new WreckProgress(layout);
  progress.held = true;
  progress.frame(standing(0), 0.016);
  const alive = layout.zones.map(() => 0);
  for (let frame = 0; frame < 30; frame++) {
    const asks = progress.frame(standing(1, { alive }), 0.1);
    assert.deepEqual([asks.stand, asks.open], [[], []], 'nothing stands, nothing opens');
  }
  assert.equal(progress.zone, 1, 'the zone is reached all the same');
  progress.held = false;
  const wave = (layout.zones[1]?.wave ?? []).map((foe) => ({ ...foe, zone: 1 }));
  assert.deepEqual(progress.frame(standing(1, { alive }), 0.016).stand, wave);
});

test("the arena is reached only once the player stands clear of its heap's place, room for the camera behind them", () => {
  const progress = new WreckProgress(layout);
  for (let zone = 0; zone < layout.arena.zone; zone++) {
    const alive = layout.zones.map(() => 0);
    progress.frame(standing(zone, { alive }), 0.016);
    progress.frame(standing(zone, { alive }), 0.016);
  }
  const { gate, thule } = layout.arena;
  const apart = ([x, y]: readonly [number, number]) =>
    Math.hypot(Math.max(gate.minX - x, 0, x - gate.maxX), Math.max(gate.minY - y, 0, y - gate.maxY));
  // The first point along the path, past the heap's place, that stands `clear` of it.
  const past = (clear: number) => {
    let crossed = false;
    for (let metres = 0; metres < 500; metres += 0.01) {
      const point = pointAlong(layout.path, metres);
      if (apart(point) === 0) crossed = true;
      else if (crossed && apart(point) >= clear) return point;
    }
    throw new Error(`the path never stands ${clear} m past the arena's heap`);
  };
  const stepIn = ([x, y]: readonly [number, number]) => progress.frame({ ...standing(layout.arena.zone), x, y }, 0.016);
  stepIn(past(0.5));
  assert.equal(progress.arena, false, 'just over the heap, not yet');
  assert.equal(stepIn(past(ARENA_CLEAR_M - 0.05)).bringBack, null, 'nor brought back while stepping in');
  const clear = past(ARENA_CLEAR_M + 0.05);
  stepIn(clear);
  assert.equal(progress.arena, true);
  assert.ok(Math.hypot(thule[0] - clear[0], thule[1] - clear[1]) > 1.5, 'and Thule still stands well before them');
});
