import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { HeightAt, Point2, Vec3 } from './ground.ts';
import { eyeFor, poseOf, projectPoint, TILT, type Rig } from './overworldCamera.ts';
import {
  coastDistance,
  flyRig,
  frameSide,
  gridCentre,
  nearestIsland,
  ringCentre,
  SIDE,
  sideNodes,
} from './islandView.ts';

function close(actual: number, expected: number, tolerance: number, what: string) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: ${actual} is not within ${tolerance} of ${expected}`);
}
/** An island 400 km square, its middle at (2,000 km, 1,500 km). */
const island: Point2[] = [
  [1_800_000, 1_300_000],
  [2_200_000, 1_300_000],
  [2_200_000, 1_700_000],
  [1_800_000, 1_700_000],
];
const centre: Point2 = [2_000_000, 1_500_000];
/** A ship 20 km off its west coast. */
const ship: Point2 = [1_780_000, 1_500_000];
const node = (id: string, x: number, y: number, z = 40) => ({ id, at: [x, y, z] as Vec3 });

test('an outline knows its middle and how far a point is from its coast', () => {
  assert.deepEqual(ringCentre(island), centre);
  assert.deepEqual(ringCentre([...island].reverse()), centre, 'either way round');
  assert.equal(coastDistance(ship, island), 20_000);
  assert.equal(coastDistance([1_700_000, 1_200_000], island), Math.hypot(100_000, 100_000), 'off a corner');
  assert.equal(coastDistance(centre, island), 200_000, 'from inside, to the nearest coast');
});

test('a grid knows the middle of its land', () => {
  const grid = { width: 4, height: 2, leftM: 10_000, topM: 0, cellM: 1_000, heights: [-5, 10, 10, -5, -5, -5, -5, -5] };
  assert.deepEqual(gridCentre(grid), [12_000, 500]);
  assert.equal(gridCentre({ ...grid, heights: grid.heights.map(() => -5) }), null);
});

test('the island nearest the ship is found within the view reach of its coast', () => {
  const far: Point2[] = island.map(([x, y]) => [x + 1_000_000, y]);
  assert.deepEqual(nearestIsland(ship, [far, island]), { index: 1, distanceM: 20_000 });
  assert.equal(nearestIsland([1_000_000, 1_500_000], [far, island]), null, 'out at sea, none');
  assert.equal(SIDE.coastReachM, 30_000);
});

test('the side nodes are those near the ship on its half of the island, nearest first', () => {
  const nodes = [
    node('inland', 1_880_000, 1_520_000),
    node('coast', 1_810_000, 1_480_000),
    node('far side', 2_150_000, 1_500_000),
    node('beyond reach', 1_850_000, 1_650_000),
    node('across the middle', 2_010_000, 1_500_000),
  ];
  assert.deepEqual(
    sideNodes(ship, centre, nodes).map((each) => each.id),
    ['coast', 'inland'],
  );
  assert.deepEqual(
    sideNodes(ship, centre, [nodes[2], nodes[4]]).map((each) => each.id),
    ['across the middle', 'far side'],
    'none on this side: the few nearest anywhere',
  );
  assert.deepEqual(sideNodes(ship, centre, []), []);
});

test('the side is framed from the lowest height that holds every node in the picture fill, looking inland', () => {
  const nodes = [node('a', 1_810_000, 1_440_000), node('b', 1_880_000, 1_560_000), node('c', 1_840_000, 1_500_000)];
  const aspect = 16 / 9;
  const rig = frameSide(ship, nodes, aspect);
  close(rig.yaw, Math.atan2(1_845_000 - ship[0], -(1_500_000 - ship[1])), 1e-12, 'looking from the ship to the side');
  close(rig.tilt, TILT.initial, 1e-12, 'the sea camera tilt');
  assert.deepEqual(rig.focus, [1_845_000, 1_500_000, 40]);
  const viewport = { width: 1000 * aspect, height: 1000 };
  const inside = (height: number) =>
    nodes.every((each) => {
      const shown = projectPoint(poseOf(eyeFor(rig.focus, rig.yaw, rig.tilt, height)), viewport, each.at);
      return (
        shown.front &&
        Math.abs(shown.x - viewport.width / 2) <= (SIDE.fill * viewport.width) / 2 + 1e-6 &&
        Math.abs(shown.y - viewport.height / 2) <= (SIDE.fill * viewport.height) / 2 + 1e-6
      );
    });
  assert.ok(inside(rig.height), 'every node inside the fill');
  assert.ok(!inside(rig.height - 5), 'and no lower would do');
  assert.ok(rig.height > 50_000 && rig.height < 300_000, `a bird-eye height: ${rig.height}`);
});

test('a small side is framed no lower than the floor, and mountains under it lift or steepen the view', () => {
  const nodes = [node('a', 1_801_000, 1_500_000), node('b', 1_801_200, 1_500_100)];
  const rig = frameSide(ship, nodes, 1.5);
  assert.equal(rig.height, SIDE.lowestM);
  const peaks: HeightAt = () => 4_000;
  const cleared = frameSide(ship, nodes, 1.5, peaks);
  const { eye } = eyeFor(cleared.focus, cleared.yaw, cleared.tilt, cleared.height);
  assert.ok(eye[2] >= 4_025 - 1e-6, 'the eye clears the peaks');
  assert.deepEqual(frameSide(ship, [], 1.5).focus, [ship[0], ship[1], 0], 'no nodes: over the ship');
});

test('the fly-in turns the short way, changes height by even ratios, and lands on the side view', () => {
  const sea: Rig = { focus: [ship[0], ship[1], 0], yaw: 3, tilt: TILT.lowest, height: 300 };
  const side: Rig = { focus: [1_845_000, 1_500_000, 40], yaw: -3, tilt: TILT.initial, height: 30_000 };
  assert.deepEqual(flyRig(sea, side, 0), sea);
  const end = flyRig(sea, side, 1);
  close(end.height, 30_000, 1e-6, 'height');
  close(end.focus[0], 1_845_000, 1e-6, 'focus');
  close(end.yaw, 2 * Math.PI - 3, 1e-12, 'the same bearing as -3, reached the short way');
  close(flyRig(sea, side, 0.5).height, 3_000, 1e-6, 'halfway is the middle ratio, not the middle metre');
  let previous = sea.yaw;
  for (let i = 1; i <= 50; i++) {
    const yaw = flyRig(sea, side, i / 50).yaw;
    assert.ok(yaw >= previous && yaw - previous < 0.03, 'a steady turn through the seam');
    previous = yaw;
  }
  assert.equal(SIDE.flySeconds, 2.5);
});

test('a side framed over a slope that steepens the view still holds every node in the picture', () => {
  const nodes = [node('a', 1_830_000, 1_470_000), node('b', 1_860_000, 1_530_000)];
  // Ground climbing toward the ship at 60 degrees, steeper than the side's tilt: lifting alone never clears it.
  const slope: HeightAt = (x) => Math.max(0, (1_845_000 - x) * Math.tan((60 * Math.PI) / 180));
  const rig = frameSide(ship, nodes, 1.5, slope);
  assert.ok(rig.tilt > SIDE.tilt, 'it steepened');
  const { eye, forward } = eyeFor(rig.focus, rig.yaw, rig.tilt, rig.height);
  assert.ok(eye[2] >= slope(eye[0], eye[1]) + 25 - 1e-6, 'the eye clears the slope');
  const viewport = { width: 1500, height: 1000 };
  const pose = poseOf({ eye, forward });
  for (const each of nodes) {
    const shown = projectPoint(pose, viewport, each.at);
    assert.ok(shown.front, `${each.id} in front`);
    assert.ok(Math.abs(shown.x - 750) <= 600 + 1e-6 && Math.abs(shown.y - 500) <= 400 + 1e-6, `${each.id} framed`);
  }
});
