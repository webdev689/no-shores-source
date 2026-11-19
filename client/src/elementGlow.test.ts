import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GLOW_PAD, GLOW_RAMPS, GLOW_WGSL, type GlowField, glowField, glowRampAt } from './elementGlow.ts';

const whole = (width: number, height: number) => new Uint8Array(width * height).fill(1);
/** A field's texel at (x, y) from the mask's own top left corner: red, green, blue, alpha. */
const texel = (field: GlowField, x: number, y: number) => {
  const start = ((y + GLOW_PAD) * field.width + x + GLOW_PAD) * 4;
  return [...field.data.subarray(start, start + 4)];
};

test('the field is padded by the reach on every side', () => {
  const field = glowField(whole(3, 3), 3, 3, 2);
  assert.equal(field.width, 3 + 2 * GLOW_PAD);
  assert.equal(field.height, 3 + 2 * GLOW_PAD);
  assert.equal(field.data.length, field.width * field.height * 4);
});

test('inside, edge and open texels are told apart', () => {
  const field = glowField(whole(3, 3), 3, 3, 3);
  assert.equal(texel(field, 1, 1)[2], 255);
  assert.equal(texel(field, 0, 0)[2], 128);
  assert.equal(texel(field, -1, 1)[2], 0);
  assert.equal(texel(field, -1, 1)[0], 4, 'a pixel off the edge');
  assert.equal(texel(field, -GLOW_PAD, -GLOW_PAD)[3], 255);
});

test('each look measures in its own metric', () => {
  const one = new Uint8Array([1]);
  assert.equal(texel(glowField(one, 1, 1, 2), 2, 1)[0], 12, 'Volt: three pixels across and down');
  assert.equal(texel(glowField(one, 1, 1, 3), 2, 1)[0], Math.round(Math.sqrt(5) * 4));
  const blaze = glowField(one, 1, 1, 1);
  assert.ok((texel(blaze, 0, -2)[0] ?? 255) < (texel(blaze, 0, 2)[0] ?? 0), 'a flame reaches up farther than down');
});

test('embers know the weapon below', () => {
  const blaze = glowField(new Uint8Array([1]), 1, 1, 1);
  assert.equal(texel(blaze, 0, -3)[1], 255);
  assert.equal(texel(blaze, 1, -3)[1], 0);
  assert.equal(texel(blaze, 0, 2)[1], 0, 'nothing below a weapon rises off it');
});

test('a cut side has no rim', () => {
  assert.equal(texel(glowField(whole(3, 3), 3, 3, 2), 1, 2)[2], 128);
  const cut = glowField(whole(3, 3), 3, 3, 2, { bottom: true });
  assert.equal(texel(cut, 1, 2)[2], 255);
  assert.equal(texel(cut, 0, 2)[2], 128, 'its other sides keep theirs');
});

test('the ramps run dark to hot', () => {
  for (const look of [1, 2, 3] as const) {
    const sums = GLOW_RAMPS[look].map(([red, green, blue]) => red + green + blue);
    for (let stop = 1; stop < sums.length; stop++) assert.ok((sums[stop] ?? 0) > (sums[stop - 1] ?? 0), `${look}`);
    assert.deepEqual(glowRampAt(look, 0), GLOW_RAMPS[look][3]);
    assert.deepEqual(glowRampAt(look, 1), GLOW_RAMPS[look][0]);
  }
});

test('the shader is whole', () => {
  assert.ok(GLOW_WGSL.includes('fn glow_colour(look: u32, field: vec4f, cell: vec2f, time: f32) -> vec4f'));
  assert.ok(!GLOW_WGSL.includes('${'));
  assert.equal(GLOW_WGSL.split('{').length, GLOW_WGSL.split('}').length);
  assert.ok(!/NaN|undefined/.test(GLOW_WGSL));
});
