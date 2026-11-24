import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NATURE_SHADER, SWAY } from './natureShader.ts';

/** The body of the plants' lighting, `lit`, as the shader is built. */
function lighting(): string {
  const start = NATURE_SHADER.indexOf('fn lit(');
  assert.ok(start >= 0, 'the plants are lit by `lit`');
  return NATURE_SHADER.slice(start, NATURE_SHADER.indexOf('\n}\n', start));
}

test("rain darkens a plant's bark and leaves and lays no sky's glare over them, which washed a crown white", () => {
  const lit = lighting();
  assert.ok(lit.includes('sky_soaked('), 'darkened by the rain');
  assert.ok(!lit.includes('sky_sheen('), "no sky's glare on a leaf, whose normal turns every way");
});

test('the plants sway slowly: gusts roll by in ten seconds, a plant rocks in seven and its leaves tremble in two', () => {
  const period = (perS: number) => (2 * Math.PI) / perS;
  assert.ok(period(SWAY.gustPerS) >= 10, `a gust every ${period(SWAY.gustPerS).toFixed(1)} s`);
  assert.ok(period(SWAY.rockPerS) >= 7, `a rock every ${period(SWAY.rockPerS).toFixed(1)} s`);
  assert.ok(period(SWAY.tremblePerS) >= 2, `a tremble every ${period(SWAY.tremblePerS).toFixed(1)} s`);
  for (const perS of [SWAY.rockPerS, SWAY.tremblePerS]) {
    assert.ok(NATURE_SHADER.includes(`frame.wind.x * ${perS.toFixed(2)}`), `the shader beats at ${perS} a second`);
  }
  assert.ok(NATURE_SHADER.includes(`const GUST_PER_S = ${SWAY.gustPerS.toFixed(2)};`), 'and gusts at its rate');
});
