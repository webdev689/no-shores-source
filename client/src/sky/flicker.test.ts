import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import {
  breath,
  FLAME_FRAMES_PER_SECOND,
  flameFrame,
  flicker,
  LIGHT_MOTION_WGSL,
  lightMotion,
  motionCode,
} from './flicker.ts';

test('a flame flickers within its band, held through each frame, and no two seeds in step', () => {
  for (let seconds = 0; seconds < 20; seconds += 0.013) {
    const shown = flicker(3, seconds);
    assert.ok(shown <= 1 && shown >= 0.8, `${shown} at ${seconds}`);
    assert.ok(flicker(3, seconds, 0.5) >= 0.9);
  }
  for (let seconds = 0; seconds < 3; seconds += 0.004) {
    const later = seconds + 0.004;
    const same = flameFrame(7, seconds) === flameFrame(7, later);
    assert.equal(same, flicker(7, seconds) === flicker(7, later), `${seconds}`);
  }
  assert.equal(flameFrame(7, 2.5) - flameFrame(7, 2), FLAME_FRAMES_PER_SECOND / 2);
  assert.notEqual(flicker(1, 2), flicker(2, 2));
  assert.equal(flicker(5, 2, 0), 1);
});

test('a glow breathes slowly between full and 1 - 0.4 depth, and not at all with none', () => {
  for (let seconds = 0; seconds < 30; seconds += 0.1) {
    assert.ok(breath(2, seconds) >= 0.6 - 1e-9 && breath(2, seconds) <= 1 + 1e-9);
    assert.equal(breath(2, seconds, 0), 1);
    assert.ok(Math.abs(breath(2, seconds + 0.1) - breath(2, seconds)) < 0.02, 'smooth, not stepped');
  }
});

test('the WGSL twins give what the TypeScript gives', () => {
  const body = (name: string) => {
    const found = new RegExp(`fn ${name}\\(([^)]*)\\) -> f32 \\{([^}]*)\\}`).exec(LIGHT_MOTION_WGSL);
    assert.ok(found, name);
    const params = (found[1] ?? '').split(',').map((param) => param.split(':')[0]?.trim());
    const code = (found[2] ?? '').replace(/\blet /g, 'const ');
    return { params, code };
  };
  const context = {
    sin: Math.sin,
    cos: Math.cos,
    floor: Math.floor,
    fract: (value: number) => value - Math.floor(value),
  };
  const phase = body('light_phase');
  const light_phase = (seed: number) => runInNewContext(`(() => {${phase.code}})()`, { ...context, seed });
  for (const [name, twin] of [
    ['light_flicker', flicker],
    ['light_breath', breath],
  ] as const) {
    const { code } = body(name);
    for (const [seed, time, depth] of [
      [0, 0.37, 1],
      [17, 12.81, 0.6],
      [3.4, 101.2, 1.2],
    ] as const) {
      const shaded = runInNewContext(`(() => {${code}})()`, { ...context, light_phase, seed, time, depth });
      assert.ok(Math.abs(shaded - twin(seed, time, depth)) < 1e-9, `${name} ${seed} ${time}`);
    }
  }
});

test("a light's motion code carries its kind and its seed's phase, and moves as the light itself", () => {
  for (const seed of [0, 1, 7.3, 4095, 123456]) {
    for (const seconds of [0.37, 12.81, 101.2]) {
      const near = (code: number, shown: number) => Math.abs(lightMotion(Math.fround(code), seconds) - shown) < 1e-5;
      assert.ok(near(motionCode('fire', seed), flicker(seed, seconds)), `fire ${seed}`);
      assert.ok(near(motionCode('lantern', seed), flicker(seed, seconds, 0.35)), `lantern ${seed}`);
      assert.ok(near(motionCode('stone', seed), breath(seed, seconds, 0.75)), `stone ${seed}`);
    }
    for (const motion of ['fire', 'lantern', 'stone'] as const)
      assert.equal(Math.floor(Math.fround(motionCode(motion, seed))), ['fire', 'lantern', 'stone'].indexOf(motion) + 1);
  }
  const found = /fn light_motion\(code: f32, time: f32\) -> f32 \{([^}]*)\}/.exec(LIGHT_MOTION_WGSL);
  assert.ok(found, 'light_motion');
  const context = {
    sin: Math.sin,
    cos: Math.cos,
    floor: Math.floor,
    fract: (value: number) => value - Math.floor(value),
    select: (otherwise: number, chosen: number, which: boolean) => (which ? chosen : otherwise),
    light_flicker: flicker,
    light_breath: breath,
  };
  const body = (found[1] ?? '').replace(/\blet /g, 'const ');
  for (const code of [1.25, 2.6, 3.01]) {
    const shaded = runInNewContext(`(() => {${body}})()`, { ...context, code, time: 3.3 });
    assert.ok(Math.abs(shaded - lightMotion(code, 3.3)) < 1e-9, `${code}`);
  }
});
