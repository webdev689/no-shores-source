import assert from 'node:assert/strict';
import { test } from 'node:test';
import { touchesHeld } from './page.ts';

test('a surface held keeps every touch from the page, and takes them back once let go', () => {
  const surface = { style: { touchAction: '' } };
  touchesHeld(surface, true);
  assert.equal(surface.style.touchAction, 'none');
  touchesHeld(surface, false);
  assert.equal(surface.style.touchAction, '');
});
