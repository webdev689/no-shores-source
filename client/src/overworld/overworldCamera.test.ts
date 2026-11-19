import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { HeightAt, Vec3 } from './ground.ts';
import {
  angleDelta,
  anglesOf,
  ceilingFor,
  CLEAR,
  clearHeight,
  clearSteps,
  clearView,
  CLEARANCE,
  eyeFor,
  FIELD_OF_VIEW,
  FOLLOW,
  forwardOf,
  HEIGHT,
  heightBand,
  horizonOf,
  initialCamera,
  orbitBy,
  poseOf,
  projectPoint,
  rayThrough,
  rightOf,
  stepCamera,
  TILT,
  turnCamera,
  upOf,
  ZOOM_STEP,
  zoomTarget,
} from './overworldCamera.ts';

const degrees = (value: number) => (value * Math.PI) / 180;
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function close(actual: number, expected: number, tolerance: number, what: string) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: ${actual} is not within ${tolerance} of ${expected}`);
}
const sea: HeightAt = () => -30;
/** A ship far out in the frame, so every test also runs at the positions the world really has. */
const ship: Vec3 = [4_200_000, 2_900_000, 0];

test('the camera stands 150 to 450 m over the ship, looks 15 to 75 degrees down, and stays under a cloud deck', () => {
  assert.equal(ceilingFor(null), 450, 'no weather yet: the band top');
  assert.equal(ceilingFor({ cloud: 0.3, falling: 0, storm: 0 }), 450, 'broken cloud: no deck');
  assert.equal(ceilingFor({ cloud: 1, falling: 0, storm: 0 }), 450, 'a high overcast deck: still the band top');
  assert.equal(ceilingFor({ cloud: 1, falling: 0.5, storm: 0 }), 340, 'rain lowers the deck: 60 m under its 400 m');
  assert.equal(ceilingFor({ cloud: 1, falling: 1, storm: 1 }), 90, 'a storm lower still');
  assert.equal(ceilingFor({ cloud: 1, falling: 3, storm: 1 }), 40, 'never under the floor');
  assert.deepEqual(heightBand(450), [150, 450]);
  assert.deepEqual(heightBand(90), [90, 90], 'under a low deck the band closes on the ceiling');
  assert.deepEqual(heightBand(10), [40, 40], 'and never under the floor');
  close(TILT.lowest, degrees(15), 1e-12, 'tilt floor');
  close(TILT.highest, degrees(75), 1e-12, 'tilt top');
});

test('the eye stands back along its bearing so its line of sight passes through the focus', () => {
  for (const [yaw, tilt, height] of [
    [0, degrees(52), 260],
    [degrees(90), degrees(30), 150],
    [degrees(-135), degrees(75), 450],
  ] as const) {
    const { eye, forward, back } = eyeFor(ship, yaw, tilt, height);
    close(eye[2], ship[2] + height, 1e-9, 'height over the focus');
    close(back, height / Math.tan(tilt), 1e-9, 'back');
    const reach = Math.hypot(eye[0] - ship[0], eye[1] - ship[1], eye[2] - ship[2]);
    for (let axis = 0; axis < 3; axis++) close(eye[axis] + forward[axis] * reach, ship[axis], 1e-6, `axis ${axis}`);
    close(Math.hypot(...forward), 1, 1e-12, 'unit look');
  }
});

test('a bearing of 0 looks north, up the map, with east on the right; a quarter turn looks east', () => {
  const north = forwardOf(0, 0);
  close(north[0], 0, 1e-12, 'east');
  close(north[1], -1, 1e-12, 'south');
  assert.deepEqual(rightOf(0), [1, 0, 0]);
  const east = forwardOf(Math.PI / 2, 0);
  close(east[0], 1, 1e-12, 'east');
  close(east[1], 0, 1e-12, 'south');
  const { eye } = eyeFor(ship, 0, degrees(52), 260);
  assert.ok(eye[1] > ship[1], 'looking north, the eye stands south of the ship');
  const angles = anglesOf(forwardOf(degrees(40), degrees(-20)));
  close(angles.yaw, degrees(40), 1e-12, 'yaw round trip');
  close(angles.pitch, degrees(-20), 1e-12, 'pitch round trip');
});

test('the pose is square and level: right and up are unit, square to the look, and up points to the sky', () => {
  for (const [yaw, pitch] of [
    [0.3, -0.9],
    [2.5, -0.2],
    [-1.1, -1.3],
  ] as const) {
    const forward = forwardOf(yaw, pitch);
    const pose = poseOf({ eye: ship, forward });
    close(dot(pose.right, forward), 0, 1e-12, 'right square to the look');
    close(dot(pose.up, forward), 0, 1e-12, 'up square to the look');
    close(dot(pose.up, pose.right), 0, 1e-12, 'up square to right');
    close(Math.hypot(...pose.up), 1, 1e-12, 'unit up');
    assert.equal(pose.right[2], 0, 'the horizon stays level');
    assert.ok(pose.up[2] > 0);
    assert.equal(pose.fovY, FIELD_OF_VIEW);
  }
  assert.equal(upOf(0.4, 0)[2], 1, 'looking level, up is the sky');
});

test('over open sea the eye keeps the height asked for; unknown ground is sea', () => {
  assert.equal(clearHeight(ship, 0, TILT.initial, 260, sea), 260);
  assert.equal(
    clearHeight(ship, 0, TILT.initial, 260, () => Number.NaN),
    260,
  );
  // At the floor the middle of a 40 m line of sight stands under the clearance over the water, so it lifts.
  const lifted = clearHeight(ship, 0, TILT.initial, 40, sea);
  close(lifted / 2, CLEARANCE.groundM, 1e-6, 'the middle keeps its clearance over the sea');
});

test('a hill under the eye or a ridge between it and the ship lifts the eye clear by 25 m', () => {
  // Looking north the eye stands south of the ship: the hill is south.
  const hill: HeightAt = (_east, y) => (y > ship[1] + 150 ? 300 : -30);
  const height = clearHeight(ship, 0, TILT.initial, 260, hill);
  assert.ok(height > 260);
  assert.ok(eyeFor(ship, 0, TILT.initial, height).eye[2] >= 300 + CLEARANCE.groundM - 1e-6, 'the eye clears it');
  const ridge: HeightAt = (_east, y) => (y > ship[1] + 60 && y < ship[1] + 140 ? 200 : -30);
  const overRidge = clearHeight(ship, 0, TILT.initial, 260, ridge);
  assert.ok(overRidge > 260 && overRidge / 2 >= 200 + CLEARANCE.groundM - 1e-6, 'the middle clears the ridge');
});

test('the far half of the line of sight is sampled no more than 100 m apart, and its near half never', () => {
  assert.equal(clearSteps(150), 1);
  assert.equal(clearSteps(330), 2);
  assert.equal(clearSteps(1_739), 9);
  assert.equal(clearSteps(Number.NaN), 1);
  assert.equal(CLEAR.spanM, 100);
  const [tilt, height] = [TILT.lowest, 450];
  const back = height / Math.tan(tilt);
  // A crest three quarters of the way back to the eye, with the middle clear.
  const crest: HeightAt = (_east, y) => (y > ship[1] + 0.7 * back && y < ship[1] + 0.8 * back ? 0.75 * height : 0);
  const view = clearView(ship, 0, tilt, height, crest);
  const { eye } = eyeFor(ship, 0, view.tilt, view.height);
  for (let share = 0.5; share <= 1; share += 0.01) {
    const point = [0, 1, 2].map((axis) => ship[axis] + (eye[axis] - ship[axis]) * share);
    const ground = crest(point[0], point[1]);
    assert.ok(ground === 0 || point[2] >= ground + CLEARANCE.groundM - 1e-6, `clear at ${share.toFixed(2)}`);
  }
  // Rolling hills looking out low: nothing near the ship lifts or steepens the view.
  const hills: HeightAt = (x, y) => 60 * Math.sin(x / 143) * Math.cos(y / 143);
  let steepened = 0;
  for (let east = 0; east < 3_000; east += 97) {
    for (let yaw = 0; yaw < 6.28; yaw += 0.5) {
      if (clearView([east, 0, Math.max(0, hills(east, 0))], yaw, tilt, height, hills).tilt > tilt + 1e-9) steepened++;
    }
  }
  assert.equal(steepened, 0);
});

test('ground behind the eye steeper than the tilt steepens the view until the eye clears it', () => {
  const rise = Math.tan(degrees(54));
  const slope: HeightAt = (_east, y) => (y > ship[1] ? (y - ship[1]) * rise : 0);
  const view = clearView(ship, 0, TILT.initial, 260, slope);
  const { eye } = eyeFor(ship, 0, view.tilt, view.height);
  assert.ok(eye[2] >= slope(eye[0], eye[1]) + CLEARANCE.groundM - 1e-6);
  assert.ok(view.tilt > TILT.initial, 'by steepening');
  assert.deepEqual(clearView(ship, 0, TILT.initial, 260, sea), { height: 260, tilt: TILT.initial });
});

test('the wheel scales the height by 1.18 a notch inside the band; a drag orbits and tilts, the tilt held', () => {
  assert.equal(ZOOM_STEP, 1.18);
  close(zoomTarget(260, 1, 450), 260 / 1.18, 1e-9, 'a notch in');
  close(zoomTarget(260, -1, 450), 260 * 1.18, 1e-9, 'a notch out');
  assert.equal(zoomTarget(160, 5, 450), 150);
  assert.equal(zoomTarget(400, -5, 450), 450);
  assert.equal(zoomTarget(400, -5, 300), 300, 'nor over a low deck');
  const camera = initialCamera(ship, 1);
  assert.equal(camera.height, HEIGHT.initial);
  assert.equal(camera.tilt, TILT.initial);
  close(orbitBy(camera, 100, 0).yaw, 1.5, 1e-12, 'orbit');
  assert.equal(orbitBy(camera, 0, 1e6).tilt, TILT.highest);
  assert.equal(orbitBy(camera, 0, -1e6).tilt, TILT.lowest);
  close(turnCamera(camera, 0.25, 0).yaw, 1.25, 1e-12, 'turn');
});

test('a frame eases the focus onto the ship, takes a jump whole, and eases the height under the ceiling', () => {
  const camera = initialCamera(ship, 0);
  const moved: Vec3 = [ship[0] + 10, ship[1], 0];
  const eased = stepCamera(camera, { feet: moved, dt: 1 / 60, ceiling: 450 });
  assert.ok(eased.camera.focus[0] > ship[0] && eased.camera.focus[0] < moved[0], 'eased');
  const landed: Vec3 = [ship[0] + FOLLOW.jumpM + 1, ship[1], 0];
  assert.deepEqual(stepCamera(camera, { feet: landed, dt: 1 / 60, ceiling: 450 }).camera.focus, landed, 'a jump');
  const zoomed = { ...camera, heightTarget: 400 };
  const rising = stepCamera(zoomed, { feet: ship, dt: 1 / 60, ceiling: 450 });
  assert.ok(rising.camera.height > 260 && rising.camera.height < 400);
  const fogged = stepCamera({ ...zoomed, height: 400 }, { feet: ship, dt: 1 / 60, ceiling: 90 });
  assert.equal(fogged.camera.height, 90, 'never over the deck, even mid-ease');
  assert.equal(fogged.camera.heightTarget, 400, 'the zoom is kept under the deck');
  let cleared = fogged.camera;
  for (let i = 0; i < 120; i++) cleared = stepCamera(cleared, { feet: ship, dt: 1 / 60, ceiling: 450 }).camera;
  assert.ok(cleared.height > 380, 'and climbs back once the deck lifts');
  const hill: HeightAt = (_east, y) => (y > ship[1] + 100 ? 500 : -30);
  const framed = stepCamera(camera, { feet: ship, dt: 1 / 60, ceiling: 450, heightAt: hill });
  assert.ok(framed.shot.height > framed.camera.height, 'the shot clears the hill; the kept height does not hold it');
  assert.ok(framed.shot.eye[2] >= 525 - 1e-6);
});

test('a ship at the top pace is followed at a held lag, never jumped, even at a low frame rate', () => {
  for (const framesPerSecond of [60, 15]) {
    let camera = initialCamera(ship, 0);
    const dt = 1 / framesPerSecond;
    let [jumps, lag] = [0, 0];
    for (let i = 1; i <= 3 * framesPerSecond; i++) {
      const feet: Vec3 = [ship[0], ship[1] - 1_200 * i * dt, 0];
      const step = stepCamera(camera, { feet, dt, ceiling: 450 });
      if (step.camera.focus[1] === feet[1]) jumps++;
      camera = step.camera;
      lag = Math.max(lag, camera.focus[1] - feet[1]);
    }
    assert.equal(jumps, 0, `no jump at ${framesPerSecond} frames a second`);
    assert.ok(lag <= FOLLOW.lagM + 1e-9 && lag > FOLLOW.lagM - 1, `the lag held at ${FOLLOW.lagM} m (${lag})`);
  }
});

test('the focus projects to the middle of the picture, and the ray through the middle is the look', () => {
  const viewport = { width: 1600, height: 900 };
  const { eye, forward } = eyeFor(ship, 2, TILT.initial, 260);
  const pose = poseOf({ eye, forward });
  const middle = projectPoint(pose, viewport, ship);
  close(middle.x, 800, 1e-6, 'x');
  close(middle.y, 450, 1e-6, 'y');
  assert.ok(middle.front);
  const ray = rayThrough(pose, viewport, 800, 450);
  for (let axis = 0; axis < 3; axis++) close(ray[axis], forward[axis], 1e-12, `axis ${axis}`);
  const behind = projectPoint(pose, viewport, [eye[0] - forward[0] * 50, eye[1] - forward[1] * 50, eye[2]]);
  assert.equal(behind.front, false);
  // A point on the eye's own plane, a hair in front: right of the middle, never mirrored to the left.
  const level = poseOf({ eye: ship, forward: forwardOf(0, 0) });
  const beside = projectPoint(level, viewport, [ship[0] + 10, ship[1] - 5e-10, ship[2]]);
  assert.ok(beside.front && beside.x > 800);
});

test('looking north, a point east of the focus stands right and one north stands higher on the picture', () => {
  const viewport = { width: 800, height: 600 };
  const pose = poseOf(eyeFor(ship, 0, TILT.initial, 260));
  const east = projectPoint(pose, viewport, [ship[0] + 50, ship[1], 0]);
  const north = projectPoint(pose, viewport, [ship[0], ship[1] - 50, 0]);
  assert.ok(east.x > 400 && Math.abs(east.y - 300) < 1e-6);
  assert.ok(north.y < 300 && Math.abs(north.x - 400) < 1e-6);
});

test('a ray through any pixel meets the sea where that pixel shows it', () => {
  const viewport = { width: 1280, height: 720 };
  const pose = poseOf(eyeFor(ship, 0.7, TILT.initial, 300));
  for (const [x, y] of [
    [100, 600],
    [1200, 500],
    [640, 100],
  ] as const) {
    const ray = rayThrough(pose, viewport, x, y);
    const t = pose.eye[2] / -ray[2];
    const point: Vec3 = [pose.eye[0] + ray[0] * t, pose.eye[1] + ray[1] * t, 0];
    const back = projectPoint(pose, viewport, point);
    close(back.x, x, 1e-5, 'x');
    close(back.y, y, 1e-5, 'y');
  }
});

test('the lens reaches out with the eye, never nearer than the ground own', () => {
  const ground = { nearM: 0.2, farM: 6_000 };
  const near = horizonOf(ground, 330);
  assert.equal(near.nearM, 2);
  assert.equal(near.farM, 28_330);
  const high = horizonOf(ground, 150_000);
  assert.equal(high.farM, 600_000, 'from far up the lens reaches past the framed side');
  assert.equal(high.nearM, 150);
  const farGround = horizonOf({ nearM: 0.2, farM: 100_000 }, 330);
  assert.equal(farGround.farM, 100_000, 'never nearer than the ground own');
});

test('a turn between two bearings goes the short way round', () => {
  close(angleDelta(degrees(170), degrees(-170)), degrees(20), 1e-12, 'across the seam');
});
