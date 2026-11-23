import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOM = 'client/public/room.wasm';

test('the shipped room module carries no QA hook: those are built only into a scratch module for pictures', async () => {
  const names = WebAssembly.Module.exports(await WebAssembly.compile(readFileSync(ROOM))).map((found) => found.name);
  assert.ok(names.includes('room_tick'), 'the room module itself');
  assert.deepEqual(
    names.filter((name) => name.startsWith('room_qa_')),
    [],
  );
});
