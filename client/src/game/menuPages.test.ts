import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { activitiesAt, gatesAt } from './activities.ts';
import { thisWeekOf } from './activityWords.ts';
import { weekBountiesOf } from './bountyBoard.ts';
import { thisWeekPage } from './menuPages.ts';
import { fakePage } from './pageForTests.ts';

const bytes = await readFile(
  new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url),
).catch(() => {
  throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
});
const module = WebAssembly.compile(bytes);

test('the Journal is This Week: the day’s, the week’s, each reset’s time, the Bounties, and Quests Later', async () => {
  const { root } = fakePage();
  const drawn = activitiesAt(await module, 29_919_420);
  const record = { day: 20_778, cleared: [1], week: 2_968, elite: false, abyss: false, boon: false };
  const named = { dungeon: (patrol: string) => patrol, place: (id: string) => id };
  const board = thisWeekOf(drawn, gatesAt(await module, 26, true), record, named);
  root.append(thisWeekPage(board) as never);
  for (const words of [
    'This Week',
    'Today',
    'Resets in 24h 0m',
    'The week',
    'Resets in 4d 0h',
    'Dungeon of the day',
    'Elite seas',
    'Taken',
    'Burn (Shadow)',
    'Elite Dungeon of the week · Level 26',
    'Breaches',
    'Bounties',
    'Six a day, from the board in Overlook’s plaza.',
    'Quests',
    'Your quests will be kept here.',
  ])
    assert.ok(root.find(words), words);
  root.replaceChildren(thisWeekPage(null) as never);
  assert.ok(root.find('Loading…'));
});

test('This Week’s Bounties shows the day’s board as the gear carried it, with no press, or why it is shut', async () => {
  const { root } = fakePage();
  const drawn = activitiesAt(await module, 29_919_420);
  const named = { dungeon: (patrol: string) => patrol, place: (id: string) => id };
  const bounty = (words: string, count: number, held: boolean, paid = false) => ({
    words,
    target: 3,
    count,
    held,
    paid,
  });
  const gear = {
    prologueDone: true,
    day: 20_778,
    bounties: [bounty('Sink or take 3 ships.', 3, true), bounty('Clear 3 dungeons.', 1, true)],
  } as unknown as Parameters<typeof weekBountiesOf>[0];
  root.append(thisWeekPage(thisWeekOf(drawn, null, null, named, weekBountiesOf(gear))) as never);
  for (const words of ['Sink or take 3 ships.', 'Done. Turn it in at the bounty board.', 'Clear 3 dungeons.', '1 / 3'])
    assert.ok(root.find(words), words);
  assert.ok(!root.find('Take') && !root.find('Turn in'), 'taken and turned in at the board alone');
  const shut = weekBountiesOf({ ...gear, prologueDone: false } as typeof gear);
  root.replaceChildren(thisWeekPage(thisWeekOf(drawn, null, null, named, shut)) as never);
  assert.ok(root.find('The bounty board opens after the prologue.'));
});
