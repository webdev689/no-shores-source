import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { startRoomDoor } from '../../../server/roomDoor.ts';

/** The room-wasm crate's dungeon door holds the same asks and hash (crates/room-wasm/src/dungeon_door.rs): four
 *  patrols' dungeons, the last of five blocks with its last a style deeper, then one laid by a seed and a style. */
const AGREED_HASH = '28aeb7f85045e220';
const AGREED_ASKS: readonly (readonly [string, string, number])[] = [
  ['saltgrass-downs', 'The Saltgrass Downs', 0],
  ['highwater-fells', 'The Highwater Fells', 1],
  ['whitewind-tundra', 'The Whitewind Tundra', 2],
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

/** The 18 Elite Dungeons, island by island, as the room-wasm crate asks them natively
 *  (crates/room-wasm/src/dungeon_door.rs), which writes its answers for this test. */
const ELITE_PLACES = [
  'krakens-grotto',
  'pearl-tomb',
  'cinder-deep',
  'hollow-crypt',
  'black-tide-caverns',
  'pale-undercroft',
  'forsaken-cistern',
  'sandworn-vault',
  'smugglers-labyrinth',
  'silt-barrows',
  'deepwater-vault',
  'coral-halls',
  'barrow-halls',
  'saltworm-warrens',
  'mire-hollows',
  'rotwater-sewers',
  'frozen-sepulchre',
  'brine-catacombs',
] as const;
const NATIVE_ELITE = new URL('../../../target/room-wasm/elite_layouts.json', import.meta.url);

test("every Elite Dungeon's encounters laid through WebAssembly are the ones the crate lays natively", async () => {
  const native = JSON.parse(
    await readFile(NATIVE_ELITE, 'utf8').catch(() => {
      throw new Error('the native layouts are not written: run `cargo test -p room-wasm` first');
    }),
  ) as unknown[];
  const door = startRoomDoor(compiled);
  assert.equal(native.length, ELITE_PLACES.length);
  ELITE_PLACES.forEach((place, index) => {
    const laid = JSON.parse(door.layout(JSON.stringify({ place, name: place }))) as {
      encounters: { seals: unknown[]; anchors: unknown[] };
    };
    assert.deepEqual(laid, native[index], place);
    assert.ok(laid.encounters.seals.length >= 2 && laid.encounters.anchors.length === 3, place);
  });
});
