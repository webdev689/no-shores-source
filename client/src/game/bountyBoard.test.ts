import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ASKS, type GearState } from '../network/gearMessages.ts';
import type { Node } from '../ui/node.ts';
import type { Interface, UiEvent } from '../ui/ui.ts';
import { byId, fakeInterface, nodesOf, wordsIn } from '../ui/uiForTests.ts';
import { boardPage, bountyRows, bountyWords, payOf } from './bountyBoard.ts';
import { sizesOf } from './gearNodes.ts';
import type { MenuContext } from './menuPage.ts';

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

/** The board's screen drawn frame by frame for `shown`, an hour before the next board, with every ask it made. */
function boardOf(shown: GearState) {
  const { ui, step } = fakeInterface(1280, 900);
  const asked: unknown[] = [];
  const context = {
    ui,
    gear: shown,
    sizes: sizesOf(1280, 900, 1),
    ask: (ask: unknown) => asked.push(ask),
  } as unknown as MenuContext;
  let built: Node = {};
  const page = () =>
    boardPage(
      context,
      () => FRIDAY_AT + 3_600_000,
      () => FRIDAY_AT,
    );
  const frame = (events: UiEvent[] = []) => step(() => (built = page()), events);
  frame();
  frame();
  return { ui, asked, frame, tree: () => built };
}

/** A click on what `id` names, laid last frame. */
function click(ui: Interface, frame: (events: UiEvent[]) => void, id: string): void {
  const box = ui.boxOf(id);
  assert.ok(box, `${id} is laid`);
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  frame([
    { kind: 'pointer', x, y },
    { kind: 'down', x, y, button: 0 },
    { kind: 'up', x, y, button: 0 },
  ]);
}

test('the board is the day’s six as tiles, a row a kind, with no words on a tile, and a bar to the next board', () => {
  const { ui, tree } = boardOf(sixOnTheBoard);
  assert.ok(wordsIn(tree()).includes('Bounties for XP and Aurem, posted each day.'));
  const top = (id: string) => ui.boxOf(id)?.y ?? -1;
  assert.deepEqual(
    [0, 2, 4].map((place) => top(`bounty-${place}`) === top(`bounty-${place + 1}`)),
    [true, true, true],
    'two a row',
  );
  assert.ok(
    top('bounty-0') < top('bounty-2') && top('bounty-2') < top('bounty-4'),
    'land, then the sea, then dungeons',
  );
  const tiles = [0, 1, 2, 3, 4, 5].map((place) => byId(tree(), `bounty-${place}`));
  assert.ok(
    tiles.every((tile) => wordsIn(tile).length === 0),
    'no words on a tile: a mark and a look',
  );
  assert.deepEqual(
    tiles.map((tile) => nodesOf(tile).filter((node) => node.picture).length),
    [1, 1, 1, 2, 1, 1],
    'its mark, and a drawn tick once turned in',
  );
  assert.deepEqual(
    tiles.map((tile) => nodesOf(tile).some((node) => node.role === 'track')),
    [false, true, true, false, false, false],
    'a gauge of its count while taken and once done',
  );
  assert.ok(wordsIn(tree()).includes('1:00:00'), 'the time to the next board by the rising sun');
  assert.ok(nodesOf(tree()).some((node) => node.label === 'New bounties in 1:00:00'));
});

test('the chosen tile’s card says its name, kind, words, count and pay, and E or a click takes or turns it in', () => {
  const { ui, asked, frame, tree } = boardOf(sixOnTheBoard);
  const card = () => wordsIn(byId(tree(), 'bounty-card'));
  for (const words of ['TITHE COLLECTOR', 'LAND BOUNTY', 'Defeat 30 Grey Tithe foes.', '0/30', '+3,500', '+210'])
    assert.ok(card().includes(words), words);
  assert.equal(byId(tree(), 'board-press')?.label, 'Take: Tithe Collector', 'its press, E on its keycap');
  frame([{ kind: 'pointer', x: (ui.boxOf('bounty-2')?.x ?? 0) + 4, y: (ui.boxOf('bounty-2')?.y ?? 0) + 4 }]);
  frame();
  assert.ok(card().includes('BROADSIDE') && card().includes('SEA BOUNTY'));
  assert.equal(byId(tree(), 'board-press')?.label, 'Turn in: Broadside');
  frame([{ kind: 'leave' }]);
  ui.focusOn('bounty-3');
  frame();
  assert.ok(card().includes('Turned in') && card().includes('1/1'));
  click(ui, frame, 'bounty-0');
  ui.focusOn('bounty-2');
  frame([{ kind: 'key', key: 'e' }]);
  assert.deepEqual(asked, [
    { kind: ASKS.takeBounty, node: 0, item: 20_778 },
    { kind: ASKS.turnInBounty, node: 2, item: 20_778 },
  ]);
  frame([{ kind: 'key', key: 'ArrowDown' }]);
  frame();
  assert.equal(ui.focusedId, 'bounty-4', 'the arrows move between tiles, two a row');
});

test('before the prologue the board’s tiles are grey, its card says why, and nothing is asked', () => {
  const { ui, asked, frame, tree } = boardOf({ ...sixOnTheBoard, prologueDone: false });
  assert.ok(wordsIn(byId(tree(), 'bounty-card')).includes('The bounty board opens after the prologue.'));
  click(ui, frame, 'bounty-0');
  assert.deepEqual(asked, []);
  assert.equal(byId(tree(), 'board-press'), undefined, 'no press');
});
