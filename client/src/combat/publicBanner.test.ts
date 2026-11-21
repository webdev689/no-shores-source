import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Node } from '../ui/node.ts';
import { compassNode } from './compassNode.ts';
import { allOf, laidOf, wordsIn } from './nodes.test.ts';
import { type Banner, PublicBanner, StoreBars, TONE_COLOURS } from './publicBanner.ts';

const shown: Banner = {
  tone: 'running',
  kicker: 'Public event',
  title: 'The Fissure',
  place: 'The High Downs',
  clock: '1:00',
  objective: 'Carry shards to the fissure to seal it',
  bar: { share: 0.25, label: '3 / 12 shards' },
  heroic: { text: 'Break the growth', clock: '0:10', met: false },
  bonus: { text: 'Bonus: seal it with half the time left', state: 'lost' },
};

test('the banner shows the event’s words, its heroic window and its bonus, in its tone, and slides in at a beat', () => {
  const banner = new PublicBanner();
  assert.equal(banner.node(1280, 1), null, 'none with no event');
  banner.update(shown, 0.016, 'begun');
  const node = banner.node(1280, 1) as Node;
  const words = wordsIn(node);
  for (const each of [
    'PUBLIC EVENT',
    'The Fissure',
    'The High Downs',
    '1:00',
    '3 / 12 shards',
    'Break the growth',
    '0:10',
  ])
    assert.ok(words.includes(each), each);
  assert.equal(banner.tone, 'running');
  assert.ok(
    allOf(node).some((each) => each.fill === TONE_COLOURS.running),
    'its tone down its edge',
  );
  assert.ok((node.opacity ?? 1) < 1, 'sliding in at its beat');
  banner.update(shown, 1, null);
  assert.equal(banner.node(1280, 1)?.opacity, 1, 'in place once slid');
  assert.equal(banner.node(1280, 1)?.width, 440, 'at most 440 px wide');
  assert.equal(banner.node(400, 1)?.width, 304, 'three quarters of a narrow view');
  banner.update(null, 0.016);
  assert.equal(banner.node(1280, 1), null);
  assert.equal(banner.tone, null);
});

test('between events the banner is one line, with what runs elsewhere under it', () => {
  const banner = new PublicBanner();
  const next: Banner = {
    ...shown,
    tone: 'next',
    kicker: 'Next',
    elsewhere: 'Raid at Gullwing Vale',
    bar: null,
    heroic: null,
    bonus: null,
  };
  banner.update(next, 1);
  const words = wordsIn(banner.node(1280, 1));
  assert.ok(words.includes('Raid at Gullwing Vale'));
  assert.ok(!words.includes('3 / 12 shards'), 'no bar between events');
  assert.ok(laidOf(banner.node(1280, 1) as Node).length > 0, 'it lays out');
});

test('the banner reads out its beats, and never its ticking clocks', () => {
  const said: string[] = [];
  const page = globalThis as unknown as Record<string, unknown>;
  page['document'] = { ariaNotify: (words: string) => said.push(words) };
  const banner = new PublicBanner();
  banner.update(shown, 0.016, 'begun');
  banner.update({ ...shown, clock: '0:59' }, 0.016);
  banner.update({ ...shown, clock: '0:58' }, 0.016, 'heroic');
  delete page['document'];
  assert.deepEqual(said, [
    'Public event: The Fissure. Carry shards to the fissure to seal it',
    'Public event: The Fissure. Break the growth',
  ]);
});

test('a store’s bar stands over it while on the screen, and none off it', () => {
  const bars = new StoreBars();
  bars.update(
    [
      { at: [0, 0, 0], share: 0.5 },
      { at: [9, 0, 0], share: 0 },
    ],
    (point) => (point[0] > 5 ? null : { x: 100, y: 50 }),
    0.016,
  );
  const nodes = bars.nodes(1);
  assert.equal(nodes.length, 1);
  assert.deepEqual([nodes[0]?.float?.x, nodes[0]?.float?.y, nodes[0]?.width], [100, 50, 72]);
});

test("the compass marks a public event's places on its foot, the heroic one blinking", () => {
  const places = (time: number) =>
    allOf(
      compassNode(520, 0, 1, [0, 0], [], {
        marks: [
          { x: 0, y: -100, kind: 'event' },
          { x: 10, y: -100, kind: 'heroic' },
        ],
        time,
      }),
    ).filter((node) => node.picture?.key.startsWith('diamond'));
  assert.equal(places(0).length, 2);
  assert.ok(Math.abs((places(0)[0]?.float?.at?.[0] ?? 0) - 0.5) < 1e-9, 'dead ahead at the middle');
  assert.deepEqual(
    [places(0)[1]?.opacity, places(0.5)[1]?.opacity],
    [1, 0.4],
    'the heroic mark blinks; the ground holds still',
  );
  assert.equal(places(0.5)[0]?.opacity, 1);
});
