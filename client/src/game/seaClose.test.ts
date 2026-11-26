import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eyeFor, FIELD_OF_VIEW, HEIGHT } from '../overworld/overworldCamera.ts';
import { deckToWorld, type Lying } from '../ships/deck.ts';
import { onScreen, type Shot } from './camera.ts';
import { CLOSE, CloseZoom } from './seaClose.ts';
import { pictureAt, shownScale } from './seaLaw.ts';

const SEA: Shot = { eye: [1000, 2190, 150], yaw: 0, pitch: 0.65, fov: 1.1, near: 2, far: 60_000 };
const lying = (scale: number) => ({ x: 1000, y: 2000, heading: 0.3, scale, heave: 0.2, pitch: 0, roll: 0 });

test('the switch takes the view down to sea level and back up, easing there', () => {
  const close = new CloseZoom();
  assert.equal(close.down, false, 'the Oversea view first');
  close.set(true);
  assert.equal(close.down, true);
  close.step(0.05);
  assert.ok(close.eased > 0 && close.eased < 1, `on its way down: ${close.eased}`);
  close.step(10);
  assert.equal(close.eased, 1, 'at sea level');
  close.set(false);
  close.step(10);
  assert.equal(close.eased, 0, 'back up in the Oversea view');
});

test('at sea level the eye stands off it at its true scale, looking at its deck along the camera', () => {
  const close = new CloseZoom();
  close.set(true);
  close.step(10);
  const shot = close.shot(SEA, lying(1), 0, 0.5);
  const target = [1000, 2000, 0.2 + CLOSE.lookAtM];
  const away = Math.hypot(...shot.eye.map((value, axis) => value - (target[axis] ?? 0)));
  assert.ok(Math.abs(away - CLOSE.distanceM) < 1e-9, `${away} m from its deck`);
  assert.ok(shot.eye[1] > 2000 && Math.abs(shot.eye[0] - 1000) < 1e-9, 'south of it, looking north');
  assert.deepEqual([shot.pitch, shot.near, shot.far], [0.5, CLOSE.nearM, SEA.far]);
});

test("in the Oversea view the shot is the sea's own, and on the way down it lies between", () => {
  const close = new CloseZoom();
  assert.equal(close.shot(SEA, lying(4), 0, 0.5), SEA);
  close.set(true);
  close.step(0.1);
  const between = close.shot(SEA, lying(2.5), 0, 0.5);
  assert.ok(between.eye[2] < SEA.eye[2] && between.eye[2] > 0.2 + CLOSE.lookAtM, `${between.eye[2]}`);
});

/** Every hull's length at its waterline (content/ships/ships.json), metres. */
const HULL_LENGTHS_M = { sloop: 18.6775, schooner: 25.1942, brig: 30.7446, frigate: 38.0581 } as const;
/** Lengths a ship may be drawn at on the sea's view, metres: 75 m today, and either side of it, up to as long as its
 *  own size at the closest still shows the Sloop as large, looking down at the camera's steepest. */
const DRAWN_LENGTHS_M = [40, 75, 90] as const;

/** Its length on a 960 by 600 picture as it `lying` lies, `lengthM` long at its own size, pixels. */
function lengthPx(shot: Shot, lying: Lying, lengthM: number): number {
  const [bow, stern] = [-1, 1].map((end) => {
    const point = deckToWorld(lying, 0, (end * lengthM) / 2, 0);
    return onScreen(shot, { width: 960, height: 600 }, point);
  });
  assert.ok(bow && stern, 'it is in the picture');
  return Math.hypot(bow[0] - stern[0], bow[1] - stern[1]);
}

/** Its length on the picture frame by frame as the view is switched down to sea level from the Oversea camera at
 *  `height` metres, looking `degrees` down, drawn `drawnM` long on the sea's view: each frame's pixels, and its scale
 *  at sea level. */
function switchedDown(lengthM: number, drawnM: number, degrees: number, height: number) {
  const ship = { x: 1000, y: 2000, heading: 0.4, scale: 1, heave: 0, pitch: 0, roll: 0 };
  const atShip = (view: Shot) => pictureAt(view, [ship.x, ship.y, 0]);
  const [yaw, tilt] = [2.6, (degrees * Math.PI) / 180];
  const { eye } = eyeFor([ship.x, ship.y, 0], yaw, tilt, height);
  const sea: Shot = { eye, yaw, pitch: tilt, fov: FIELD_OF_VIEW, near: 2, far: 60_000 };
  const close = new CloseZoom();
  const nearM = atShip(close.closest(sea, ship, yaw, tilt));
  const scaleOf = (shown: Shot, share: number) =>
    shownScale(drawnM / lengthM, { seaM: atShip(sea), shownM: atShip(shown), nearM, share });
  const pixels = [lengthPx(sea, { ...ship, scale: scaleOf(sea, 0) }, lengthM)];
  close.set(true);
  let scale = 0;
  while (close.eased < 1) {
    close.step(1 / 60);
    const shown = close.shot(sea, ship, yaw, tilt);
    scale = scaleOf(shown, close.eased);
    assert.ok(scale >= 1, 'never under its own size');
    pixels.push(lengthPx(shown, { ...ship, scale }, lengthM));
  }
  return { pixels, scale };
}

test('switched down from any height of the Oversea view, every hull grows on the picture to its size, never shrinking', () => {
  for (const [hull, lengthM] of Object.entries(HULL_LENGTHS_M))
    for (const drawnM of DRAWN_LENGTHS_M)
      for (const degrees of [30, 52, 75])
        for (const height of [HEIGHT.lowest, 260, HEIGHT.highest]) {
          const { pixels, scale } = switchedDown(lengthM, drawnM, degrees, height);
          const where = `${hull} drawn ${drawnM} m, ${degrees} degrees, from ${height} m`;
          const shrank = pixels.findIndex((now, frame) => frame > 0 && now < (pixels[frame - 1] ?? now) - 1e-9);
          assert.equal(shrank, -1, `${where}: it shrank at frame ${shrank}: ${pixels.map(Math.round)}`);
          assert.ok(pixels.at(-1)! > pixels[0]!, `${where}: it grew`);
          assert.equal(scale, 1, `${where}: at sea level, its own size`);
        }
});
