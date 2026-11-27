import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { activitiesAt, gatesAt } from './activities.ts';
import { entranceCardOf, levelWords, type Named, regionCardOf, thisWeekOf } from './activityWords.ts';
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
const burn = {
  key: 'burn-shadow',
  name: 'Burn (Shadow)',
  words: 'Shadow spells deal double damage. Wearing Shadow, you take double.',
};
const revives = '5 revives for the company. A wipe starts the run over.';

test('an island’s band reads as its levels, or one level where it is fixed', () => {
  assert.deepEqual([levelWords([3, 6]), levelWords([26, 26])], ['Levels 3 to 6', 'Level 26']);
});

test('This Week says what is on, what each pays, and what this character has taken or may not enter', async () => {
  const drawn = activitiesAt(await module, FRIDAY_NINE);
  const board = thisWeekOf(drawn, gatesAt(await module, 26, true), record, named);
  const ends = [(FRIDAY_NINE + 1_440) * 60_000, (FRIDAY_NINE + 5_760) * 60_000];
  assert.deepEqual([board.today.day, board.today.endsAt, board.week.endsAt], [20_778, ...ends], 'when each resets');
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
    standing: null,
    band: [1, 4],
    yours: false,
  });
  const at12 = thisWeekOf(drawn, null, record, named, 12).today.dungeons.filter((row) => row.yours);
  assert.deepEqual(
    at12.map((row) => row.about),
    ['Levels 10 to 13'],
    'the island whose band a level 12 stands in',
  );
  assert.deepEqual(
    board.today.tiers.map((row) => row.standing),
    ['open', 'taken', 'open'],
    'each tier’s mark as its state says it',
  );
  assert.deepEqual(board.today.rewards, ['vestige', 'cache']);
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
  assert.deepEqual(
    [elite?.kind, elite?.level, elite?.revives, elite?.standing, elite?.rewards],
    ['elite', 26, null, 'taken', ['legendary-vestige', 'essence']],
  );
  assert.deepEqual(
    [abyss?.kind, abyss?.level, abyss?.revives, abyss?.standing, abyss?.rewards],
    ['abyss', 30, 5, 'shut', ['atheric-vestige', 'essence', 'boon']],
  );
  assert.deepEqual(
    abyss?.modifiers.map((one) => one.key),
    ['lightswitch', 'burn-divine', 'juggler'],
    'each by the key its icon is drawn by',
  );
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
  // At level 12 Elite is the hardest tier open, so a patrol's dungeon on Elite seas is met at Elite.
  const twelve = gatesAt(await module, 12, true);
  assert.deepEqual(entranceCardOf(vale, drawn, twelve, today), {
    name: 'the way into gullwing-vale',
    tier: 'Elite seas · Levels 3 to 6',
    rules: [],
    modifiers: [burn],
    pays: 'Taken today. It pays its kills and its cache.',
    shut: null,
    finds: null,
    seas: 'elite',
  });
  // Every tier open, it is drawn among them, never under the patrol's seas.
  const tiers = new Set<string | undefined>();
  for (let day = 0; day < 12; day++) {
    const later = { ...drawn, minute: drawn.minute + day * 1440 };
    for (const number of [0, 1, 2]) {
      const metAt = entranceCardOf({ ...vale, seas: 'normal', number }, later, gates, today).seas;
      tiers.add(metAt);
      assert.notEqual(entranceCardOf({ ...vale, number }, later, gates, today).seas, 'normal');
    }
  }
  assert.deepEqual([...tiers].sort(), ['abyss', 'elite', 'normal']);
  const sameDay = entranceCardOf({ ...vale, seas: 'normal' }, drawn, gates, today).seas;
  assert.equal(entranceCardOf({ ...vale, seas: 'normal' }, drawn, gates, today).seas, sameDay, 'kept all day');
  assert.equal(
    entranceCardOf(vale, drawn, twelve, { ...today, day: 20_777 }).pays,
    'Once a day at each tier, on any island: a Vestige and a richer cache.',
    'yesterday’s clear is not today’s',
  );
  const halls = entranceCardOf(entranceAt('gullwing-vale', 'patrol', 'continent-1', 'abyss', 1), drawn, gates, today);
  assert.equal(halls.seas, 'abyss', 'on Abyss seas, Abyss');
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

test("a region's dungeon's card says its tier in its island's band, that it is today's, and at Abyss its revives", async () => {
  const drawn = activitiesAt(await module, FRIDAY_NINE);
  const band = drawn.bands['continent-1']?.[1];
  assert.ok(band);
  const elite = regionCardOf({ name: 'The Weeping Ossuary', island: 'continent-1', tier: 1 }, drawn);
  assert.deepEqual(elite, {
    name: 'The Weeping Ossuary',
    tier: `Elite seas · ${levelWords(band)}`,
    rules: ['Drawn for today: tomorrow the region offers others.'],
    modifiers: [],
    pays: 'It pays its kills and its cache.',
    shut: null,
    finds: null,
  });
  const abyss = regionCardOf({ name: 'The Weeping Ossuary', island: 'continent-1', tier: 2 }, drawn);
  assert.deepEqual(abyss.rules.slice(1), [revives, 'Never matched. Bring your company.']);
});
