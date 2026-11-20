import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { activitiesAt, gatesAt } from './activities.ts';
import { thisWeekOf } from './activityWords.ts';
import { timersPanel } from './journalTimers.ts';
import { type FakeElement, fakePage } from './pageForTests.ts';

const bytes = await readFile(
  new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url),
).catch(() => {
  throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
});
const module = WebAssembly.compile(bytes);
const FRIDAY_NINE = 29_919_420;
const FRIDAY_AT = FRIDAY_NINE * 60_000;
const named = { dungeon: (patrol: string, number: number) => `${patrol} ${number}`, place: (id: string) => id };
const keyed = (root: FakeElement, key: string) => root.all().find((node) => node.dataset['key'] === key);

test('the timers stand under Today, This week and Later: each reset counts down, and a row under way says Now', async () => {
  const { root } = fakePage();
  const record = { day: 20_778, cleared: [1], week: 2_968, elite: false, abyss: false, boon: true };
  const week = thisWeekOf(activitiesAt(await module, FRIDAY_NINE), gatesAt(await module, 26, true), record, named);
  const panel = timersPanel(() => undefined);
  root.append(panel.node as never);
  panel.show(week, FRIDAY_AT + 1_000);
  for (const words of [
    'Timers',
    'Times are shown in your local time.',
    'Today',
    'Daily reset',
    'Dungeon of the day',
    'Burn (Shadow)',
    'Elite seas',
    'Taken',
    'Bounties',
    'This week',
    'Weekly reset',
    'Elite Dungeon of the week · Level 26',
    'Abyss boon: 25% more XP until the week turns.',
    'Later',
    'Breaches',
  ])
    assert.ok(root.find(words), words);
  assert.deepEqual(
    ['timer-day-reset', 'timer-day', 'timer-week-reset'].map((key) => keyed(root, key)?.textContent),
    ['23:59:59', '23:59:59', '3d 23h'],
  );
  assert.equal(
    root.all().filter((node) => node.textContent === 'Now').length,
    5,
    'the day’s dungeon, the bounties, the week’s two and the boon',
  );
  assert.equal(root.find('This Week'), undefined, 'no title but the panel’s own');
});

test('as the reset passes with the timers open the count stops at nothing, then the new day’s rows count anew', async () => {
  const { root } = fakePage();
  const panel = timersPanel(() => undefined);
  root.append(panel.node as never);
  const before = thisWeekOf(activitiesAt(await module, FRIDAY_NINE - 1), null, null, named);
  panel.show(before, FRIDAY_AT - 2_000);
  assert.equal(keyed(root, 'timer-day-reset')?.textContent, '0:02');
  const counted = keyed(root, 'timer-day-reset');
  panel.show(before, FRIDAY_AT + 500);
  assert.equal(keyed(root, 'timer-day-reset'), counted, 'the same word keeps its rows, rewriting only the count');
  assert.equal(counted?.textContent, '0:00', 'never below nothing while the new day is drawn');
  const after = thisWeekOf(activitiesAt(await module, FRIDAY_NINE), null, null, named);
  panel.show(after, FRIDAY_AT + 1_000);
  assert.equal(keyed(root, 'timer-day-reset')?.textContent, '23:59:59');
  assert.ok(
    after.today.dungeons.every((row) => root.find(row.name)),
    'the new day’s dungeons',
  );
});
