import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shaderCalls } from './shaderCalls.mjs';

test("a call's code is read wherever its key stands, its pick kept, across lines", () => {
  const text = [
    'device.createShaderModule({ code: SKY });',
    "device.createShaderModule({ label: 'sea, at night', code: SEA[kind] });",
    'device.createShaderModule({',
    "  label: 'ground',",
    '  code: GROUND,',
    '});',
  ].join('\n');
  assert.deepEqual(shaderCalls(text), [
    { line: 1, name: 'SKY', code: 'SKY' },
    { line: 2, name: 'SEA', code: 'SEA[kind]' },
    { line: 3, name: 'GROUND', code: 'GROUND' },
  ]);
});

test('a call whose code this cannot read is a problem, never passed over', () => {
  const text = [
    'device.createShaderModule(descriptor);',
    'device.createShaderModule({ code: `${HEAD}${BODY}` });',
    "device.createShaderModule({ label: 'none' });",
    'device.createShaderModule({ code: made() });',
  ].join('\n');
  assert.deepEqual(
    shaderCalls(text).map((call) => [call.line, 'problem' in call]),
    [
      [1, true],
      [2, true],
      [3, true],
      [4, true],
    ],
  );
});

test('a stand-in that only names the method is no call', () => {
  assert.deepEqual(shaderCalls('const device = { createShaderModule: () => ({}) };'), []);
});
