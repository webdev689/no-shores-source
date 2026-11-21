import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { startRoomDoor } from '../../../server/roomDoor.ts';

/** The room-wasm crate's dungeon door holds the same asks and hash (crates/room-wasm/src/dungeon_door.rs): four
 *  patrols' dungeons, the last of five blocks with its last a style deeper, then one laid by a seed and a style. */
const AGREED_HASH = '77bbf7516bd71735';
const AGREED_ASKS: readonly (readonly [string, string, number])[] = [
  ['saltgrass-downs', 'The Saltgrass Downs', 0],
  ['highwater-glen', 'The Highwater Glen', 1],
  ['aurora-wastes', 'The Aurora Wastes', 2],
  ['gullwing-vale', 'The Gullwing Vale', 0],
];
const AGREED_SEEDED = [4242, 'caverns', 'The Gull Cove'] as const;

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const compiled = new WebAssembly.Module(
  await readFile(MODULE).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  }),
);

/** FNV-1a over bytes, as the crate takes it. */
function fnv1a(bytes: Uint8Array): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n);
  return hash.toString(16).padStart(16, '0');
}

test('a dungeon laid through WebAssembly is the bytes the crate lays natively', () => {
  const door = startRoomDoor(compiled);
  const text =
    AGREED_ASKS.map(([patrol, name, number]) => door.dungeon(patrol, name, number)).join('') +
    door.layout(JSON.stringify({ seed: AGREED_SEEDED[0], style: AGREED_SEEDED[1], name: AGREED_SEEDED[2] }));
  assert.equal(fnv1a(new TextEncoder().encode(text)), AGREED_HASH);
});

test('a dungeon names its patrol, and an ask the door cannot read is null', () => {
  const door = startRoomDoor(compiled);
  const laid = JSON.parse(door.dungeon('saltgrass-downs', 'The Saltgrass Downs', 0)) as { name: string };
  assert.match(laid.name, /^The \w+ of the Saltgrass Downs$/);
  assert.equal(door.dungeon('saltgrass-downs', 'The Saltgrass Downs', 1.5), 'null');
});
