import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import course from '../../../content/testground/course.json' with { type: 'json' };
import type { GearState } from './gearMessages.ts';
import { LocalRoom } from './localRoom.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const compiled = new WebAssembly.Module(
  await readFile(MODULE).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  }),
);

test('a room in the page is told the world’s minute as it steps, so its day turns at midnight while it runs', () => {
  const realNow = Date.now;
  let now = Date.UTC(2026, 10, 20, 23, 59, 0);
  Date.now = () => now;
  try {
    const heard: GearState[] = [];
    const room = LocalRoom.open(
      compiled,
      course.start,
      course.blocks,
      () => undefined,
      (message) => heard.push(message),
      { stall: course.stall, nodes: course.resources },
    );
    room.pump(1);
    const before = heard.length;
    assert.ok(before > 0, 'the gear is told as the room opens');
    room.pump(1);
    assert.equal(heard.length, before, 'nothing new while the day stands');
    now = Date.UTC(2026, 10, 21, 0, 0, 1);
    room.pump(1);
    assert.ok(heard.length > before, 'the gear is told again as the day turns');
  } finally {
    Date.now = realNow;
  }
});
