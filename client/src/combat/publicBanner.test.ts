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
    'Bonus: seal it with half the time left',
  ])
    assert.ok(words.includes(each), each);
  const bonus = allOf(node).find((each) =>
    each.children?.some((child) => child && child.text?.words === 'Bonus: seal it with half the time left'),
  );
  const struck = bonus?.children?.find((child) => child && !child.text);
  assert.ok(struck && struck.fill && struck.height === 1 && struck.width === 'grow', 'a lost bonus is struck through');
  const held = new PublicBanner();
  held.update({ ...shown, bonus: { text: 'Bonus: seal it with half the time left', state: 'holds' } }, 1);
  const kept = allOf(held.node(1280, 1)).find((each) =>
    each.children?.some((child) => child && child.text?.words === 'Bonus: seal it with half the time left'),
  );
  assert.equal(kept?.children?.filter(Boolean).length, 1, 'a bonus still held is not');
  assert.equal(banner.tone, 'running');
  assert.ok(
    allOf(node).some((each) => each.fill === TONE_COLOURS.running),
    'its tone down its edge',
  );
  assert.ok((node.opacity ?? 1) < 1, 'sliding in at its beat');
  banner.update(shown, 1, null);
  assert.equal((banner.node(1280, 1) as Node).opacity, 1, 'in place once slid');
  assert.equal((banner.node(1280, 1) as Node).width, 440, 'at most 440 px wide');
  assert.equal((banner.node(400, 1) as Node).width, 300, 'three quarters of a narrow view');
  banner.update(null, 0.016);
  assert.equal(banner.node(1280, 1), null);
  assert.equal(banner.tone, null);
});

test('the banner’s rows run its whole width: its clocks at the right, its bar long', () => {
  const banner = new PublicBanner();
  banner.update(shown, 0.016, 'begun');
  const laid = laidOf(banner.node(1280, 1) as Node);
  const band = laid[0]?.box;
  const boxOf = (words: string) => laid.find((each) => each.node.text?.words === words)?.box;
  const [clock, window, label] = [boxOf('1:00'), boxOf('0:10'), boxOf('3 / 12 shards')];
  assert.ok(band && clock && window && label);
  const right = band.x + band.width - 12;
  for (const [name, box] of [
    ['the countdown', clock],
    ['the heroic window', window],
    ['the bar’s label', label],
  ] as const)
    assert.ok(
      Math.abs(box.x + box.width - right) <= 1,
      `${name} ends at the right, at ${box.x + box.width} of ${right}`,
    );
  const bar = laid.find((each) => each.node.draw && each.node.label === '3 / 12 shards')?.box;
  assert.ok(bar && bar.width > band.width / 2, `the bar runs over half the banner, ${bar?.width}`);
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
  const line = banner.node(1280, 1) as Node;
  assert.deepEqual([line.width, line.maxWidth], ['fit', 440], 'as wide as its words, no wider than the banner');
});

test('the banner reads out its beats, and never its ticking clocks', () => {
  const said: string[] = [];
  const page = globalThis as unknown as Record<string, unknown>;
  page['document'] = { ariaNotify: (words: string) => said.push(words) };
  try {
    const banner = new PublicBanner();
    banner.update(shown, 0.016, 'begun');
    banner.update({ ...shown, clock: '0:59' }, 0.016);
    banner.update({ ...shown, clock: '0:58' }, 0.016, 'heroic');
  } finally {
    delete page['document'];
  }
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
      compassNode(520, 0, 1, [0, 0], [], null, {
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

test('a bonus that warns of harm reads in red under a filled red diamond, never struck through as a lost one is', () => {
  const banner = new PublicBanner();
  banner.update({ ...shown, bonus: { text: 'Foul water harms', state: 'warns' } }, 1);
  const node = banner.node(1280, 1) as Node;
  const line = allOf(node).find((each) =>
    each.children?.some((child) => child && child.text?.words === 'Foul water harms'),
  );
  assert.equal(line?.children?.filter(Boolean).length, 1, 'not struck through');
  assert.equal(line?.children?.find((child) => child && child.text)?.text?.colour, '#e0483c', 'in red');
  assert.ok(
    allOf(node).some((each) => each.picture?.key === 'diamond #e0483c #e0483c '),
    'its diamond filled red',
  );
});
