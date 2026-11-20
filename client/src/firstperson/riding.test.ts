import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Strip } from '../forge/compose.ts';
import { type DyeTable, PaletteSnap, type Rgb } from '../forge/dyes.ts';
import { gripFrame, gripPlace } from './climbing.ts';
import { FramePainter } from './fpFrames.ts';
import {
  RideMotion,
  fistPath,
  fistPoseOf,
  horsePicture,
  reinPath,
  reinPicture,
  rideShotKey,
  ridePath,
  rideSink,
} from './riding.ts';

const band: Rgb[] = Array.from({ length: 16 }, (_unused, step) => [step * 16, step * 16, step * 16]);
const dyes: DyeTable = { palette: [...band, [200, 0, 0]], clothing: {}, armour: { Steel: band } };

function sourceOf(strips: Record<string, Strip>) {
  return {
    frames: {},
    dyes,
    painter: new FramePainter(dyes, new PaletteSnap(dyes.palette)),
    strip: (path: string) => Promise.resolve(strips[path] ?? null),
  };
}

/** A strip drawn in red from row `top` down. */
function from(top: number, width = 4, height = 20): Strip {
  const data = new Uint8Array(width * height * 4);
  for (let row = top; row < height; row++)
    for (let column = 0; column < width; column++) data.set([200, 0, 0, 255], (row * width + column) * 4);
  return { width, height, data };
}

test('a stride steps its four frames on its own clock; standing, it shows the stand', () => {
  const motion = new RideMotion(() => 0.99);
  assert.equal(motion.step(0.01, 'stand', null).key, 'stand-0');
  const walk = [0.1, 0.1, 0.1, 0.1, 0.1].map(() => motion.step(0.0625, 'walk', null).k);
  assert.deepEqual(new Set(walk).size > 1, true);
  assert.ok(walk.every((k) => k >= 0 && k < 4));
});

test('turning the look quickly draws the head into the turn, and the turn is held a moment past it', () => {
  const motion = new RideMotion();
  motion.step(0.1, 'walk', 0);
  assert.equal(motion.step(0.1, 'walk', 0.2).turn, 'R');
  assert.equal(motion.step(0.1, 'walk', 0.2).turn, 'R');
  motion.step(0.2, 'walk', 0.2);
  assert.equal(motion.step(0.1, 'walk', 0.2).turn, '');
  assert.equal(motion.step(0.1, 'walk', 0.05).key.endsWith('_tL'), true);
});

test('standing still the horse now and then flicks an ear', () => {
  const motion = new RideMotion(() => 0);
  const strips = Array.from({ length: 40 }, () => motion.step(0.1, 'stand', null).strip);
  assert.ok(strips.includes('earL'));
});

test('each hand gives on its own beat, the left a beat behind; in a turn the inside hand draws in', () => {
  const shot = { strip: 'gallop', k: 3, turn: '' as const, key: rideShotKey('gallop', 3) };
  assert.deepEqual([fistPoseOf(shot, 'R'), fistPoseOf(shot, 'L')], ['gallop-3', 'gallop-0']);
  const turning = { strip: 'walk', k: 0, turn: 'L' as const, key: rideShotKey('walk', 0, 'L') };
  assert.deepEqual([fistPoseOf(turning, 'L'), fistPoseOf(turning, 'R')], ['steerIn', 'steerOut']);
});

test("a gallop's frames are sunk halfway toward its lowest ears, and the hands with them", async () => {
  const strips = {
    [ridePath('gallop-0')]: from(10),
    [ridePath('gallop-1')]: from(2),
    [ridePath('gallop-2')]: from(10),
    [ridePath('gallop-3')]: from(6),
  };
  const source = sourceOf(strips);
  const shot = { strip: 'gallop', k: 1, turn: '' as const, key: 'gallop-1' };
  assert.equal(await rideSink(source, shot), 4);
  assert.equal(await rideSink(source, { ...shot, strip: 'walk' }), 0);
  const horse = await horsePicture(source, shot);
  assert.deepEqual(horse?.at, [(320 - 4 * 0.8) / 2, 200 - 20 + 4]);
});

test("a rein lies under its fist, the fist in the gauntlets worn or the glove's", async () => {
  const shot = { strip: 'stand', k: 0, turn: '' as const, key: 'stand-0' };
  const rein = from(0, 2, 1);
  const fist: Strip = { width: 2, height: 1, data: new Uint8Array([0, 0, 0, 0, 128, 128, 128, 255]) };
  const source = sourceOf({ [reinPath('stand-0', 'L')]: rein, [fistPath('stand-0', 'L', null)]: fist });
  const picture = await reinPicture(source, shot, 'L', 'Iron');
  assert.deepEqual(Array.from(picture?.pixels ?? []), [200, 0, 0, 255, 128, 128, 128, 255]);
});

test('the hands come up onto the wall from under the screen, the right the mirror of the left', () => {
  assert.equal(gripFrame(0), 0);
  assert.equal(gripFrame(1), 5);
  const left = gripPlace('left', 1)();
  const right = gripPlace('right', 1)();
  assert.equal(left.flip, false);
  assert.equal(right.flip, true);
  assert.ok(Math.abs(left.x + left.width - (320 - right.x)) < 1e-9);
  assert.ok(left.y + left.height > 200);
  assert.ok(gripPlace('left', 0)().y >= 200);
});
