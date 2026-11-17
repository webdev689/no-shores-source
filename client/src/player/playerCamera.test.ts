import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CAMERA, FIRST_PERSON, cameraOrbit, eased, rayHit, scrolled, toggled } from './playerCamera.ts';

test('the wheel pulls back into third person, steps a notch at a time, and comes back into first person', () => {
  let view = scrolled(FIRST_PERSON, 1);
  assert.equal(view.firstPerson, false);
  assert.equal(view.distance, CAMERA.back);
  view = scrolled(view, 3);
  assert.ok(Math.abs(view.distance - (CAMERA.back + CAMERA.notch)) < 1e-9);
  for (let notch = 0; notch < 100; notch++) view = scrolled(view, 1);
  assert.equal(view.distance, CAMERA.farthest);
  for (let notch = 0; notch < 100 && !view.firstPerson; notch++) view = scrolled(view, -1);
  assert.equal(view.firstPerson, true);
  assert.equal(scrolled(FIRST_PERSON, -1), FIRST_PERSON);
  assert.equal(toggled(FIRST_PERSON).firstPerson, false);
});

test('the camera eases to where it is meant to be', () => {
  const third = { ...toggled(FIRST_PERSON), shown: 0 };
  let view = third;
  for (let frame = 0; frame < 60; frame++) view = eased(view, 1 / 60);
  assert.ok(Math.abs(view.shown - CAMERA.back) < 0.01);
});

test('third person sits behind the head and up; a wall between pulls it in', () => {
  const view = { firstPerson: false, distance: 2, shown: 2 };
  // Looking north, level: the camera is 2 m south of the head and 0.5 m up.
  const orbit = cameraOrbit([0, 0, 1.7], 0, 0, view, []);
  const eye = [orbit.targetX, orbit.targetY + 1, orbit.targetZ];
  assert.ok(
    Math.abs((eye[0] ?? 0) - 0) < 1e-9 && Math.abs((eye[1] ?? 0) - 2) < 1e-9 && Math.abs((eye[2] ?? 0) - 2.2) < 1e-9,
  );
  const wall = { minX: -5, maxX: 5, minY: 1, maxY: 1.5, top: 5 };
  assert.ok(Math.abs(rayHit([0, 0, 1.7], [0, 2, 2.2], [wall]) - 0.5) < 1e-9);
  const pulled = cameraOrbit([0, 0, 1.7], 0, 0, view, [wall]);
  assert.ok(pulled.targetY + 1 < 1, `${pulled.targetY + 1} is short of the wall`);
});
