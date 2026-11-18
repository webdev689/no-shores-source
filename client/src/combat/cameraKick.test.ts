import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FightEvent } from '../network/messages.ts';
import { CameraKick, kicksOf, leanOf } from './cameraKick.ts';
import { EVENT } from './cues.ts';

const DEGREE = Math.PI / 180;
const event = (kind: number, striker: number, defender: number, amount = 10, stroke = 3): FightEvent => ({
  tick: 0n,
  kind,
  how: 0,
  striker,
  defender,
  amount,
  stroke,
});

test("the player's blow landing punches the view down and along the stroke; one landing on them jolts it and shakes it", () => {
  const dealt = kicksOf([event(EVENT.hit, 1, 2)], 1);
  assert.equal(dealt.pushes.length, 1);
  assert.ok((dealt.pushes[0]?.pitch ?? 0) > 0 && (dealt.pushes[0]?.yaw ?? 0) < 0, 'down, and left with a sweep left');
  const killed = kicksOf([event(EVENT.killed, 1, 2)], 1);
  assert.ok((killed.pushes[0]?.pitch ?? 0) > (dealt.pushes[0]?.pitch ?? 0), 'a kill harder');
  const taken = kicksOf([event(EVENT.hit, 2, 1, 20)], 1);
  assert.ok((taken.pushes[0]?.pitch ?? 0) < 0 && taken.trauma > dealt.trauma, 'up, and shaken more');
  assert.ok(kicksOf([event(EVENT.hit, 2, 1, 40)], 1).trauma > taken.trauma, 'as hard as the harm');
  assert.equal(kicksOf([event(EVENT.hit, 2, 3)], 1).pushes.length, 0, "another's fight moves nothing");
  assert.equal(kicksOf([event(EVENT.dodged, 2, 1)], 1).pushes.length, 0);
  assert.equal(kicksOf([event(EVENT.parried, 1, 2)], 1).pushes.length, 1, 'stopped by a parry, knocked back');
});

test('a push peaks near its own size, overshoots a little and settles; a shake dies away', () => {
  const kick = new CameraKick();
  kick.push({ pitch: 1 * DEGREE });
  let peak = 0;
  let least = 0;
  for (let frame = 0; frame < 60; frame += 1) {
    kick.update(1 / 120);
    peak = Math.max(peak, kick.now.pitch);
    least = Math.min(least, kick.now.pitch);
  }
  assert.ok(Math.abs(peak - DEGREE) < 0.1 * DEGREE, `${peak / DEGREE}°`);
  assert.ok(least < 0 && least > -0.4 * DEGREE, 'overshoots a little');
  for (let frame = 0; frame < 120; frame += 1) kick.update(1 / 60);
  assert.ok(Math.abs(kick.now.pitch) < 0.01 * DEGREE, 'settled');
  kick.shake(1);
  kick.update(0.01);
  const shaken = Math.abs(kick.now.yaw) + Math.abs(kick.now.pitch);
  assert.ok(shaken > 0);
  kick.update(1);
  assert.ok(Math.abs(kick.now.yaw) + Math.abs(kick.now.pitch) < 1e-9, 'died away');
});

test('a kicked view turns about its own eye: the eye moves only as pushed', () => {
  const orbit = { targetX: 5, targetY: 4, targetZ: 1.6, yaw: 0.3, pitch: 0.1, distance: 1 };
  const eye = (view: typeof orbit) => [
    view.targetX - Math.cos(view.pitch) * Math.sin(view.yaw) * view.distance,
    view.targetY + Math.cos(view.pitch) * Math.cos(view.yaw) * view.distance,
    view.targetZ + Math.sin(view.pitch) * view.distance,
  ];
  const kick = new CameraKick();
  const turned = kick.kicked(orbit, { yaw: 0.02, pitch: 0.01 });
  eye(turned).forEach((value, axis) => assert.ok(Math.abs(value - (eye(orbit)[axis] ?? 0)) < 1e-12));
  assert.equal(turned.yaw, 0.32);
  const moved = kick.kicked(orbit, { ahead: 0.1, up: 0.05 });
  const [before, after] = [eye(orbit), eye(moved)];
  assert.ok(Math.abs((after[0] ?? 0) - (before[0] ?? 0) - 0.1 * Math.sin(0.3)) < 1e-12);
  assert.ok(Math.abs((after[2] ?? 0) - (before[2] ?? 0) - 0.05) < 1e-12);
  assert.deepEqual(kick.kicked(orbit), { ...orbit }, 'at rest, as it was');
});

test("the lean into the player's own swing follows its stroke", () => {
  assert.ok((leanOf(3).yaw ?? 0) < 0 && (leanOf(4).yaw ?? 0) > 0);
  assert.ok((leanOf(1).pitch ?? 0) > 0 && leanOf(6).ahead === 0.03);
});

test("a blow's hit and the kill it made punch once, as hard as the kill; a shot punches nothing", () => {
  const blow = [event(EVENT.hit, 1, 2, 30, 3), { ...event(EVENT.killed, 1, 2, 0, 0) }];
  const both = kicksOf(blow, 1);
  const killed = kicksOf([event(EVENT.killed, 1, 2, 0, 3)], 1);
  assert.equal(both.pushes.length, 1);
  assert.equal(both.pushes[0]?.pitch, killed.pushes[0]?.pitch);
  assert.ok((both.pushes[0]?.yaw ?? 0) < 0, 'along the hit’s stroke');
  assert.equal(kicksOf([{ ...event(EVENT.hit, 2, 1, 30), how: 6 }], 1).pushes.length, 0, 'an arrow');
});
