// The account's vault and Aurem through a real room: the keeper gives the room the character with the vault joined in,
// and every save parts them again, the character to its row and the vault to the account's.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import course from '../content/testground/course.json' with { type: 'json' };
import { handle } from './accounts/accounts.ts';
import { Keeper } from './keeping.ts';
import { world } from './keepingForTests.ts';
import { type RoomDoor, startRoomDoor } from './roomDoor.ts';

const compiled = new WebAssembly.Module(
  await readFile(new URL('../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url)).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  }),
);

interface Body {
  next_id: number;
  items: Record<string, [{ id: number }, unknown]>;
  materials: { aurem: number };
}
interface Vault {
  items: { id: number }[];
  aurem: number;
}

/** A course's room with one player in it, kept as the worker keeps it. */
function keptRoom(): { room: RoomDoor; player: number; kitted: Body } {
  const room = startRoomDoor(compiled);
  assert.equal(room.open(course.start, course.blocks), true);
  const player = room.join();
  return { room, player, kitted: JSON.parse(room.kitted()) as Body };
}

const keeperOf = (room: RoomDoor, kept: Awaited<ReturnType<typeof world>>['kept']) =>
  new Keeper(
    kept,
    {
      keptApart: (player) => room.keptApart(player),
      judgedMoved: (player) => room.judgedMoved(player),
      restoreJoined: (player, body, vault) => room.restoreJoined(player, body, vault),
      own: (player, account) => room.own(player, account),
      shut: (player, body) => room.shut(player, body),
      name: (player, named) => room.name(player, named),
      tag: (player, tag) => room.tag(player, tag),
      guild: (player, told) => room.guild(player, told),
    },
    'test-room',
    () => undefined,
  );

const rows = async (database: Awaited<ReturnType<typeof world>>['database']) => {
  const character = await database.prepare('SELECT body FROM characters').first<{ body: string | null }>();
  const vault = await database.prepare('SELECT body FROM vaults').first<{ body: string }>();
  return {
    body: character?.body ? (JSON.parse(character.body) as Body) : null,
    vault: vault ? (JSON.parse(vault.body) as Vault) : null,
  };
};

test('a character kept before the vault was the account’s parts its own vault and Aurem at its first save, once', async () => {
  const { database, clock, kept, token } = await world();
  const { room, player, kitted } = keptRoom();
  // As kept before: its own Aurem, and an item of the kit moved into its vault.
  const [vaulted] = Object.keys(kitted.items);
  assert.ok(vaulted);
  const before = {
    ...kitted,
    materials: { ...kitted.materials, aurem: 1_200 },
    items: { ...kitted.items, [vaulted]: [kitted.items[vaulted]?.[0], 'Vault'] },
  };
  const claimed = await kept.claim(token, 'elsewhere:1');
  assert.ok(claimed);
  await kept.release(claimed.account, 'elsewhere:1', JSON.stringify(before), null);
  assert.equal((await rows(database)).vault, null, 'none kept apart yet');
  await database.prepare('UPDATE characters SET body = ?1').bind(JSON.stringify(before)).run();

  const keeper = keeperOf(room, kept);
  assert.equal(
    await keeper.signIn(
      player,
      token,
      () => clock.now,
      () => true,
    ),
    true,
  );
  assert.equal(await keeper.saveNow(player), true);
  const first = await rows(database);
  assert.equal(first.body?.materials.aurem, 0, 'the Aurem left the character');
  assert.ok(first.body && !(vaulted in first.body.items), 'the vaulted item left it');
  assert.equal(first.vault?.aurem, 1_200);
  assert.deepEqual(
    first.vault?.items.map((item) => item.id),
    [Number(vaulted)],
  );

  // Played again, the vault joins in and parts out whole: nothing doubled.
  clock.now += 61_000;
  const again = keptRoom();
  const keeperAgain = keeperOf(again.room, kept);
  assert.equal(
    await keeperAgain.signIn(
      again.player,
      token,
      () => clock.now,
      () => true,
    ),
    true,
  );
  const joined = JSON.parse(again.room.character(again.player) ?? '{}') as Body;
  assert.equal(joined.materials.aurem, 1_200, 'the room holds one whole character');
  await keeperAgain.leave(again.player);
  const last = await rows(database);
  assert.equal(last.vault?.aurem, 1_200);
  assert.equal(last.vault?.items.length, 1);
  assert.equal(last.body?.materials.aurem, 0);
});

test('a character kept before the four and switched away from before a room saved it plays again whole, nothing doubled', async () => {
  const { database, clock, kept, token } = await world();
  const { room, player, kitted } = keptRoom();
  const [vaulted] = Object.keys(kitted.items);
  assert.ok(vaulted);
  const before = {
    ...kitted,
    materials: { ...kitted.materials, aurem: 900 },
    items: { ...kitted.items, [vaulted]: [kitted.items[vaulted]?.[0], 'Vault'] },
  };
  const ask = (path: string, slot: number) =>
    handle(
      new Request(`https://a.test/v1/characters${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ slot }),
      }),
      { database, now: () => clock.now, discord: null, pages: [] },
    );
  await ask('/play', 0);
  await database.prepare('UPDATE characters SET body = ?1').bind(JSON.stringify(before)).run();
  await ask('/play', 1);
  await ask('/play', 0);
  const keeper = keeperOf(room, kept);
  assert.equal(
    await keeper.signIn(
      player,
      token,
      () => clock.now,
      () => true,
    ),
    true,
    'the body parted by the accounts reads as a character',
  );
  const joined = JSON.parse(room.character(player) ?? '{}') as Body;
  assert.equal(joined.materials.aurem, 900);
  assert.equal(Object.keys(joined.items).length, Object.keys(kitted.items).length, 'every item once');
  await keeper.leave(player);
  const last = await rows(database);
  assert.deepEqual([last.body?.materials.aurem, last.vault?.aurem, last.vault?.items.length], [0, 900, 1]);
});
