import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ASKS, type GearState } from '../network/gearMessages.ts';
import { boardPage, bountyRows, bountyWords, payOf } from './bountyBoard.ts';
import type { PageContext } from './characterPage.ts';
import { type FakeElement, FakeEvent, fakePage } from './pageForTests.ts';

const bounty = (words: string, target: number, count = 0, held = false, paid = false, pool = 0) => ({
  words,
  target,
  count,
  held,
  paid,
  pool,
  name: `Sample ${words.length}`,
});
const gear = {
  prologueDone: true,
  day: 20_778,
  bountyXp: 3_500,
  bountyAurem: 210,
  bounties: [
    bounty('Defeat 30 Grey Tithe foes.', 30),
    bounty('Defeat 2 foes of Miniboss rank or higher.', 2, 1, true),
    bounty('Sink or take 3 ships.', 3, 3, true, false, 1),
    bounty('Sink or take a ship of Elite rank or higher.', 1, 1, true, true),
    bounty('Clear 2 dungeons.', 2),
    bounty('Clear 3 dungeons.', 3),
  ],
} as unknown as GearState;

test('each of the day’s bounties is taken, counted, turned in once done, and then says so', () => {
  const rows = bountyRows(gear);
  assert.deepEqual(
    rows.slice(0, 4).map((row) => [row.state, row.progress, row.press?.label ?? null]),
    [
      ['open', '', 'Take'],
      ['held', '1/2', null],
      ['done', '3/3', 'Turn in'],
      ['paid', 'Turned in', null],
    ],
  );
  assert.deepEqual(rows[0]?.press?.ask, { kind: ASKS.takeBounty, node: 0, item: 20_778 }, 'by the day it was shown');
  assert.deepEqual(rows[2]?.press?.ask, { kind: ASKS.turnInBounty, node: 2, item: 20_778 });
  assert.deepEqual(payOf(gear), { xp: 3_500, aurem: 210 });
  assert.ok(
    bountyRows({ ...gear, prologueDone: false }).every((row) => row.press === null),
    'shut until the prologue',
  );
  assert.deepEqual(bountyRows({ ...gear, bounties: undefined }), [], 'a room that sends no board');
  assert.deepEqual([rows[2]?.pool, rows[2]?.name], [1, 'Sample 21'], 'where it counts, and its name');
});

test('a bounty’s state reads as its count while held, then done, turned in, or not taken', () => {
  assert.deepEqual(bountyRows(gear).slice(0, 4).map(bountyWords), [
    'Not taken',
    '1/2',
    'Done. Turn it in at the board.',
    'Turned in',
  ]);
});

const FRIDAY_AT = 29_919_420 * 60_000;
const classed = (root: FakeElement, name: string) => root.all().filter((node) => node.classList.contains(name));
const keyed = (root: FakeElement, key: string) => root.all().find((node) => node.dataset['key'] === key);
const labelled = (root: FakeElement, label: string) =>
  root.all().find((node) => node.getAttribute('aria-label') === label);
const sixOnTheBoard = {
  ...gear,
  bounties: [
    { ...bounty('Defeat 30 Grey Tithe foes.', 30), name: 'Tithe Collector' },
    { ...bounty('Defeat 2 foes of Miniboss rank or higher.', 2, 1, true), name: 'Big Game' },
    { ...bounty('Sink or take 3 ships.', 3, 3, true, false, 1), name: 'Broadside' },
    { ...bounty('Sink or take a ship of Elite rank or higher.', 1, 1, true, true, 1), name: 'Bigger Fish' },
    { ...bounty('Clear a dungeon.', 1, 0, false, false, 2), name: 'Into the Dark' },
    { ...bounty('Clear 3 dungeons.', 3, 0, false, false, 2), name: 'Deep Delver' },
  ],
} as unknown as GearState;

function boardOf(shown: GearState) {
  const { root } = fakePage();
  const asked: unknown[] = [];
  const context = { gear: shown, ask: (ask: unknown) => asked.push(ask) } as unknown as PageContext;
  root.append(
    boardPage(
      context,
      () => FRIDAY_AT + 3_600_000,
      () => FRIDAY_AT,
    ) as never,
  );
  // The bar counts down while its page stands; taken off, it stops.
  return { root, asked, done: () => root.remove() };
}

