import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DESIGN_HEIGHT } from './fpMotion.ts';
import type { FrameSource } from './fpFrames.ts';
import { STROKE_S, STROKES, strokeFrame, TOOL_OF, toolPath, toolPicture, toolPlace } from './working.ts';

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

test("the bare hand in salvage wears the gauntlets' frames where the forge drew them, else its own; a tool its own", async () => {
  const asked: string[] = [];
  const strip = { width: 2, height: 1, data: new Uint8ClampedArray([1, 2, 3, 200, 4, 5, 6, 40]) };
  const source = {
    strip: (path: string) => (asked.push(path), Promise.resolve(path.endsWith('_Iron.png') ? null : strip)),
  } as unknown as FrameSource;
  const hand = await toolPicture(source, 'gather', 1, 'Iron');
  assert.deepEqual(asked, ['@art/tools/gather/Reach-1_Iron.png', '@art/tools/gather/Reach-1.png']);
  assert.deepEqual([...(hand?.pixels ?? [])], [1, 2, 3, 255, 4, 5, 6, 0], 'bare, its edges hard');
  asked.length = 0;
  await toolPicture(source, 'pickaxe', 1, 'Iron');
  assert.deepEqual(asked, ['@art/tools/pickaxe/StrikeDown-1.png'], 'a tool is no hand');
});
