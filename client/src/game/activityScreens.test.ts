import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { type ScreensFoot, startActivityScreens } from './activityScreens.ts';
import type { ActivityRecord, GearState } from '../network/gearMessages.ts';
import { gearScreenOpen } from './gearScreen.ts';
import { type FakeElement, FakeEvent, fakePage } from './pageForTests.ts';
import type { NodeInfo } from './worldData.ts';

const bytes = await readFile(
  new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url),
).catch(() => {
  throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
});
const module = WebAssembly.compile(bytes);
const FRIDAY_NINE = 29_919_420;
const vale = { id: 'gullwing-vale', name: 'The Gullwing Vale', kind: 'patrol', continent: 'continent-1' } as NodeInfo;
const gearAt = (level: number, activity: ActivityRecord) => ({ level, prologueDone: true, activity }) as GearState;
const nothing = { day: 20_778, cleared: [], week: 2_968, elite: false, abyss: false, boon: false };
/** A player on foot before the Gullwing Vale's entrances at Elite seas, their gear as given. */
const standing = (gear: GearState, fallen = false): ScreensFoot => ({
  node: vale,
  seas: 'elite',
  dungeon: null,
  fallen,
  gear: { gear },
});
const nowhere = { enter: () => undefined };
const keyed = (root: FakeElement, key: string) => root.all().find((node) => node.dataset['key'] === key);
const still = { now: () => FRIDAY_NINE * 60_000, every: () => undefined };

test('This Week reads the last word a room sent of the character, kept at sea, and turns with the minute', async () => {
  let clock = FRIDAY_NINE * 60_000;
  let look = () => undefined as void;
  let here: ScreensFoot | null = standing(gearAt(12, { ...nothing, cleared: [1] }));
  const screens = startActivityScreens(fakePage().root as never, module, [vale], () => here, nowhere, {
    now: () => clock,
    every: (run) => (look = run),
  });
  assert.equal(screens.week(), null, 'before the room module is read');
  await module;
  look();
  assert.deepEqual(
    screens.week()?.today.tiers.map((row) => row.state),
    ['Not taken', 'Taken', 'Abyss seas open at level 20.'],
  );
  assert.match(screens.week()?.today.dungeons[0]?.name ?? '', /Gullwing Vale$/);
  here = null;
  look();
  assert.equal(screens.week()?.today.tiers[1]?.state, 'Taken', 'at sea, as last heard');
  clock += 60_000;
  assert.equal(screens.week()?.today.resets, 'Resets in 23h 59m');
});

test('E at an entrance opens its card: tier, level, modifiers and pay; Enter goes in and Escape closes it', async () => {
  const { root, window } = fakePage();
  const entered: unknown[][] = [];
  const here = standing(gearAt(12, nothing));
  const trips = { enter: (...given: unknown[]) => void entered.push(given) };
  const screens = startActivityScreens(root as never, module, [vale], () => here, trips, still);
  await module;
  screens.card(0, 'The Caverns of the Gullwing Vale');
  for (const words of [
    'The Caverns of the Gullwing Vale',
    'Elite seas · Levels 3 to 6',
    'Burn (Shadow)',
    'Once a day at each tier, on any island: a Vestige and a richer cache.',
  ])
    assert.ok(root.find(words), words);
  assert.equal(gearScreenOpen(), true, 'the game’s keys rest under it');
  keyed(root, 'card-enter')?.click();
  assert.deepEqual(entered, [[0, 'The Caverns of the Gullwing Vale']]);
  assert.equal(gearScreenOpen(), false);
  screens.card(0, 'The Caverns of the Gullwing Vale');
  assert.equal(gearScreenOpen(), true);
  window.dispatchEvent(new FakeEvent('keydown', { key: 'Escape' }));
  assert.equal(gearScreenOpen(), false);
  assert.equal(entered.length, 1, 'closed, not entered');
  screens.card(1, 'The Mines of the Gullwing Vale');
  window.dispatchEvent(new FakeEvent('keydown', { key: 'e' }));
  assert.deepEqual(entered[1], [1, 'The Mines of the Gullwing Vale'], 'E again goes in');
});

test('a shut card says why and does not go in, and before the rules are read E goes straight in', async () => {
  const { root, window } = fakePage();
  const entered: unknown[][] = [];
  const trips = { enter: (...given: unknown[]) => void entered.push(given) };
  const young = standing(gearAt(9, nothing));
  const screens = startActivityScreens(root as never, new Promise(() => undefined), [vale], () => young, trips, still);
  screens.card(0, 'The Caverns of the Gullwing Vale');
  assert.deepEqual(entered, [[0, 'The Caverns of the Gullwing Vale']], 'no rules to show it by');
  const shut = startActivityScreens(root as never, module, [vale], () => young, trips, still);
  await module;
  shut.card(0, 'The Caverns of the Gullwing Vale');
  assert.ok(root.find('Elite seas open at level 10.'));
  keyed(root, 'card-enter')?.click();
  window.dispatchEvent(new FakeEvent('keydown', { key: 'e' }));
  assert.equal(entered.length, 1, 'shut: not entered');
  window.dispatchEvent(new FakeEvent('keydown', { key: 'Escape' }));
});

test('the card goes when its player falls or leaves the place, and gives the keys back', async () => {
  const { root } = fakePage();
  let look = () => undefined as void;
  let here: ScreensFoot | null = standing(gearAt(12, nothing));
  const clock = { now: still.now, every: (run: () => void) => void (look = run) };
  const screens = startActivityScreens(root as never, module, [vale], () => here, nowhere, clock);
  await module;
  screens.card(0, 'The Caverns of the Gullwing Vale');
  look();
  assert.equal(gearScreenOpen(), true, 'standing there still');
  here = standing(gearAt(12, nothing), true);
  look();
  assert.equal(gearScreenOpen(), false, 'fallen');
  here = standing(gearAt(12, nothing));
  screens.card(0, 'The Caverns of the Gullwing Vale');
  here = null;
  look();
  assert.equal(gearScreenOpen(), false, 'gone from the place');
});

test('the seas a player’s level shuts are read from the rules by the last word of the character, and none before', async () => {
  let look = () => undefined as void;
  let here: ScreensFoot | null = null;
  const clock = { now: still.now, every: (run: () => void) => void (look = run) };
  const screens = startActivityScreens(fakePage().root as never, module, [vale], () => here, nowhere, clock);
  await module;
  assert.deepEqual(screens.seasShut(), [], 'no word yet');
  here = standing(gearAt(9, nothing));
  look();
  here = null;
  assert.deepEqual(screens.seasShut(), [null, 'Elite seas open at level 10.', 'Abyss seas open at level 20.']);
});