test('the board is the day’s six as tiles, a row a kind, with no words on a tile, and a bar to the next board', () => {
  const { root, done } = boardOf(sixOnTheBoard);
  assert.ok(root.find('Bounties for XP and Aurem, posted each day.'));
  const rows = classed(root, 'gear-board-row');
  assert.deepEqual(
    rows.map((row) => classed(row, 'bounty-tile').map((tile) => tile.dataset['key'])),
    [
      ['bounty-0', 'bounty-1'],
      ['bounty-2', 'bounty-3'],
      ['bounty-4', 'bounty-5'],
    ],
  );
  const tiles = classed(root, 'bounty-tile');
  assert.ok(
    tiles.every((tile) => tile.textContent === ''),
    'no words on a tile: a mark and a look',
  );
  assert.deepEqual(
    tiles.map((tile) => tile.all().filter((node) => node.tagName === 'IMG').length),
    [1, 1, 1, 2, 1, 1],
    'its mark, and a drawn tick once turned in',
  );
  assert.deepEqual(
    tiles.map((tile) =>
      ['open', 'held', 'done', 'paid'].find((state) => tile.classList.contains(`bounty-tile-${state}`)),
    ),
    ['open', 'held', 'done', 'paid', 'open', 'open'],
  );
  assert.ok(root.find('1:00:00'), 'the time to the next board by the rising sun');
  assert.ok(root.all().some((node) => node.getAttribute('aria-label') === 'New bounties in 1:00:00'));
  done();
});

test('the chosen tile’s card says its name, kind, words, count and pay, and E or a click takes or turns it in', () => {
  const { root, asked, done } = boardOf(sixOnTheBoard);
  const card = () => keyed(root, 'bounty-card');
  for (const words of ['Tithe Collector', 'Land bounty', 'Defeat 30 Grey Tithe foes.', '0/30', '+3,500', '+210'])
    assert.ok(card()?.find(words), words);
  assert.ok(
    card()
      ?.all()
      .some((node) => node.tagName === 'IMG' && node['alt' as never] === 'Aurem'),
    'its Aurem by the Aurem glyph',
  );
  assert.ok(labelled(root, 'Take: Tithe Collector'), 'its press, E on its keycap');
  keyed(root, 'bounty-2')?.dispatchEvent(new FakeEvent('pointerenter'));
  assert.ok(card()?.find('Broadside') && card()?.find('Sea bounty') && labelled(root, 'Turn in: Broadside'));
  keyed(root, 'bounty-3')?.dispatchEvent(new FakeEvent('focus'));
  assert.ok(card()?.find('Turned in') && card()?.find('1/1'));
  keyed(root, 'bounty-0')?.click();
  const grid = classed(root, 'gear-board-grid')[0];
  keyed(root, 'bounty-2')?.focus();
  grid?.dispatchEvent(new FakeEvent('keydown', { key: 'e' }));
  assert.deepEqual(asked, [
    { kind: ASKS.takeBounty, node: 0, item: 20_778 },
    { kind: ASKS.turnInBounty, node: 2, item: 20_778 },
  ]);
  grid?.dispatchEvent(new FakeEvent('keydown', { key: 'ArrowDown' }));
  assert.equal(document.activeElement, keyed(root, 'bounty-4'), 'the arrows move between tiles, two a row');
  keyed(root, 'bounty-5')?.dispatchEvent(new FakeEvent('pointerenter'));
  assert.equal(document.activeElement, keyed(root, 'bounty-5'), 'the tile pointed at takes the focus: E presses it');
  grid?.dispatchEvent(Object.assign(new FakeEvent('keydown', { key: 'e' }), { ctrlKey: true }));
  keyed(root, 'bounty-0')?.dispatchEvent(new FakeEvent('click', { detail: 2 }));
  assert.equal(asked.length, 2, 'Ctrl and E are the browser’s, and a double click’s second click asks nothing more');
  done();
});

test('before the prologue the board’s tiles are grey, its card says why, and nothing is asked', () => {
  const { root, asked, done } = boardOf({ ...sixOnTheBoard, prologueDone: false });
  assert.ok(classed(root, 'gear-board-shut').length === 1);
  assert.ok(root.find('The bounty board opens after the prologue.'));
  keyed(root, 'bounty-0')?.click();
  assert.deepEqual(asked, []);
  done();
});
