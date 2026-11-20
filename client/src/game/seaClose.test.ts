import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eyeFor, FIELD_OF_VIEW, HEIGHT, zoomTarget } from '../overworld/overworldCamera.ts';
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
  assert.equal(close.eased, 1, 'no further in than its true size');
  close.release();
  close.step(10);
  assert.equal(close.eased, 0, 'let go, it eases back out');
  assert.equal(close.zoom(-1, true), -1, 'all the way out, the Overworld zooms out');
});

test('all the way in, the eye stands off it at its true scale, looking at its deck along the camera', () => {
  const close = new CloseZoom();
  close.zoom(5, true);
  close.step(10);
  const shot = close.shot(SEA, lying(1), 0, 0.5);
  const target = [1000, 2000, 0.2 + CLOSE.lookAtM];
  const away = Math.hypot(...shot.eye.map((value, axis) => value - (target[axis] ?? 0)));
  assert.ok(Math.abs(away - CLOSE.distanceM) < 1e-9, `${away} m from its deck`);
  assert.ok(shot.eye[1] > 2000 && Math.abs(shot.eye[0] - 1000) < 1e-9, 'south of it, looking north');
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

/** Its length on the picture at each notch of the wheel, from the raised view down to the closest. */
function notchByNotch(lengthM: number, drawnM: number, degrees: number): { pixels: number[]; scale: number } {
  const ship = { x: 1000, y: 2000, heading: 0.4, scale: 1, heave: 0, pitch: 0, roll: 0 };
  const atShip = (view: Shot) => pictureAt(view, [ship.x, ship.y, 0]);
  const [yaw, tilt] = [2.6, (degrees * Math.PI) / 180];
  const close = new CloseZoom();
  const pixels: number[] = [];
  let [height, scale]: number[] = [HEIGHT.highest, 0];
  for (let notch = 0; notch <= 13; notch++) {
    const left = notch === 0 ? 0 : close.zoom(1, height <= HEIGHT.lowest + 1e-6);
    height = zoomTarget(height, left, Infinity);
    close.step(10);
    const { eye } = eyeFor([ship.x, ship.y, 0], yaw, tilt, height);
    const sea: Shot = { eye, yaw, pitch: tilt, fov: FIELD_OF_VIEW, near: 2, far: 60_000 };
    const shown = close.shot(sea, ship, yaw, tilt);
    const nearM = atShip(close.closest(sea, ship, yaw, tilt));
    scale = shownScale(drawnM / lengthM, { seaM: atShip(sea), shownM: atShip(shown), nearM, share: close.eased });
    pixels.push(lengthPx(shown, { ...ship, scale }, lengthM));
  }
  return { pixels, scale };
}

test('notch by notch from the raised view to the closest, every hull grows steadily on the picture to its size', () => {
  for (const [hull, lengthM] of Object.entries(HULL_LENGTHS_M))
    for (const drawnM of DRAWN_LENGTHS_M)
      for (const degrees of [30, 52, 75]) {
        const { pixels, scale } = notchByNotch(lengthM, drawnM, degrees);
        const where = `${hull} drawn ${drawnM} m, ${degrees} degrees`;
        const growth = pixels.slice(1).map((now, notch) => now / (pixels[notch] ?? now));
        const coming = growth.slice(0, -1);
        assert.ok(
          coming.every((each) => each > 1.0001),
          `${where}: a notch left it as it was or shrank it: ${pixels.map(Math.round)}`,
        );
        // Five notches close in, the steepest of them a little under a third of the way (`smooth01`).
        const closeIn = pixels.at(-2)! / pixels.at(-7)!;
        const steepest = Math.max(...coming.slice(-5));
        assert.ok(
          steepest <= closeIn ** 0.3 + 1e-9,
          `${where}: a notch jumped ${steepest} times: ${pixels.map(Math.round)}`,
        );
        assert.equal(growth.at(-1), 1, 'all the way in, the wheel brings it no nearer');
        assert.equal(scale, 1, `${where}: all the way in, its own size`);
      }
});

test('the wheel brings the eye in without it ever shrinking on the screen, frame by frame', () => {
  const ship = { x: 1000, y: 2000, heading: 0.4, scale: 1, heave: 0, pitch: 0, roll: 0 };
  const atShip = (view: Shot) => pictureAt(view, [ship.x, ship.y, 0]);
  for (const lengthM of Object.values(HULL_LENGTHS_M))
    for (const degrees of [30, 52, 75]) {
      const [yaw, tilt] = [2.6, (degrees * Math.PI) / 180];
      const { eye } = eyeFor([ship.x, ship.y, 0], yaw, tilt, HEIGHT.lowest);
      const sea: Shot = { eye, yaw, pitch: tilt, fov: FIELD_OF_VIEW, near: 2, far: 60_000 };
      const closest = new CloseZoom().closest(sea, ship, yaw, tilt);
      const scaleOf = (shown: Shot, share: number) =>
        shownScale(75 / lengthM, { seaM: atShip(sea), shownM: atShip(shown), nearM: atShip(closest), share });
      assert.equal(scaleOf(sea, 0), 75 / lengthM, "the sea's view draws it 75 m long");
      const close = new CloseZoom();
      close.zoom(5, true);
      let lastPx = lengthPx(sea, { ...ship, scale: 75 / lengthM }, lengthM);
      while (close.eased < 1) {
        close.step(0.02);
        const shown = close.shot(sea, ship, yaw, tilt);
        const scale = scaleOf(shown, close.eased);
        const drawnPx = lengthPx(shown, { ...ship, scale }, lengthM);
        assert.ok(drawnPx >= lastPx - 1e-9, `${degrees} degrees: it shrank from ${lastPx} pixels to ${drawnPx} pixels`);
        assert.ok(scale >= 1, 'never under its own size');
        lastPx = drawnPx;
      }
    }
});
