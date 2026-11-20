import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { activitiesAt, gatesAt } from './activities.ts';
import { thisWeekOf } from './activityWords.ts';
import { thisWeekPage } from './menuPages.ts';
import { fakePage } from './pageForTests.ts';

const bytes = await readFile(
  new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url),
).catch(() => {
  throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
});
const module = WebAssembly.compile(bytes);

test('the Journal is This Week: the day’s, the week’s, each reset’s time, and Bounties and Quests Later', async () => {
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
