import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ASKS, type GearAsk, type GearState } from '../network/gearMessages.ts';
import type { SeenIsle } from '../network/seaHarbour.ts';
import type { Point2 } from '../overworld/ground.ts';
import {
  ANCHORED_M,
  type DungeonDoor,
  type IsleAt,
  KEEP_CLEAR_M,
  approach,
  detour,
  dungeonRoomName,
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

/** How far past an island's reach the room's land reaches (sea_islands.rs: its shallows, 14 m, and 20 m more). */
const LAND_PAST_REACH_M = 14 + 20;

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

test('a ship is offered the nearest built island whose coast it lies near', () => {
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
  for (const isle of isles)
    assert.ok(keepsOff(course, isle.seen.at, 80 + LAND_PAST_REACH_M), `clear of ${isle.seen.id}`);
  assert.deepEqual(course.at(-1), [0, 5000]);
  const clear: Point2[] = [
    [500, -3000],
    [500, 5000],
  ];
  assert.deepEqual(detour(clear, keptClear(isles)), clear);
});

test('the way in to an island is from its offing, out on its landing bearing past the ring a voyage keeps clear of', () => {
  const isle = built(1, [0, 0]);
  const way = approach(isle);
  assert.deepEqual(way?.anchorage, [0, -125]);
  const [offingX, offingY] = way?.offing ?? [0, 0];
  assert.ok(Math.abs(offingX) < 1e-9, 'on its landing bearing');
  assert.ok(offingY < -(80 + KEEP_CLEAR_M) && offingY < -125 - ANCHORED_M, 'out at sea, clear of it');
  assert.equal(approach({ ...isle, built: null }), null, 'none for an island not yet built');
});

test('a voyage for an anchorage from the far side comes in through its gate, not over the island', () => {
  const isle = built(1, [0, 0]);
  const course = detour(
    [
      [0, 3000],
      [0, -125],
    ],
    keptClear([isle]),
  );
  assert.deepEqual(course.at(-1), [0, -125]);
  assert.ok(keepsOff(course, [0, 0], 80 + LAND_PAST_REACH_M), 'over the island');
  const gate = course.at(-2) ?? [0, 0];
  assert.ok(Math.abs(gate[0]) < 1e-6 && gate[1] < -125, 'in on the line out through the anchorage');
  // Already on that line, a voyage in is left as it is.
  const straightIn: Point2[] = [
    [0, -3000],
    [0, -125],
  ];
  assert.deepEqual(detour(straightIn, keptClear([isle])), straightIn);
});

// crates/room/src/sea_islands_tests.rs folds the same two seeds to the same digits, as the sea names the room.
test("a door's dungeon room is named by its continent, style and the island's seed folded to 32 bits", () => {
  assert.equal(dungeonRoomName('255', 'crypt', 'continent-2'), 'sea-dungeon-continent-2-crypt-000000ff');
  const seed = BigInt('0x123456789abcdef0').toString();
  assert.equal(dungeonRoomName(seed, 'mines', 'continent-7', 'abyss'), 'sea-dungeon-continent-7-mines-88888888--abyss');
});

test("an island's room is named by its number and its seed in 16 hex digits, and it stands in world metres", () => {
  const island = seen(7, [5000, 6000], 'ruin');
  assert.equal(isleRoomName(island), 'isle-7-00000000000000ff');
  const plan = { ring: [[1, 2]], spawns: [[3, 4]], nodes: [[10, 20]], wrecks: [[30, 40, 0]] } as const;
  const node = isleNode(island, plan, { continent: 'continent-4', seas: 'normal' });
  assert.equal(isleRoomName(island, 'abyss'), 'isle-7-00000000000000ff--abyss');
  assert.deepEqual([node.ring, node.spawns, node.name], [[[5001, 6002]], [[5003, 6004]], 'A ruined isle']);
  assert.deepEqual(node.resources, [{ at: [5010, 6020], holds: 'sunstone' }], "its nodes give Sunspire's resource");
  assert.deepEqual([node.isle, node.wrecks], ['ruin', [[5030, 6040]]], 'its kind, and its wrecks where they lie');
});

test('E scavenges a wreck within reach until the room says it is spent, else opens the door, else nothing', () => {
  const held = {
    seen: seen(4, [1000, 2000]),
    plan: {
      wrecks: [
        [10, 0, 0],
        [40, 0, 0],
      ],
      door: { at: [0, 30], facing: 2.5, style: 'caverns' },
    },
  } as unknown as IsleHeld;
  const asked: GearAsk[] = [];
  const doors: DungeonDoor[] = [];
  const gear = { gear: { scavenged: [] as number[], answered: 5 } as unknown as GearState };
  const where = { continent: 'continent-4', seas: 'elite' } as const;
  const uses = isleUses(held, (door) => doors.push(door), gear, where);
  const ask = (each: GearAsk) => asked.push(each);
  const atWreck = uses(1011, 2000, ask);
  assert.equal(atWreck?.words, 'Scavenge the wreck');
  atWreck?.run();
  assert.deepEqual(asked, [{ kind: ASKS.scavenge, node: 0 }]);
  assert.equal(uses(1011, 2000, ask), null, 'asked: nothing more there until the room answers');
  gear.gear = { scavenged: [], answered: 6 } as unknown as GearState;
  assert.equal(uses(1011, 2000, ask)?.words, 'Scavenge the wreck', 'refused, it is offered again');
  gear.gear = { scavenged: [0], answered: 7 } as unknown as GearState;
  assert.equal(uses(1011, 2000, ask), null, 'spent for their account');
  assert.equal(isleUses(held, () => undefined, gear, where)(1011, 2000, ask), null, 'spent on a later visit too');
  assert.deepEqual([uses(1040, 2001, ask)?.words], ['Scavenge the wreck']);
  const atDoor = uses(1000, 2031, ask);
  assert.equal(atDoor?.words, 'Enter the caverns');
  atDoor?.run();
  assert.deepEqual(doors, [{ room: 'sea-dungeon-continent-4-caverns-000000ff--elite', at: [1000, 2030], facing: 2.5 }]);
  assert.equal(uses(1000, 2100, ask), null);
});

test('a voyage keeps clear of an island marked on the map that the room has not told of, as of one not built', () => {
  const told = built(1, [0, 0]);
  const marks = [
    { at: [0, 0] as Point2, kind: 'cove' as const },
    { at: [0, 2_000] as Point2, kind: 'ruin' as const },
    { at: [0, 4_000] as Point2, kind: 'hostile' as const },
  ];
  assert.deepEqual(
    keptClear([told], marks).map((circle) => circle.at),
    [
      [0, 0],
      [0, 2_000],
    ],
    'the told island once, the marked one besides, no hostile ship',
  );
  const course = detour(
    [
      [0, 1_000],
      [0, 3_000],
    ],
    keptClear([], marks),
  );
  assert.ok(keepsOff(course, [0, 2_000], 250), 'round the marked island');
});
