import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DISTRICTS, type District, WINDOW_WGSL, windowGlow, windowShare } from './windowLights.ts';

/** The share of a district's windows glowing at `hour` under `daylight`, over a grid of draws. */
function glowing(district: District, hour: number, daylight = 0): number {
  const steps = 100;
  let sum = 0;
  for (let lit = 0; lit < steps; lit++)
    for (let dark = 0; dark < steps; dark++)
      sum += windowGlow(district, (lit + 0.5) / steps, (dark + 0.5) / steps, hour, daylight);
  return sum / (steps * steps);
}

test('no window glows by day, and they come up through the dusk as the lamps do', () => {
  for (const district of DISTRICTS) assert.equal(glowing(district, 21, 1), 0, district);
  assert.ok(
    glowing('market', 19, 0.4) > 0 && glowing('market', 19, 0.4) < glowing('market', 19, 0),
    'half lit at dusk',
  );
});

test('the markets and the harbour keep the most windows lit, the noble quarter few late, the temples theirs all night', () => {
  const share = (district: District, hour: number) => glowing(district, hour);
  for (const district of ['noble', 'guild', 'residential', 'temple'] as const) {
    assert.ok(share('market', 21) > share(district, 21), `market over ${district} at nine`);
    assert.ok(share('harbour', 21) > share(district, 21), `harbour over ${district} at nine`);
  }
  assert.ok(share('noble', 20) > share('temple', 20), 'the noble quarter lit well at dusk');
  assert.ok(share('noble', 23.75) < 0.1 * share('noble', 20), 'and dark by midnight');
  assert.ok(Math.abs(share('temple', 3) - share('temple', 21)) < 1e-9, 'a temple burns through the night');
  assert.ok(share('harbour', 3) > share('residential', 3), 'the harbour stays up latest');
});

test('windows go dark through the night, each at its own hour, never lighting again before the dawn', () => {
  for (const district of DISTRICTS) {
    let last = Infinity;
    for (let hour = 20; hour <= 29.5; hour += 0.5) {
      const now = glowing(district, hour % 24);
      assert.ok(now <= last + 1e-9, `${district} at ${hour % 24}`);
      last = now;
    }
  }
});

test("a far wall's windows average to the share that glows, as the shader evens them out", () => {
  for (const district of DISTRICTS)
    for (const hour of [20, 22, 0, 2, 4])
      assert.ok(Math.abs(windowShare(district, hour) - glowing(district, hour)) < 0.02, `${district} at ${hour}`);
});

test("the shaders' rule carries each district's numbers in the order the cells number them", () => {
  assert.match(WINDOW_WGSL, /array<vec3f, 6>/);
  assert.ok(WINDOW_WGSL.indexOf('vec3f(0.62, 9.5, 17.0)') < WINDOW_WGSL.indexOf('vec3f(0.5, 8.5, 11.5)'));
});
