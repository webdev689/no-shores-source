import assert from 'node:assert/strict';
import { test } from 'node:test';
import { project } from '../combat/hud.ts';
import { type Shot, onScreen } from './camera.ts';
import { worldMatrix } from './footFight.ts';

test('the display finds a point far out in the world where the camera draws it, to a hundredth of a pixel', () => {
  const shot: Shot = { eye: [2_807_143.37, 1_207_025.81, 31.6], yaw: 0.4, pitch: 0.1, fov: 0.9, near: 0.1, far: 6e4 };
  const size = { width: 1280, height: 800 };
  const point = [2_807_146.12, 1_207_016.43, 30.9] as const;
  const drawn = onScreen(shot, size, point);
  const found = project(worldMatrix(shot, size.width / size.height), point, size.width, size.height);
  assert.ok(drawn && found);
  assert.ok(Math.abs(found.x - drawn[0]) < 0.01 && Math.abs(found.y - drawn[1]) < 0.01, `${found.x}, ${found.y}`);
});
