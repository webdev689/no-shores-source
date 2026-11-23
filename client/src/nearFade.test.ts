import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FLAMES_WGSL } from './cinema/flamesShader.ts';
import { NEAR_FADE_M, NEAR_FADE_WGSL, nearFade } from './nearFade.ts';
import { PUFF_WGSL } from './ships/puffView.ts';

test('a billboard fades softly to nothing as its near side comes within a couple of metres of the eye', () => {
  assert.equal(nearFade(NEAR_FADE_M[1]), 1, 'whole at its far edge');
  assert.equal(nearFade(10), 1);
  assert.equal(nearFade(NEAR_FADE_M[0]), 0, 'gone at its near edge');
  assert.equal(nearFade(-1), 0, 'gone with the eye inside it');
  let before = 0;
  for (let metres = NEAR_FADE_M[0]; metres <= NEAR_FADE_M[1]; metres += 0.05) {
    const now = nearFade(metres);
    assert.ok(
      now >= before && now - before < 0.06,
      `softly, never a step: ${now.toFixed(3)} at ${metres.toFixed(2)} m`,
    );
    before = now;
  }
});

test("the fires' smoke and the sea's puffs both fade so, in their shaders", () => {
  for (const shader of [FLAMES_WGSL, PUFF_WGSL]) {
    assert.ok(shader.includes(NEAR_FADE_WGSL), 'the fade is in the shader');
    assert.ok(/near_fade\(/.test(shader.replace(NEAR_FADE_WGSL, '')), 'and used');
  }
});
