import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { activitiesAt, eliteRun } from './activities.ts';

const bytes = await readFile(
  new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url),
).catch(() => {
  throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
});
const module = WebAssembly.compile(bytes);

test('what is on reads from the rules, and an Elite Dungeon’s entrance opens the week’s run only where it is', async () => {
  const drawn = activitiesAt(await module, 29_919_420);
  assert.deepEqual(
    [drawn.day, drawn.week, drawn.weekElite.place, drawn.weekAbyss.place],
    [20_778, 2_968, 'forsaken-cistern', 'saltworm-warrens'],
  );
  assert.deepEqual(eliteRun('saltworm-warrens', 'abyss', drawn), { seas: 'abyss', words: 'Abyss Dungeon of the week' });
  assert.deepEqual(eliteRun('forsaken-cistern', 'elite', drawn), { seas: 'elite', words: 'Elite Dungeon of the week' });
  assert.deepEqual(eliteRun('forsaken-cistern', 'abyss', drawn), { seas: 'normal', words: 'Elite Dungeon' });
  assert.deepEqual(eliteRun('krakens-grotto', 'normal', drawn), { seas: 'normal', words: 'Elite Dungeon' });
});
