import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { HeightAt, Vec3 } from './ground.ts';
import { eyeFor, poseOf, projectPoint, TILT } from './overworldCamera.ts';
import { placeMarks, type Mark } from './overworldMarks.ts';
import { classifyPick, pickAt, surfaceHit } from './overworldPick.ts';

const unit = (vector: Vec3): Vec3 => {
  const length = Math.hypot(...vector);
  return [vector[0] / length, vector[1] / length, vector[2] / length];
};
function close(actual: number, expected: number, tolerance: number, what: string) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: ${actual} is not within ${tolerance} of ${expected}`);
}
const flatLand: HeightAt = () => 20;
const seabed: HeightAt = () => -80;
const eye: Vec3 = [3_000_000, 1_500_000, 300];

test('a ray 45 degrees down meets flat land where the geometry says, to well under a centimetre', () => {
  const hit = surfaceHit(eye, unit([0, -1, -1]), flatLand);
  assert.ok(hit);
  close(hit.point[1], eye[1] - 280, 0.01, 'north of the eye by its height over the land');
  close(hit.point[0], eye[0], 1e-6, 'east');
  assert.equal(hit.point[2], 20, 'on the land');
  assert.equal(hit.water, false);
  close(hit.distance, 280 * Math.SQRT2, 0.01, 'distance');
});

test('over the sea a ray meets the surface at 0, over the seabed and where no land is known', () => {
  for (const ground of [seabed, (() => Number.NaN) as HeightAt]) {
    const hit = surfaceHit(eye, unit([1, 0, -1]), ground);
    assert.ok(hit);
    assert.equal(hit.water, true);
    assert.equal(hit.point[2], 0);
    close(hit.point[0], eye[0] + 300, 0.01, 'east of the eye by its height');
  }
});

test('the sky meets nothing; a reach shorter than the way to the surface meets nothing', () => {
  assert.equal(surfaceHit(eye, unit([0, 1, 0.2]), flatLand), null);
  assert.equal(surfaceHit(eye, unit([0, -1, -1]), flatLand, 100), null);
  assert.ok(surfaceHit(eye, unit([0, -1, -1]), flatLand, 1_000));
});

test('a ridge in front takes the ray first, and the march does not step over a thin one', () => {
  const ray = unit([0, -2, -1]);
  const ridge =
    (height: number): HeightAt =>
    (_east, y) =>
      y <= eye[1] - 400 && y >= eye[1] - 406 ? height : -10;
  const under = surfaceHit(eye, ray, ridge(50));
  assert.ok(under?.water, 'under the ray: the sea beyond');
  close(under.point[1], eye[1] - 600, 0.01, 'the sea 600 m out');
  const stopped = surfaceHit(eye, ray, ridge(120));
  assert.ok(stopped && !stopped.water);
  assert.ok(stopped.point[1] <= eye[1] - 400 && stopped.point[1] >= eye[1] - 406, 'on the 6 m ridge');
  assert.equal(stopped.point[2], 120);
});

test('a ray from the bird-eye view 100 km up meets the land and the sea below it', () => {
  const high: Vec3 = [2_000_000, 1_000_000, 100_000];
  const coast: HeightAt = (x) => (x > 2_050_000 ? 300 : -50);
  const landHit = surfaceHit(high, unit([1, 0, -1]), coast);
  assert.ok(landHit && !landHit.water);
  close(landHit.point[0], 2_099_700, 1, 'the land 300 m up, 99.7 km east');
  const seaHit = surfaceHit(high, unit([0.3, 0, -1]), coast);
  assert.ok(seaHit?.water);
  close(seaHit.point[0], 2_030_000, 0.05, 'the sea short of the coast');
});

test('what a click chose: a mark first, then the land or the sea, else nothing', () => {
  const point: Vec3 = [1, 2, 3];
  assert.deepEqual(classifyPick({ point, distance: 5, water: false }, 'port:saltmere'), {
    kind: 'mark',
    id: 'port:saltmere',
  });
  assert.deepEqual(classifyPick({ point, distance: 5, water: false }, null), { kind: 'land', point });
  assert.deepEqual(classifyPick({ point, distance: 5, water: true }, null), { kind: 'sea', point });
  assert.deepEqual(classifyPick(null, null), { kind: 'none' });
});

test('a click on the picture: the mark drawn under it, else the sea where it shows, else the sky', () => {
  const viewport = { width: 1280, height: 720 };
  const ship: Vec3 = [4_000_000, 2_000_000, 0];
  const pose = poseOf(eyeFor(ship, 0, TILT.initial, 260));
  const mark: Mark = { id: 'boss:wyrm', kind: 'boss', name: 'The Wyrm', at: [ship[0] + 40, ship[1] - 60, 0] };
  const placed = placeMarks([mark], pose, viewport);
  const onMark = projectPoint(pose, viewport, mark.at);
  assert.deepEqual(pickAt(pose, viewport, onMark.x, onMark.y, seabed, placed), { kind: 'mark', id: 'boss:wyrm' });
  const target: Vec3 = [ship[0] - 120, ship[1] - 90, 0];
  const onSea = projectPoint(pose, viewport, target);
  const pick = pickAt(pose, viewport, onSea.x, onSea.y, seabed, placed);
  assert.equal(pick.kind, 'sea');
  assert.ok(pick.kind === 'sea' && Math.hypot(pick.point[0] - target[0], pick.point[1] - target[1]) < 0.05);
  assert.deepEqual(pickAt(pose, viewport, 640, 0, seabed, placed, 500), { kind: 'none' }, 'past the reach');
});
