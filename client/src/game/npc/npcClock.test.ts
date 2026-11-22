import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { clockWords, countdownsAt } from './npcClock.ts';

const bytes = await readFile(
  new URL('../../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url),
).catch(() => {
  throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
});
const module = WebAssembly.compile(bytes);

test('the daily keepers count down to the daily reset at 09:00 UTC, as the room module’s rules count it', async () => {
  const rules = await module;
  const stock = (moment: number) => countdownsAt(moment, rules)?.stock;
  assert.equal(stock(Date.UTC(2026, 10, 20, 8, 59, 30)), 30);
  assert.equal(stock(Date.UTC(2026, 10, 20, 8, 59, 59, 500)), 1, 'a part second counts as one');
  assert.equal(stock(Date.UTC(2026, 10, 20, 9, 0, 0)), 86_400, 'a whole day as the wares turn');
  assert.equal(stock(Date.UTC(2026, 10, 20, 0, 0, 0)), 9 * 3_600, 'midnight turns nothing');
});

test('Shape’s time left runs by the room module’s rules to Sunday 21:00 UTC, never below none', async () => {
  const rules = await module;
  const shape = (moment: number) => countdownsAt(moment, rules)?.shape;
  // The 20th of November 2026 falls on a Friday.
  assert.equal(shape(Date.UTC(2026, 10, 20, 9, 0, 0)), 2 * 86_400 + 12 * 3_600, 'as he comes');
  assert.equal(shape(Date.UTC(2026, 10, 22, 20, 59, 0)), 60, 'a minute before he goes');
  assert.equal(shape(Date.UTC(2026, 10, 22, 20, 58, 30)), 90);
  assert.equal(shape(Date.UTC(2026, 10, 22, 21, 0, 0)), 0, 'as he goes');
  assert.equal(shape(Date.UTC(2026, 10, 22, 23, 0, 0)), 0, 'gone till Friday');
});

test('there is no count before the game’s room module is read', () => {
  assert.equal(countdownsAt(Date.UTC(2026, 10, 20, 9, 0, 0)), null);
});

test('a countdown reads as hours, minutes and seconds, with whole days before them', () => {
  assert.equal(clockWords(0), '0:00:00');
  assert.equal(clockWords(35 * 60 + 47), '0:35:47');
  assert.equal(clockWords(3_600 + 41 * 60 + 9), '1:41:09');
  assert.equal(clockWords(86_400 + 3 * 3_600 + 57), '1 day 3:00:57');
  assert.equal(clockWords(2 * 86_400 + 17), '2 days 0:00:17');
});
