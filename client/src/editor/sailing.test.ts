import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Helm, ShipFloats } from '../rules/landRules.ts';
import type { Sailed } from '../terrain/landClient.ts';
import { Sailing, type SailSource } from './sailing.ts';

interface Asked {
  readonly ship: ShipFloats;
  readonly helm: Helm;
  readonly time: number;
  readonly ticks: number;
  readonly hull: number | undefined;
}

/** A door that answers at once, or holds every answer until let go, and keeps what it was asked. */
function fakeDoor(aground = false, holding = false) {
  const asked: Asked[] = [];
  const held: (() => void)[] = [];
  const source: SailSource = {
    sail: (_id, ship, helm, time, ticks, hull) => {
      asked.push({ ship, helm, time, ticks, hull });
      const sailed: Sailed = { ship, pose: { heave: 0.1, pitch: 0, roll: 0, aground } };
      return holding ? new Promise((resolve) => held.push(() => resolve(sailed))) : Promise.resolve(sailed);
    },
  };
  return { source, asked, letGo: () => held.splice(0).forEach((resolve) => resolve()) };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const ignore = () => undefined;

test('putting to sea where the door answers it aground is refused with a reason', async () => {
  const { source, asked } = fakeDoor(true);
  const answer = await Sailing.putToSea(source, 'square', 1000, 2000, 0.5, 10);
  assert.equal(typeof answer, 'string');
  assert.equal(asked[0]?.ticks, 0, 'the rules decide, stepping nothing');
  assert.deepEqual([...(asked[0]?.ship ?? [])], [1000, 2000, 0.5, 0, 0, 0, 0, 0]);
});

test('a ship of a hull is put to sea and stepped as that hull, the Sloop unless one is asked', async () => {
  const { source, asked } = fakeDoor();
  const brig = await Sailing.putToSea(source, 'square', 0, 0, 0, 0, 2);
  assert.ok(brig instanceof Sailing);
  brig.advance(0.1, new Set(), 1, ignore);
  await settle();
  const plain = await Sailing.putToSea(source, 'square', 0, 0, 0, 0);
  assert.ok(plain instanceof Sailing);
  assert.deepEqual([brig.hullKind, plain.hullKind, ...asked.map((each) => each.hull)], [2, 0, 2, 2, 0]);
});

test('a long wait is caught up a second at most, ending at the time asked', async () => {
  const { source, asked } = fakeDoor();
  const sailing = await Sailing.putToSea(source, 'square', 0, 0, 0, 0);
  assert.ok(sailing instanceof Sailing);
  sailing.advance(5, new Set(), 100, ignore);
  assert.equal(asked[1]?.ticks, 60);
  assert.ok(Math.abs((asked[1]?.time ?? 0) - (100 - 60 / 60)) < 1e-9);
});

test('time spent waiting on the rules is caught up, not lost', async () => {
  const { source, asked, letGo } = fakeDoor(false, true);
  const pending = Sailing.putToSea(source, 'square', 0, 0, 0, 0);
  letGo();
  const sailing = await pending;
  assert.ok(sailing instanceof Sailing);
  sailing.advance(0.05, new Set(), 1, ignore);
  for (let frame = 0; frame < 6; frame++) sailing.advance(0.1, new Set(), 1 + 0.1 * (frame + 1), ignore);
  letGo();
  await settle();
  sailing.advance(0.05, new Set(), 1.65, ignore);
  assert.deepEqual(
    asked.slice(1).map((ask) => ask.ticks),
    [3, 39],
    'the 0.6 s the first step waited, and this frame',
  );
});

test('a frame shorter than a tick waits, and its time is kept for the next', async () => {
  const { source, asked } = fakeDoor();
  const sailing = await Sailing.putToSea(source, 'square', 0, 0, 0, 0);
  assert.ok(sailing instanceof Sailing);
  sailing.advance(0.01, new Set(), 1, ignore);
  assert.equal(asked.length, 1);
  sailing.advance(0.01, new Set(), 1.01, ignore);
  assert.equal(asked[1]?.ticks, 1);
});

test('while one step is with the door, no other is asked, and a press waits for a tick', async () => {
  const { source, asked, letGo } = fakeDoor(false, true);
  const pending = Sailing.putToSea(source, 'square', 0, 0, 0, 0);
  letGo();
  const sailing = await pending;
  assert.ok(sailing instanceof Sailing);
  sailing.press('w');
  sailing.advance(0.05, new Set(), 1, ignore);
  sailing.advance(0.05, new Set(), 1.05, ignore);
  assert.equal(asked.length, 2, 'one step in flight');
  assert.equal(asked[1]?.helm.climb, 1);
  letGo();
  await settle();
  sailing.advance(0.05, new Set(), 1.1, ignore);
  assert.equal(asked.length, 3);
  assert.equal(asked[2]?.helm.climb, 0, 'the press went with the first step');
});

test('under way it stirs the water at its bow and quarters once it has run half a metre, and none at rest', async () => {
  const moving: SailSource = {
    sail: async (_id, ship, _helm, _time, ticks) => {
      const next = new Float64Array(ship);
      next[1] = (ship[1] ?? 0) - 0.4 * ticks;
      next[3] = 2;
      return { ship: next, pose: { heave: 0, pitch: 0, roll: 0, aground: false } };
    },
  };
  const sailing = await Sailing.putToSea(moving, 'square', 100, 100, 0, 0);
  assert.ok(sailing instanceof Sailing);
  const view = { leftM: 0, topM: 0 } as Parameters<Sailing['wake']>[0];
  const waterline = { lengthM: 6, beamM: 2, draughtM: 0.5 };
  assert.equal(sailing.wake(view, waterline).length, 0, 'at rest');
  sailing.advance(3 / 60, new Set(), 1, ignore);
  await settle();
  const stirs = sailing.wake(view, waterline);
  assert.equal(stirs.length, 3, 'it ran 1.2 m: its bow and quarters stir once a frame at most');
  const [bow] = stirs;
  assert.ok(
    bow && Math.abs(bow.x - 100) < 1e-9 && bow.y < 100 - 1.2 - 2,
    `its bow is ahead, north: ${JSON.stringify(bow)}`,
  );
  assert.equal(sailing.wake(view, waterline).length, 0, 'taken once');
  const mask = sailing.hull(view, waterline);
  assert.deepEqual([mask.halfLength, mask.halfBeam, mask.way], [3, 1, 2]);
});

test('it is put to sea heading where the camera looks, as a heading within a turn', async () => {
  const { source, asked } = fakeDoor();
  await Sailing.putToSea(source, 'square', 0, 0, -0.5, 0);
  assert.ok(Math.abs((asked[0]?.ship[2] ?? 0) - (2 * Math.PI - 0.5)) < 1e-12);
});

test("its faces seen from outside reach the screen wound as its pipeline's front faces", async () => {
  const { FRONT_FACE, shipTurn } = await import('../ships/shipView.ts');
  const { viewProjection } = await import('./orbit.ts');
  // A face on its starboard side as the export writes it: the model's corners in their own order, its y mirrored
  // from port to starboard, so in its frame (b-a)x(c-a) points in while the face looks out to starboard.
  const corners = [
    [0, 1, 0],
    [1, 1, 0],
    [0, 1, 1],
  ] as const;
  for (const heading of [0, 0.7, 2.5, 4.4]) {
    const turn = shipTurn(heading, 0.05, -0.03);
    // The camera stands off its starboard side and looks at it.
    const orbit = { targetX: 0, targetY: 0, targetZ: 0, yaw: heading - Math.PI / 2, pitch: 0.3, distance: 20 };
    const matrix = viewProjection(orbit, 1.6);
    const screen = corners.map((corner) => {
      const world = [0, 1, 2].map((row) =>
        [0, 1, 2].reduce((sum, column) => sum + (turn[column * 4 + row] ?? 0) * corner[column], 0),
      );
      const clip = [0, 1, 3].map(
        (row) =>
          [0, 1, 2].reduce((sum, column) => sum + (matrix[column * 4 + row] ?? 0) * (world[column] ?? 0), 0) +
          (matrix[12 + row] ?? 0),
      );
      return [(clip[0] ?? 0) / (clip[2] ?? 1), (clip[1] ?? 0) / (clip[2] ?? 1)] as const;
    });
    const [first, second, third] = screen;
    const area =
      first && second && third
        ? (second[0] - first[0]) * (third[1] - first[1]) - (second[1] - first[1]) * (third[0] - first[0])
        : 0;
    // WebGPU's 'ccw' fronts run counter-clockwise on screen (positive area, y up); 'cw' fronts the other way.
    assert.equal(area > 0 ? 'ccw' : 'cw', FRONT_FACE, `heading ${heading}: area ${area}`);
  }
});

test('its helm is still once the step with the door has answered, and at once when none is', async () => {
  const { source, letGo } = fakeDoor(false, true);
  const pending = Sailing.putToSea(source, 'square', 0, 0, 0, 0);
  letGo();
  const sailing = await pending;
  assert.ok(sailing instanceof Sailing);
  let still = false;
  await sailing.whenStill();
  sailing.advance(0.05, new Set(), 1, ignore);
  void sailing.whenStill().then(() => {
    still = true;
  });
  await settle();
  assert.equal(still, false, 'a step is with the door');
  letGo();
  await settle();
  await settle();
  assert.equal(still, true);
});
