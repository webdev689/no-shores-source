import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { FootContext } from './foot.ts';
import { nextOtherId, rulesOf } from './footRoom.ts';

test('another player’s figure number is never given twice in the page’s life, and stays clear of the player’s own', () => {
  const numbers = Array.from({ length: 500 }, () => nextOtherId());
  assert.equal(new Set(numbers).size, numbers.length);
  assert.ok(numbers.every((number) => number > 1));
});

test('the fight’s rules are made once for a room module, however many places ask', async () => {
  const bytes = await readFile(
    new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url),
  );
  const module = Promise.resolve(new WebAssembly.Module(bytes));
  const context = { roomModule: module } as unknown as FootContext;
  const [first, second] = [await rulesOf(context), await rulesOf(context)];
  assert.equal(first, second);
  assert.ok(first.roster.length > 0);
  const other = { roomModule: Promise.resolve(new WebAssembly.Module(bytes)) } as unknown as FootContext;
  assert.notEqual(await rulesOf(other), first, 'another module has its own');
});
