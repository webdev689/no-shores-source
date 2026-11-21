import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compassNode } from './compassNode.ts';

test('the compass shows only the points on its strip, as wide as the view lets it, and marks the ships near', () => {
  const node = compassNode(
    1280,
    0.05,
    [0, 0],
    [
      { x: 100, y: -300, kind: 'hostile' },
      { x: 5000, y: 0, kind: 'ship' },
    ],
  );
  assert.equal(node.width, 520);
  assert.equal(compassNode(500, 0).width, 300, 'three fifths of a narrow view');
  const letters = (node.children ?? []).flatMap((child) => (child && child.text ? [child.text.words] : []));
  assert.deepEqual(letters, ['N', 'NE']);
  const marks = (node.children ?? []).filter((child) => child && child.picture?.key.startsWith('compass bow'));
  assert.equal(marks.length, 1, 'the far ship is past the range');
});
