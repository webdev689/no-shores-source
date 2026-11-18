import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { BOOM, blockReach, boomEased, boomReach, groundReach } from './boom.ts';
import { boomFollowed, cameraOrbit, type ViewMode } from './playerCamera.ts';

const near = (actual: number, expected: number, what: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual}, not ${expected}`);

const head = [0, 0, 1.7] as const;
/** Looking north, level: the boom runs 2 m south and 0.5 m up. */
const behind = [0, 2, 2.2] as const;
const third: ViewMode = { firstPerson: false, distance: 2, shown: 2 };
const eyeOf = (orbit: ReturnType<typeof cameraOrbit>) => [orbit.targetX, orbit.targetY + 1, orbit.targetZ] as const;

/** A wall across the boom, 1 m behind the head, from the ground to 5 m. */
const wall = { minX: -5, maxX: 5, minY: 1, maxY: 1.5, top: 5, bottom: 0 };

test('a block across the boom stops it short of the block by the clearance', () => {
  const length = Math.hypot(2, 0.5);
  near(blockReach(head, behind, [wall], 0), length / 2, 'at the wall');
  near(blockReach(head, behind, [wall], 0.25), (length * 0.75) / 2, 'a quarter metre short, along y');
  near(blockReach(head, behind, [], 0.25), length, 'nothing in the way');
  const aside = { ...wall, minX: 3, maxX: 4 };
  near(blockReach(head, behind, [aside], 0.25), length, 'a block beside the boom');
});

test('a block the head stands in, or by, does not hold the boom at the head', () => {
  const around = { minX: -1, maxX: 1, minY: -1, maxY: 1, top: 3, bottom: 0 };
  near(blockReach(head, behind, [around], 0.25), Math.hypot(2, 0.5), 'a room volume round the head is passed');
  // A wall the head leans on (0.1 m east of it) holds only where the boom itself would meet it.
  const leaned = { minX: 0.1, maxX: 0.4, minY: -5, maxY: 5, top: 3, bottom: 0 };
  near(blockReach(head, behind, [leaned], 0.25), Math.hypot(2, 0.5), 'the boom runs beside it');
});

test('a ceiling over the boom pulls it in, as indoors', () => {
  // A room 2.4 m high: the boom rises to 2.2 m, a quarter metre under the ceiling is 2.15 m.
  const ceiling = { minX: -5, maxX: 5, minY: -5, maxY: 5, top: 2.6, bottom: 2.4 };
  const reach = blockReach(head, behind, [ceiling], 0.25);
  near(reach, Math.hypot(2, 0.5) * (0.45 / 0.5), 'stopped where it rises to 2.15 m');
});

test('rising ground behind pulls the boom in short of it', () => {
  // A cliff 1.5 m behind the head, 3 m high.
  const cliff = (_east: number, south: number) => (south > 1.5 ? 3 : 0);
  const reach = groundReach(head, behind, cliff, 0.25);
  const length = Math.hypot(2, 0.5);
  assert.ok(reach < length * 0.75 && reach >= length * 0.75 - BOOM.groundStep - 1e-9, `${reach}`);
  near(
    groundReach(head, behind, () => 0, 0.25),
    length,
    'flat ground',
  );
  near(
    groundReach(head, behind, () => null, 0.25),
    length,
    'no ground known',
  );
  near(boomReach(head, behind, [wall], cliff, 0.25), blockReach(head, behind, [wall], 0.25), 'the nearer of the two');
});

test('the boom eases in fast and out slowly, and never snaps', () => {
  const length = 2;
  let shown = Number.POSITIVE_INFINITY;
  const steps: number[] = [];
  for (let frame = 0; frame < 30; frame++) {
    shown = boomEased(shown, 0.5, length, 1 / 60);
    steps.push(shown);
  }
  assert.ok(steps[0]! < length && steps[0]! > 0.5, `the first frame comes partway in: ${steps[0]}`);
  assert.ok(steps.at(-1)! - 0.5 < 1e-3, 'in within half a second');
  for (let frame = 1; frame < steps.length; frame++) assert.ok(steps[frame]! <= steps[frame - 1]!, 'only ever in');
  const out: number[] = [];
  for (let frame = 0; frame < 240; frame++) {
    shown = boomEased(shown, length, length, 1 / 60);
    out.push(shown);
  }
  assert.ok(out[0]! < 0.6, `the first frame out moves a little: ${out[0]}`);
  for (let frame = 1; frame < out.length; frame++) {
    const step = Math.min(out[frame]!, length) - Math.min(out[frame - 1]!, length);
    assert.ok(step >= 0 && step < 0.1, `frame ${frame} lets out ${step} m`);
  }
  assert.equal(out.at(-1), Number.POSITIVE_INFINITY, 'all the way out, it stands as long as it is meant to');
});

test('the camera follows its eased boom, but never nearer a sudden wall than the closest it may stand', () => {
  // Out in the open the boom stands whole.
  const open = boomFollowed(head, 0, 0, third, [], 0, null, 1 / 60);
  assert.equal(open.boom, Number.POSITIVE_INFINITY);
  near(eyeOf(cameraOrbit(head, 0, 0, open, []))[1], 2, 'two metres behind');
  // A wall appears: one frame later the eased boom is partway in, yet the eye stands short of the wall.
  const followed = boomFollowed(head, 0, 0, open, [wall], 0, null, 1 / 60);
  assert.ok(followed.boom! > 1 && followed.boom! < Math.hypot(2, 0.5), `${followed.boom}`);
  const eye = eyeOf(cameraOrbit(head, 0, 0, followed, [wall]));
  assert.ok(eye[1] <= 1 - BOOM.closest + 1e-9, `the eye at y ${eye[1]} is short of the wall`);
  // A view never followed stands clear at once, as before.
  assert.ok(eyeOf(cameraOrbit(head, 0, 0, third, [wall]))[1] <= 1 - BOOM.clearance + 1e-9);
  // First person keeps no boom.
  assert.equal(
    boomFollowed(head, 0, 0, { ...third, firstPerson: true, shown: 0 }, [wall], 0, null, 1 / 60).boom,
    undefined,
  );
});
