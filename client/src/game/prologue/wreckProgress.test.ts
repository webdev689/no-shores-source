import assert from 'node:assert/strict';
import { test } from 'node:test';
import { courseOf, readWreck, topAt } from './wreckLayout.ts';
import { ALIVE_MOST, BOSS_SECONDS, BROUGHT_BACK_S, type Seen, WreckProgress } from './wreckProgress.ts';

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

test('waking on the quarterdeck reaches the first zone, keeps its checkpoint and stands its wave and the next', () => {
  const progress = new WreckProgress(layout);
  assert.equal(progress.zone, -1);
  const asks = progress.frame(standing(0), 0.016);
  assert.equal(progress.zone, 0);
  assert.deepEqual(asks.checkpoint, layout.zones[0]?.checkpoint);
  const both = [0, 1].flatMap((zone) => (layout.zones[zone]?.wave ?? []).map((foe) => ({ ...foe, zone })));
  assert.deepEqual(asks.stand, both.slice(0, ALIVE_MOST));
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
  progress.frame(standing(0, { alive: [ALIVE_MOST] }), 0.016);
  assert.deepEqual(progress.frame(standing(0, { alive: [2, 4] }), 0.016).stand, [], 'six alive: nobody more');
  for (const alive of [5, 4]) {
    const stood = progress.frame(standing(0, { alive: [1, alive - 1] }), 0.016).stand.length;
    assert.equal(stood, ALIVE_MOST - alive, `${alive} alive`);
  }
  const waves = (layout.zones[0]?.wave.length ?? 0) + (layout.zones[1]?.wave.length ?? 0);
  assert.equal(progress.frame(standing(0, { alive: [1] }), 0.016).stand.length, waves - 3, 'the rest');
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
  progress.frame(standing(0, { alive: [ALIVE_MOST] }), 0.016);
  progress.beginBoss();
  assert.deepEqual(progress.frame(standing(0, { alive: [] }), 0.016).stand, []);
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

test('the way on from a zone stays closed until its wave has fallen: climbed over, it brings the player back', () => {
  const progress = new WreckProgress(layout);
  progress.frame(standing(0), 0.016);
  const fighting = progress.frame(standing(1, { alive: [2, 3] }), 0.016);
  assert.deepEqual(fighting.open, [], 'the first wave stands');
  assert.deepEqual(fighting.bringBack, layout.zones[0]?.checkpoint, 'over the heap and back');
  assert.equal(progress.zone, 0, 'beyond a closed way no zone is reached');
  assert.deepEqual(progress.frame(standing(0, { alive: [0, 3] }), 0.016).open, [0], 'the first wave has fallen');
  assert.deepEqual(progress.frame(standing(1, { alive: [0, 3] }), 0.016).checkpoint, layout.zones[1]?.checkpoint);
  assert.deepEqual(progress.frame(standing(2, { alive: [0, 3] }), 0.016).bringBack, layout.zones[1]?.checkpoint);
});

test('a wave stood this frame is not yet fallen, nor one with foes still waiting their turn', () => {
  const progress = new WreckProgress(layout);
  assert.deepEqual(progress.frame(standing(0), 0.016).open, [], 'stood, not yet seen');
  const crowded = new WreckProgress(layout);
  crowded.frame(standing(0, { alive: [0, ALIVE_MOST] }), 0.016);
  assert.deepEqual(crowded.frame(standing(0, { alive: [0, ALIVE_MOST] }), 0.016).open, [], 'its foes still wait');
});

test("a player backing along the arena's rails, anywhere on its deck, is never judged out of it", () => {
  const progress = atTheBoss();
  const course = courseOf(layout);
  const { gate } = layout.arena;
  const [minX, , maxX, maxY] = layout.zones[layout.arena.zone]?.area ?? [0, 0, 0, 0];
  for (let y = gate.maxY + 0.35; y <= maxY; y += 0.1)
    for (let x = minX; x <= maxX; x += 0.05) {
      const z = topAt(course, x, y);
      if (z < 2) continue;
      assert.equal(progress.frame({ ...inArena(), x, y, z }, 0.016).bringBack, null, `at ${x.toFixed(2)}, ${y}`);
    }
});

test('once the boss fight begins, a player over her rail on the channels outside it is brought back in', () => {
  const course = courseOf(layout);
  const checkpoint = layout.zones[layout.arena.zone]?.checkpoint;
  for (const x of [-5.1, 5.0]) {
    const z = topAt(course, x, 34);
    assert.ok(z > 4, `her channel stands at ${x}`);
    const progress = atTheBoss();
    assert.deepEqual(
      progress.frame({ ...inArena(), x, y: 34, z }, 0.016).bringBack,
      checkpoint,
      `over the rail at ${x}`,
    );
  }
});
