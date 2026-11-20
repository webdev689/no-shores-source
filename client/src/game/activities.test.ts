import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { activitiesAt, eliteRun, gatesAt } from './activities.ts';

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

test('what is on gives levels by tier, the week’s, the revives and the modifiers’ words; and the gates', async () => {
  const drawn = activitiesAt(await module, 29_919_420);
  assert.deepEqual(drawn.bands['continent-4'], [
    [10, 13],
    [12, 15],
    [13, 16],
  ]);
  assert.deepEqual(
    [drawn.weekElite.level, drawn.weekElite.opens, drawn.weekAbyss.level, drawn.weekAbyss.opens, drawn.revives],
    [26, 24, 30, 28, 5],
  );
  assert.deepEqual(drawn.modifiers['brawler'], { name: 'Brawler', words: 'Melee deals 50% more damage.' });
  const gates = gatesAt(await module, 9, true);
  assert.deepEqual(
    [gates.eliteDungeon, gates.weekElite, gates.weekAbyss],
    [null, 'This dungeon opens at level 24.', 'This dungeon opens at level 28.'],
  );
  assert.deepEqual(gatesAt(await module, 30, false).seas, [null, null, null]);
});
