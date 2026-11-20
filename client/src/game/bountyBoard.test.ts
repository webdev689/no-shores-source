import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ASKS, type GearState } from '../network/gearMessages.ts';
import { bountyRows, payWords, weekBountiesOf } from './bountyBoard.ts';

const bounty = (words: string, target: number, count = 0, held = false, paid = false) => ({
  words,
  target,
  count,
  held,
  paid,
});
const gear = {
  prologueDone: true,
  day: 20_778,
  bountyXp: 3_500,
  bountyAurem: 210,
  bounties: [
    bounty('Defeat 30 Grey Tithe foes.', 30),
    bounty('Defeat 2 foes of Miniboss rank or higher.', 2, 1, true),
    bounty('Sink or take 3 ships.', 3, 3, true),
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
      ['held', '1 / 2', null],
      ['done', '3 / 3', 'Turn in'],
      ['paid', 'Turned in', null],
    ],
  );
  assert.deepEqual(rows[0]?.press?.ask, { kind: ASKS.takeBounty, node: 0, item: 20_778 }, 'by the day it was shown');
  assert.deepEqual(rows[2]?.press?.ask, { kind: ASKS.turnInBounty, node: 2, item: 20_778 });
  assert.equal(payWords(gear), 'Each pays 3,500 XP and 210 Aurem when turned in.');
  assert.ok(
    bountyRows({ ...gear, prologueDone: false }).every((row) => row.press === null),
    'shut until the prologue',
  );
  assert.deepEqual(bountyRows({ ...gear, bounties: undefined }), [], 'a room that sends no board');
});

test('This Week shows the same bounties without their presses, or the board shut until the prologue', () => {
  const week = weekBountiesOf(gear, 20_778);
  assert.deepEqual(
    week?.rows.slice(0, 4).map((row) => [row.name, row.state]),
    [
      ['Defeat 30 Grey Tithe foes.', 'Not taken'],
      ['Defeat 2 foes of Miniboss rank or higher.', '1 / 2'],
      ['Sink or take 3 ships.', 'Done. Turn it in at the bounty board.'],
      ['Sink or take a ship of Elite rank or higher.', 'Turned in'],
    ],
  );
  assert.equal(week?.shut, null);
  assert.deepEqual(weekBountiesOf({ ...gear, prologueDone: false }, 20_778), {
    rows: [],
    shut: 'The bounty board opens after the prologue.',
  });
  assert.equal(weekBountiesOf({ ...gear, bounties: undefined }, 20_778), null, 'no board sent yet');
  assert.equal(weekBountiesOf(null, 20_778), null);
  assert.equal(weekBountiesOf({ ...gear, day: 20_777 }, 20_778), null, 'yesterday’s gear read today: not yet known');
});
