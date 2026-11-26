import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Block } from '../../rules/movementRules.ts';
import { type Shot, WALK_LENS, onScreen } from '../camera.ts';
import { CROWN_M, HEAD_M, facesFraming, facesShot } from './framing.ts';

const VIEW = { width: 1600, height: 900 };
const GROUND = 30;
const OWN: Shot = { eye: [1000, 2030, GROUND + 3], yaw: 0, pitch: 0.2, fov: 1, near: 0.1, far: 3000 };

/** A solid box: its middle across and along, its half sizes, and its height from the ground. */
const box = (x: number, y: number, halfX: number, halfY: number, high: number): Block => ({
  minX: x - halfX,
  maxX: x + halfX,
  minY: y - halfY,
  maxY: y + halfY,
  bottom: GROUND,
  top: GROUND + high,
});

const seen = (shot: Shot, point: readonly [number, number, number]) => {
  const spot = onScreen(shot, VIEW, point);
  return spot !== null && spot[0] > 0 && spot[0] < VIEW.width && spot[1] > 0 && spot[1] < VIEW.height;
};

test('her farewell is seen from the side and over their heads, both faces in the view', () => {
  const stranger: [number, number, number] = [1000, 2027.8, GROUND];
  const player: [number, number, number] = [1000, 2030, GROUND];
  const shot = facesShot(OWN, stranger, player, []);
  for (const [east, south, up] of [stranger, player])
    assert.ok(seen(shot, [east, south, up + HEAD_M]), 'a face in the view');
  const away = Math.hypot(shot.eye[0] - 1000, shot.eye[1] - 2028.9);
  const over = shot.eye[2] - (GROUND + CROWN_M);
  assert.ok(away > 7 && away < 11 && over > 0.5 && over < 1.5, `beside the pair, over their heads: ${away}, ${over}`);
  const walled = facesShot(OWN, stranger, player, [box(1003.5, 2029, 0.5, 4, 4)]);
  assert.ok(walled.eye[0] < 1000, 'from the side a wall leaves clear');
});

test('the pair stand whole above the dialogue box, seen from over their heads, through every lens the game has', () => {
  const stranger: [number, number, number] = [1001.8, 2029, GROUND];
  const player: [number, number, number] = [1000, 2030, GROUND];
  for (const fov of [WALK_LENS.fov, 1, 0.7]) {
    const shot = facesShot({ ...OWN, fov }, stranger, player, []);
    assert.equal(shot.fov, fov, 'the player’s own lens');
    assert.ok(shot.eye[2] > GROUND + CROWN_M + 0.5, `the eye over their heads: ${shot.eye[2] - GROUND}`);
    // At 960x540 the box's top is 43% down the view (its words wrap to four lines); at 1600x900 it is lower.
    for (const view of [VIEW, { width: 960, height: 540 }])
      for (const [east, south] of [stranger, player]) {
        const crown = onScreen(shot, view, [east, south, GROUND + CROWN_M]);
        const feet = onScreen(shot, view, [east, south, GROUND]);
        const [top, foot] = [(crown?.[1] ?? 0) / view.height, (feet?.[1] ?? 1) / view.height];
        assert.ok(top > 0.1 && top < 0.2, `a crown well inside the view's top: ${top.toFixed(3)} (${fov})`);
        assert.ok(foot > 0.3 && foot < 0.4, `a figure whole above the box: ${foot.toFixed(3)} (${fov})`);
      }
    for (const [east, south] of [stranger, player]) assert.ok(Math.hypot(shot.eye[0] - east, shot.eye[1] - south) > 3);
  }
});

test('the face-to-face eye stands where the pair fill the view from crown to feet, looking down more from higher', () => {
  const low = facesFraming(2.4, WALK_LENS.fov);
  const high = facesFraming(3.4, WALK_LENS.fov);
  for (const { away } of [low, high]) assert.ok(away > 8 && away < 11, `${away} m off`);
  assert.ok(high.pitch > low.pitch && high.pitch < 0.6, 'looking down on them a little more from higher');
});
