import assert from 'node:assert/strict';
import { test } from 'node:test';
import { focusOf } from './artStage.ts';

test("the scene's middle stands in the room right of the rows, within its shares of the stage", () => {
  assert.equal(focusOf(100, 400, null), 60, 'before the rows are laid, the least share');
  assert.equal(focusOf(100, 400, 200), 75, 'halfway between the rows and the stage’s right');
  assert.equal(focusOf(100, 400, 400), 86, 'never past the most');
  assert.equal(focusOf(100, 400, 0), 60, 'never short of the least');
});
