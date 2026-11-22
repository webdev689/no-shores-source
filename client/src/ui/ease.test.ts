import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cubicBezier, easeOut } from './ease.ts';

const near = (actual: number, expected: number, within = 1e-4) =>
  assert.ok(Math.abs(actual - expected) <= within, `${actual} is not within ${within} of ${expected}`);

test("CSS's cubic-bezier runs from 0 to 1, a straight curve straight", () => {
  near(cubicBezier(0.16, 1, 0.3, 1, 0), 0, 1e-6);
  near(cubicBezier(0.16, 1, 0.3, 1, 1), 1, 1e-6);
  assert.ok(cubicBezier(0.16, 1, 0.3, 1, 0.3) > 0.8, 'most of the way early');
  near(cubicBezier(0.25, 0.25, 0.75, 0.75, 0.4), 0.4, 1e-6);
  near(cubicBezier(0.42, 0, 1, 1, -1), 0, 1e-6);
  near(cubicBezier(0.42, 0, 1, 1, 2), 1, 1e-6);
});

test("ease-out is Chromium's, read off an animation a quarter, half and three quarters through", () => {
  near(easeOut(0.25), 0.37814);
  near(easeOut(0.5), 0.68464);
  near(easeOut(0.75), 0.90654);
});
