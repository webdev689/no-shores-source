import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { breath, FLAME_FRAMES_PER_SECOND, flameFrame, flicker, LIGHT_MOTION_WGSL } from './flicker.ts';

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
