import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ASKS, type GearAsk } from '../network/gearMessages.ts';
import type { SeenIsle } from '../network/seaHarbour.ts';
import type { Point2 } from '../overworld/ground.ts';
import {
  ANCHORED_M,
  type DungeonDoor,
  type IsleAt,
  approach,
  detour,
  isleNode,
  isleOff,
  isleRoomName,
  isleUses,
  keptClear,
} from './isleLaw.ts';
import type { IsleHeld } from './isles.ts';

const seen = (id: number, middle: Point2, kind: SeenIsle['kind'] = 'cove'): SeenIsle => ({
  id,
  seed: '255',
  at: middle,
  kind,
  continent: 3,
  found: false,
});

/** An island of reach 80 m at `at`, landed on from the north, anchored 125 m north of its middle. */
const built = (id: number, middle: Point2): IsleAt => ({
  seen: seen(id, middle),
  built: { reach: 80, anchorage: [middle[0], middle[1] - 125], landing: 0 },
});

/** Whether each leg of a course keeps `clear` metres off a point. */
const keepsOff = (course: readonly Point2[], point: Point2, clear: number) =>
  course.slice(1).every((to, index) => {
    const from = course[index] ?? to;
    for (let step = 0; step <= 200; step++) {
      const share = step / 200;
      const passing: Point2 = [from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share];
      if (Math.hypot(passing[0] - point[0], passing[1] - point[1]) < clear) return false;
    }
    return true;
  });

test('a ship is offered the nearest built island whose coast she lies near', () => {
  const near = built(1, [1000, 1000]);
  const far = built(2, [1000, 5000]);
  assert.equal(isleOff([1000, 300], [far, near])?.seen.id, 1);
  assert.equal(isleOff([1000, -1000], [near, far]), null, 'too far off');
  assert.equal(isleOff([1000, 900], [{ seen: seen(3, [1000, 1000]), built: null }]), null, 'not yet built');
});

test('a voyage is bent round every island its legs pass through, and left alone where none is', () => {
  const isles = [built(1, [0, 0]), built(2, [0, 2000])];
  const course = detour(
    [
      [0, -3000],
      [0, 5000],
    ],
    keptClear(isles),
  );
  for (const isle of isles) assert.ok(keepsOff(course, isle.seen.at, 80 + 30), `clear of ${isle.seen.id}`);
  assert.deepEqual(course.at(-1), [0, 5000]);
  const clear: Point2[] = [
    [500, -3000],
    [500, 5000],
  ];
  assert.deepEqual(detour(clear, keptClear(isles)), clear);
});

test('the way to an island goes round it to its offing and in to its anchorage', () => {
  const isle = built(1, [0, 0]);
  const course = approach([0, 3000], isle);
  assert.deepEqual(course.at(-1), [0, -125]);
  assert.ok(keepsOff(course.slice(0, -1), [0, 0], 80 + 30), 'round the island, not over it');
  const last = course.at(-2) ?? [0, 0];
  assert.ok(last[1] < -125 - ANCHORED_M, 'in from the open sea on its landing bearing');
});

test("an island's room is named by its number and its seed in 16 hex digits, and it stands in world metres", () => {
  const island = seen(7, [5000, 6000], 'ruin');
  assert.equal(isleRoomName(island), 'isle-7-00000000000000ff');
  const node = isleNode(island, [[1, 2]], [[3, 4]], { continent: 'continent-4', seas: 'normal' });
  assert.equal(isleRoomName(island, 'abyss'), 'isle-7-00000000000000ff--abyss');
  assert.deepEqual([node.ring, node.spawns, node.name], [[[5001, 6002]], [[5003, 6004]], 'A ruined isle']);
});

test('E scavenges a wreck within reach once a visit, else opens the door, else does nothing', () => {
  const held = {
    seen: seen(4, [1000, 2000]),
    plan: {
      wrecks: [
        [10, 0, 0],
        [40, 0, 0],
      ],
      door: { at: [0, 30], facing: 0, style: 'caverns' },
    },
  } as unknown as IsleHeld;
  const asked: GearAsk[] = [];
  const doors: DungeonDoor[] = [];
  const uses = isleUses(held, (door) => doors.push(door));
  const ask = (each: GearAsk) => asked.push(each);
  const atWreck = uses(1011, 2000, ask);
  assert.equal(atWreck?.words, 'Scavenge the wreck');
  atWreck?.run();
  assert.deepEqual(asked, [{ kind: ASKS.scavenge, node: 0 }]);
  assert.equal(uses(1011, 2000, ask), null, 'scavenged: nothing more there');
  assert.deepEqual([uses(1040, 2001, ask)?.words], ['Scavenge the wreck']);
  const atDoor = uses(1000, 2031, ask);
  assert.equal(atDoor?.words, 'Enter the caverns');
  atDoor?.run();
  assert.deepEqual(doors, [{ style: 'caverns', seed: '255', isle: 4 }]);
  assert.equal(uses(1000, 2100, ask), null);
});
