import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { type ScreensFoot, startActivityScreens } from './activityScreens.ts';
import type { ActivityRecord, GearState } from '../network/gearMessages.ts';
import { fakePage } from './pageForTests.ts';
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

test('This Week reads the last word a room sent of the character, kept at sea, and turns with the minute', async () => {
  let clock = FRIDAY_NINE * 60_000;
  let look = () => undefined as void;
  let here: ScreensFoot | null = { gear: { gear: gearAt(12, { ...nothing, cleared: [1] }) } };
  const screens = startActivityScreens(fakePage().root as never, module, [vale], () => here, {
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
