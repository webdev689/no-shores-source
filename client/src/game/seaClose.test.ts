import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eyeFor, FIELD_OF_VIEW, HEIGHT } from '../overworld/overworldCamera.ts';
import { deckToWorld, type Lying } from '../ships/deck.ts';
import { onScreen, type Shot } from './camera.ts';
import { CLOSE, CloseZoom } from './seaClose.ts';
import { pictureAt, shownScale } from './seaLaw.ts';

const SEA: Shot = { eye: [1000, 2190, 150], yaw: 0, pitch: 0.65, fov: 1.1, near: 2, far: 60_000 };
const lying = (scale: number) => ({ x: 1000, y: 2000, heading: 0.3, scale, heave: 0.2, pitch: 0, roll: 0 });

test('the wheel comes in past the Overworld only from its lowest, and goes back out from close first', () => {
  const close = new CloseZoom();
  assert.equal(close.zoom(2, false), 2, 'above the lowest the Overworld zooms');
  assert.equal(close.zoom(-1, false), -1, 'out from the Overworld, not from close');
  assert.equal(close.zoom(2, true), 0, 'at the lowest the wheel comes in close');
  close.step(10);
  assert.ok(Math.abs(close.eased - 0.352) < 1e-12, 'two notches of five, eased');
  assert.equal(close.zoom(-1, true), 0, 'out from close first');
  assert.equal(close.zoom(10, true), 0);
  close.step(10);
  assert.equal(close.eased, 1, 'no further in than her true size');
  close.release();
  close.step(10);
  assert.equal(close.eased, 0, 'let go, it eases back out');
  assert.equal(close.zoom(-1, true), -1, 'all the way out, the Overworld zooms out');
});

test('all the way in, the eye stands off her at her true scale, looking at her deck along the camera', () => {
  const close = new CloseZoom();
  close.zoom(5, true);
  close.step(10);
  const shot = close.shot(SEA, lying(1), 0, 0.5);
  const target = [1000, 2000, 0.2 + CLOSE.lookAtM];
  const away = Math.hypot(...shot.eye.map((value, axis) => value - (target[axis] ?? 0)));
  assert.ok(Math.abs(away - CLOSE.distanceM) < 1e-9, `${away} m from her deck`);
  assert.ok(shot.eye[1] > 2000 && Math.abs(shot.eye[0] - 1000) < 1e-9, 'south of her, looking north');
  assert.deepEqual([shot.pitch, shot.near, shot.far], [0.5, CLOSE.nearM, SEA.far]);
});

test("out of the close view the shot is the sea's own, and halfway in it lies between", () => {
  const close = new CloseZoom();
  assert.equal(close.shot(SEA, lying(4), 0, 0.5), SEA);
  close.zoom(2.5, true);
  close.step(10);
  const halfway = close.shot(SEA, lying(2.5), 0, 0.5);
  assert.ok(halfway.eye[2] < SEA.eye[2] && halfway.eye[2] > 0.2 + CLOSE.lookAtM, `${halfway.eye[2]}`);
});

/** The Sloop's length at her waterline, and how many times that she is drawn on the sea's view: 75 m. */
const LENGTH_M = 18.6775;
const SEA_SCALE = 75 / LENGTH_M;

/** Her length on a 960 by 600 picture as she `lying` lies, pixels. */
function lengthPx(shot: Shot, lying: Lying): number {
  const [bow, stern] = [-1, 1].map((end) => {
    const point = deckToWorld(lying, 0, (end * LENGTH_M) / 2, 0);
    return onScreen(shot, { width: 960, height: 600 }, point);
  });
  assert.ok(bow && stern, 'she is in the picture');
  return Math.hypot(bow[0] - stern[0], bow[1] - stern[1]);
}

test('the wheel brings the eye in without her shrinking on the screen or looming past her own size', () => {
  const ship = { x: 1000, y: 2000, heading: 0.4, scale: 1, heave: 0, pitch: 0, roll: 0 };
  const atHer = (view: Shot) => pictureAt(view, [ship.x, ship.y, 0]);
  for (const degrees of [30, 52, 75]) {
    const [yaw, tilt] = [2.6, (degrees * Math.PI) / 180];
    const { eye } = eyeFor([ship.x, ship.y, 0], yaw, tilt, HEIGHT.lowest);
    const sea: Shot = { eye, yaw, pitch: tilt, fov: FIELD_OF_VIEW, near: 2, far: 60_000 };
    const closest = new CloseZoom().closest(sea, ship, yaw, tilt);
    const scaleOf = (shown: Shot, share: number) =>
      shownScale(SEA_SCALE, { seaM: atHer(sea), shownM: atHer(shown), nearM: atHer(closest), share });
    assert.equal(scaleOf(sea, 0), SEA_SCALE, "the sea's view draws her 75 m long");
    const seaPx = lengthPx(sea, { ...ship, scale: SEA_SCALE });
    const close = new CloseZoom();
    close.zoom(5, true);
    let lastPx = seaPx;
    while (close.eased < 1) {
      close.step(0.02);
      const shown = close.shot(sea, ship, yaw, tilt);
      const scale = scaleOf(shown, close.eased);
      const drawnPx = lengthPx(shown, { ...ship, scale });
      assert.ok(drawnPx >= lastPx - 1e-9, `${degrees} degrees: she shrank from ${lastPx} px to ${drawnPx} px`);
      const ownPx = lengthPx(shown, ship);
      if (ownPx >= seaPx * 1.01) assert.equal(scale, 1, `${degrees} degrees: ${scale} times her size at ${ownPx} px`);
      lastPx = drawnPx;
    }
    assert.equal(scaleOf(close.shot(sea, ship, yaw, tilt), 1), 1, 'all the way in, her own size');
  }
});
