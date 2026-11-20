import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { activitiesAt, gatesAt } from './activities.ts';
import { entranceCardOf, levelWords, type Named, resetWords, thisWeekOf } from './activityWords.ts';
import type { Difficulty } from '../heldmap/heldMap.ts';
import type { NodeInfo } from './worldData.ts';

const bytes = await readFile(
  new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url),
).catch(() => {
  throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
});
const module = WebAssembly.compile(bytes);

const FRIDAY_NINE = 29_919_420;
const named: Named = { dungeon: (patrol, number) => `${patrol} ${number}`, place: (id) => id };
const record = { day: 20_778, cleared: [1], week: 2_968, elite: true, abyss: false, boon: true };
const burn = { name: 'Burn (Shadow)', words: 'Shadow spells deal double damage. Wearing Shadow, you take double.' };
const revives = '5 revives for the company. A wipe starts the run over.';

test('a reset’s time reads in minutes, then hours and minutes, then days and hours from two days', () => {
  assert.deepEqual([1, 59, 60, 1_440, 2_879, 2_880, 5_760, 10_080].map(resetWords), [
    'Resets in 1m',
    'Resets in 59m',
    'Resets in 1h 0m',
    'Resets in 24h 0m',
    'Resets in 47h 59m',
    'Resets in 2d 0h',
    'Resets in 4d 0h',
    'Resets in 7d 0h',
  ]);
  assert.deepEqual([levelWords([3, 6]), levelWords([26, 26])], ['Levels 3 to 6', 'Level 26']);
});

test('This Week says what is on, what each pays, and what this character has taken or may not enter', async () => {
  const drawn = activitiesAt(await module, FRIDAY_NINE);
  const board = thisWeekOf(drawn, gatesAt(await module, 26, true), record, named);
  assert.deepEqual([board.today.resets, board.week.resets], ['Resets in 24h 0m', 'Resets in 4d 0h']);
  assert.equal(board.today.pays, 'Once a day at each tier, on any island: a Vestige and a richer cache.');
  assert.deepEqual(board.today.modifier, burn);
  assert.deepEqual(
    board.today.tiers.map((row) => [row.name, row.state]),
    [
      ['Normal seas', 'Not taken'],
      ['Elite seas', 'Taken'],
      ['Abyss seas', 'Not taken'],
    ],
  );
  assert.deepEqual(board.today.dungeons[0], {
    name: 'gullwing-vale 0',
    about: 'Levels 1 to 4',
    state: null,
    shut: false,
  });
  assert.deepEqual([board.today.dungeons.length, board.today.dungeons[8]?.about], [9, 'Levels 26 to 30']);
  const [elite, abyss] = board.week.dungeons;
  assert.deepEqual(
    [elite?.name, elite?.about, elite?.state, elite?.modifiers.map((one) => one.name), elite?.pays],
    [
      'forsaken-cistern',
      'Elite Dungeon of the week · Level 26',
      'Taken',
      ['Brawler'],
      'Once a week: a Legendary Vestige and Essence.',
    ],
  );
  assert.deepEqual(
    [abyss?.about, abyss?.state, abyss?.shut, abyss?.rules, abyss?.modifiers.map((one) => one.name)],
    [
      'Abyss Dungeon of the week · Level 30',
      'This dungeon opens at level 28.',
      true,
      [revives],
      ['Lightswitch', 'Burn (Divine)', 'Juggler'],
    ],
  );
  assert.equal(abyss?.pays, 'Once a week: a Legendary or Atheric Vestige, Essence, and the Abyss boon.');
  assert.equal(board.week.boon, 'Abyss boon: 25% more XP until the week turns.');
});

