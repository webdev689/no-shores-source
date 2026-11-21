import assert from 'node:assert/strict';
import { test } from 'node:test';
import { glyphDrawn } from '../ui/glyphs.ts';
import { layout } from '../ui/layout.ts';
import type { Node } from '../ui/node.ts';
import { justMet, type Quest, TaskTracker } from './tasks.ts';

const face = { glyph: () => glyphDrawn({ rows: ['#'], advance: 600 }) };
const quest: Quest = {
  name: 'The Wreck',
  task: 'Find the captain',
  steps: [
    { text: 'Move', keys: ['W'] },
    { text: 'Foes', count: 3 },
  ],
};
const lay = (node: Node | null, width = 1280, height = 720) =>
  node
    ? layout({ width: 'grow', height: 'grow', children: [node] }, { x: 0, y: 0, width, height }, { face }).slice(1)
    : [];

test('none shows no tracker; a quest stands at the right under the place’s name, wider at the larger step', () => {
  const tracker = new TaskTracker();
  assert.equal(tracker.node({ width: 1280, height: 720 }, 0, true), null);
  tracker.show(quest, 0);
  const box = lay(tracker.node({ width: 1280, height: 720 }, 10, true))[0]?.box;
  assert.deepEqual([box?.x, box?.y, box?.width], [1280 - 28 - 264, 173, 264]);
  const wide = lay(tracker.node({ width: 1600, height: 900 }, 10, true), 1600, 900)[0]?.box;
  assert.equal(wide?.width, 396);
  const narrow = lay(tracker.node({ width: 800, height: 600 }, 10, true), 800, 600)[0]?.box;
  assert.equal(narrow?.y, 220, 'under the compass where the view is narrow');
});

test('a new task slides in from the right, fading in; a step just met flashes and settles', () => {
  const tracker = new TaskTracker();
  tracker.show(quest, 0);
  const shownAt = (now: number) => tracker.node({ width: 1280, height: 720 }, now, false);
  assert.equal(shownAt(0)?.opacity, 0);
  assert.deepEqual(shownAt(0)?.offset, [14, 0]);
  assert.equal(shownAt(1)?.opacity, 1);
  tracker.show(
    {
      ...quest,
      steps: [
        { text: 'Move', done: true },
        { text: 'Foes', count: 3 },
      ],
    },
    2,
  );
  const lit = (now: number) => {
    const steps = shownAt(now)?.children?.[2];
    return steps ? (steps.children?.[0] as Node | undefined)?.fill : undefined;
  };
  assert.ok(lit(2.1)?.startsWith('rgba(243,207,134'));
  assert.equal(lit(3), undefined);
  assert.deepEqual(justMet(quest, { ...quest, steps: [{ text: 'Move', done: true }] }), [0]);
});
