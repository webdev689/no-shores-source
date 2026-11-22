import assert from 'node:assert/strict';
import { test } from 'node:test';
import { glyphDrawn } from '../ui/glyphs.ts';
import { layout } from '../ui/layout.ts';
import type { Node } from '../ui/node.ts';
import { justMet, type Quest, sameQuest, TaskTracker, toldChange } from './tasks.ts';

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

test('each change to a task is told aloud, as the page’s status region told it: a new task, a count, a step met', () => {
  const said: string[] = [];
  const page = globalThis as unknown as Record<string, unknown>;
  page['document'] = { ariaNotify: (words: string) => said.push(words) };
  const tracker = new TaskTracker();
  tracker.show(quest, 0);
  tracker.show(
    {
      ...quest,
      steps: [
        { text: 'Move', keys: ['W'], done: true },
        { text: 'Foes', count: 2 },
      ],
    },
    1,
  );
  delete page['document'];
  assert.deepEqual(said, ['The Wreck: Find the captain', 'Move, done', 'Foes 2']);
});

const carry = (count: number, done = false): Quest => ({
  name: 'The Fissure',
  task: 'The High Downs',
  steps: [{ text: 'Carry shards to the fissure', count, done, keys: ['E'] }],
});

test('two quests read alike only when every word, count, key and tick is the same', () => {
  assert.ok(sameQuest(carry(3), carry(3)), 'alike, though not the same object');
  assert.ok(sameQuest(null, null));
  assert.ok(!sameQuest(carry(3), null));
  assert.ok(!sameQuest(carry(3), carry(2)), 'a count changed');
  assert.ok(!sameQuest(carry(3), carry(3, true)), 'a step met');
  assert.ok(!sameQuest(carry(3), { ...carry(3), steps: [] }), 'a step gone');
  assert.ok(
    !sameQuest(carry(3), { ...carry(3), steps: [{ text: 'Carry shards to the fissure', count: 3 }] }),
    'a key gone',
  );
});

test('a chest’s ticking clock is drawn afresh each second, and said only at the seconds a clock is told', () => {
  const said: string[] = [];
  const page = globalThis as unknown as Record<string, unknown>;
  const chest = (clock: number): Quest => ({
    name: 'The Fissure',
    task: 'The High Downs',
    steps: [{ text: 'Open your chest', clock }],
  });
  try {
    page['document'] = { ariaNotify: (words: string) => said.push(words) };
    const tracker = new TaskTracker();
    tracker.show(chest(109), 0);
    tracker.show(chest(108), 1);
    tracker.show(chest(107), 2);
    assert.deepEqual(said, ['The Fissure: The High Downs']);
    assert.ok(!sameQuest(chest(109), chest(108)), 'redrawn as it ticks');
    const words = JSON.stringify(tracker.node({ width: 1280, height: 720 }, 3, true));
    assert.ok(words.includes('Open your chest') && words.includes('1:47'), words);
  } finally {
    delete page['document'];
  }
});

test('a clock is told as it starts, each 30 s, and each of its last 10 s; a ward’s health at each quarter', () => {
  const said: string[] = [];
  const page = globalThis as unknown as Record<string, unknown>;
  page['document'] = { ariaNotify: (words: string) => said.push(words) };
  const tracker = new TaskTracker();
  const race = (clock: number | undefined): Quest => ({
    name: 'The Stolen Storm',
    task: 'Catch the riders',
    steps: [{ text: 'Run the road', ...(clock === undefined ? {} : { clock }) }],
  });
  tracker.show(race(undefined), 0);
  // Ten frames a second down from 2:30 to nothing.
  for (let tenths = 1500; tenths >= 0; tenths -= 1) tracker.show(race(tenths / 10), 0);
  delete page['document'];
  assert.deepEqual(said, [
    'The Stolen Storm: Catch the riders',
    'Run the road 2:30',
    'Run the road 2:00',
    'Run the road 1:30',
    'Run the road 1:00',
    'Run the road 0:30',
    ...[10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map((seconds) => `Run the road 0:${String(seconds).padStart(2, '0')}`),
  ]);
  const ward = (share: number): Quest => ({ name: 'Road', task: 'Hold', steps: [{ text: 'The glass', share }] });
  const told: string[] = [];
  page['document'] = { ariaNotify: (words: string) => told.push(words) };
  const holding = new TaskTracker();
  for (const share of [1, 0.98, 0.9, 0.74, 0.7, 0.5, 0.49]) holding.show(ward(share), 0);
  delete page['document'];
  assert.deepEqual(told, ['Road: Hold', 'The glass 74%', 'The glass 50%']);
  assert.equal(toldChange({ text: 'A', count: '1/4' }, { text: 'A', count: '2/4' }), true, 'a count is told');
});

test('a step shows its clock as m:ss and its share as a percentage where a count stands', () => {
  const tracker = new TaskTracker();
  tracker.show(
    {
      name: 'Road',
      task: 'Run',
      steps: [
        { text: 'Run', clock: 84.2 },
        { text: 'Hold', share: 0.641 },
      ],
    },
    0,
  );
  const words = lay(tracker.node({ width: 1280, height: 720 }, 0, true)).flatMap((laid) =>
    laid.node.text ? [String(laid.node.text.words)] : [],
  );
  assert.ok(words.includes('1:25') && words.includes('64%'), words.join(' | '));
});
