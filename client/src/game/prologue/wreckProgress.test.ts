import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readWreck } from './wreckLayout.ts';
import { ALIVE_MOST, BOSS_SECONDS, BROUGHT_BACK_S, type Seen, WreckProgress } from './wreckProgress.ts';

const layout = readWreck();
const middle = (zone: number) => {
  const [minX, minY, maxX, maxY] = layout.zones[zone]?.area ?? [0, 0, 0, 0];
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: 3 };
};
const standing = (zone: number, more: Partial<Seen> = {}): Seen => ({
  ...middle(zone),
  dead: false,
  alive: 0,
  thule: null,
  ...more,
});

test('waking on the quarterdeck reaches the first zone, keeps its checkpoint and stands its wave and the next', () => {
  const progress = new WreckProgress(layout);
  assert.equal(progress.zone, -1);
  const asks = progress.frame(standing(0), 0.016);
  assert.equal(progress.zone, 0);
  assert.deepEqual(asks.checkpoint, layout.zones[0]?.checkpoint);
  const both = [...(layout.zones[0]?.wave ?? []), ...(layout.zones[1]?.wave ?? [])];
  assert.deepEqual(asks.stand, both.slice(0, ALIVE_MOST));
  assert.equal(progress.reached(0), true);
  assert.equal(progress.reached(1), false);
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
  progress.frame(standing(0, { alive: ALIVE_MOST }), 0.016);
  assert.deepEqual(progress.frame(standing(1, { alive: ALIVE_MOST }), 0.016).stand, [], 'six alive: nobody more');
  for (const alive of [5, 3, 4]) {
    const stood = progress.frame(standing(1, { alive }), 0.016).stand.length;
    assert.equal(stood, ALIVE_MOST - alive, `${alive} alive`);
  }
});

test('a body in the sea reaches no zone, and the sea brings no one back who lies dead', () => {
  const progress = new WreckProgress(layout);
  progress.frame(standing(0), 0.016);
  assert.equal(progress.frame({ ...standing(1), z: 0 }, 0.016).checkpoint, null);
  assert.equal(progress.zone, 0);
  for (let frame = 0; frame < 30; frame++)
    assert.equal(progress.frame({ ...standing(0), z: 0, dead: true }, 0.1).bringBack, null);
});

test('once the boss fight begins, no wave still waiting comes', () => {
  const progress = new WreckProgress(layout);
  progress.frame(standing(0, { alive: ALIVE_MOST }), 0.016);
  progress.beginBoss();
  assert.deepEqual(progress.frame(standing(0, { alive: 0 }), 0.016).stand, []);
});

test('a fall into the sea is brought back to the last checkpoint after a moment, never a death', () => {
  const progress = new WreckProgress(layout);
  progress.frame(standing(0), 0.016);
  progress.frame(standing(1), 0.016);
  const sea = { ...standing(1), z: 0 };
  let back = null;
  let waited = 0;
  while (!back && waited < 5) {
    back = progress.frame(sea, 0.1).bringBack;
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
