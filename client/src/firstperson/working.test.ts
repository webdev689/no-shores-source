import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DESIGN_HEIGHT } from './fpMotion.ts';
import { STROKE_S, STROKES, strokeFrame, TOOL_OF, toolPath, toolPlace } from './working.ts';

test('each kind of node is worked with its own tool, from the frames the forge published', () => {
  assert.deepEqual(
    ['ore', 'timber', 'herbs', 'salvage'].map((kind) => TOOL_OF[kind]),
    ['pickaxe', 'woodaxe', 'sickle', 'gather'],
  );
  assert.equal(toolPath('pickaxe', 2), '@art/tools/pickaxe/StrikeDown-2.png');
});

test('a stroke runs from its first frame to its last, again and again', () => {
  assert.equal(strokeFrame('woodaxe', 0), 0);
  assert.equal(strokeFrame('woodaxe', STROKE_S * 0.99), STROKES.woodaxe.frames - 1);
  assert.equal(strokeFrame('woodaxe', STROKE_S * 1.01), 0, 'the next stroke');
});

test('the tool comes up from below the screen to where the forge laid it', () => {
  const [x, y] = STROKES.sickle.rect;
  assert.deepEqual([toolPlace('sickle', 1).x, toolPlace('sickle', 1).y], [x, y]);
  assert.equal(toolPlace('sickle', 0).y, DESIGN_HEIGHT, 'all of it below the screen');
});