test('an earlier day’s or week’s record is not taken now, and a character not yet heard from shows none', async () => {
  const drawn = activitiesAt(await module, FRIDAY_NINE);
  const stale = thisWeekOf(drawn, gatesAt(await module, 26, true), { ...record, day: 20_777, week: 2_967 }, named);
  assert.deepEqual(
    stale.today.tiers.map((row) => row.state),
    ['Not taken', 'Not taken', 'Not taken'],
  );
  assert.deepEqual([stale.week.dungeons[0]?.state, stale.week.boon], ['Not taken', null]);
  const before = thisWeekOf(drawn, gatesAt(await module, 9, false), null, named);
  assert.deepEqual(
    before.today.tiers.map((row) => row.state),
    Array(3).fill('This place opens after the prologue.'),
  );
  assert.deepEqual(
    thisWeekOf(drawn, null, null, named).today.tiers.map((row) => row.state),
    [null, null, null],
  );
});

test('an entrance’s card says its run’s tier, level, modifiers and pay, and what Find a Company matches', async () => {
  const drawn = activitiesAt(await module, FRIDAY_NINE);
  const gates = gatesAt(await module, 24, true);
  const entranceAt = (id: string, kind: 'patrol' | 'dungeon', continent: string, seas: Difficulty, number = 0) => ({
    node: { id, kind, continent, name: id } as NodeInfo,
    seas,
    number,
    name: `the way into ${id}`,
  });
  const today = { ...record, elite: false, boon: false };
  const vale = entranceAt('gullwing-vale', 'patrol', 'continent-1', 'elite');
  assert.deepEqual(entranceCardOf(vale, drawn, gates, today), {
    name: 'the way into gullwing-vale',
    tier: 'Elite seas · Levels 3 to 6',
    rules: [],
    modifiers: [burn],
    pays: 'Taken today. It pays its kills and its cache.',
    shut: null,
    finds: null,
  });
  assert.equal(
    entranceCardOf(vale, drawn, gates, { ...today, day: 20_777 }).pays,
    'Once a day at each tier, on any island: a Vestige and a richer cache.',
    'yesterday’s clear is not today’s',
  );
  const halls = entranceCardOf(entranceAt('gullwing-vale', 'patrol', 'continent-1', 'abyss', 1), drawn, gates, today);
  assert.deepEqual(
    [halls.tier, halls.rules, halls.modifiers, halls.pays],
    ['Abyss seas · Levels 4 to 7', [revives], [], 'It pays its kills and its cache.'],
  );
  const grotto = entranceCardOf(entranceAt('krakens-grotto', 'dungeon', 'continent-1', 'normal'), drawn, gates, today);
  assert.deepEqual(
    [grotto.tier, grotto.pays, grotto.finds],
    ['Elite Dungeon · Levels 1 to 4', 'It pays its kills and its cache.', 'node-krakens-grotto'],
  );
  const cisternAt = entranceAt('forsaken-cistern', 'dungeon', 'continent-4', 'elite');
  const cistern = entranceCardOf(cisternAt, drawn, gates, today);
  assert.deepEqual(
    [cistern.tier, cistern.modifiers.map((one) => one.name), cistern.pays, cistern.finds],
    [
      'Elite Dungeon of the week · Level 26',
      ['Brawler'],
      'Once a week: a Legendary Vestige and Essence.',
      'node-forsaken-cistern--elite',
    ],
  );
  assert.equal(
    entranceCardOf(cisternAt, drawn, gates, record).pays,
    'Taken this week. It pays its kills and its cache.',
  );
  const early = entranceCardOf(cisternAt, drawn, gatesAt(await module, 23, true), today);
  assert.deepEqual([early.shut, early.finds], ['This dungeon opens at level 24.', null]);
  const warrens = entranceCardOf(
    entranceAt('saltworm-warrens', 'dungeon', 'continent-7', 'abyss'),
    drawn,
    gates,
    today,
  );
  assert.deepEqual(
    [warrens.tier, warrens.rules, warrens.shut, warrens.finds],
    [
      'Abyss Dungeon of the week · Level 30',
      [revives, 'Never matched. Bring your company.'],
      'This dungeon opens at level 28.',
      null,
    ],
  );
  assert.equal(
    entranceCardOf(entranceAt('forsaken-cistern', 'dungeon', 'continent-4', 'abyss'), drawn, gates, today).tier,
    'Elite Dungeon · Levels 10 to 13',
    'the Elite’s, reached at Abyss seas: its Normal run',
  );
});
