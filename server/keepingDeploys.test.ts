// The keeper and the accounts across a deploy, either side first, and a vault no room can read: nothing of the
// account's vault and Aurem is lost or written over.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Characters } from './accounts/characters.ts';
import { Keeper } from './keeping.ts';
import { roomOf, world } from './keepingForTests.ts';

/** The rows the account keeps: its character's body and holder, and its vault's body. */
async function rowsOf(database: Awaited<ReturnType<typeof world>>['database']) {
  const character = await database
    .prepare('SELECT body, holder FROM characters')
    .first<{ body: string | null; holder: string | null }>();
  const vault = await database.prepare('SELECT body FROM vaults').first<{ body: string }>();
  return { body: character?.body ?? null, holder: character?.holder ?? null, vault: vault?.body ?? null };
}

const here = () => true;

test('a room meeting accounts older than the vault lets the character go untouched, and saves nothing', async () => {
  const { database, clock, kept, token } = await world();
  // Older accounts answer a claim with no vault at all.
  const older = { ...kept } as Characters;
  for (const ask of ['look', 'claim'] as const) {
    const asked = kept[ask].bind(kept) as (...args: string[]) => Promise<unknown>;
    (older as unknown as Record<string, unknown>)[ask] = async (...args: string[]) => {
      const answer = (await asked(...args)) as Record<string, unknown> | null;
      if (!answer) return answer;
      const { vault, ...rest } = answer;
      void vault;
      return rest;
    };
  }
  const room = roomOf();
  room.held.set(1, '{"own":1}');
  const keeper = new Keeper(older, room, 'node-a', () => undefined);
  assert.equal(await keeper.signIn(1, token, () => clock.now, here), false, 'played unkept');
  await keeper.due(clock.now + 60_000);
  await keeper.leave(1);
  assert.deepEqual(await rowsOf(database), { body: null, holder: null, vault: null });
});

test('accounts meeting a room older than the vault save its body alone, the vault still in it', async () => {
  const { database, kept, token } = await world();
  const claimed = await kept.claim(token, 'node-a:1');
  assert.ok(claimed);
  assert.equal(await kept.save(claimed.account, 'node-a:1', '{"saved":1}'), true);
  assert.deepEqual(await rowsOf(database), { body: '{"saved":1}', holder: 'node-a:1', vault: null });
  assert.equal(await kept.release(claimed.account, 'node-a:1', '{"saved":2}'), true, 'its last save too');
  assert.deepEqual(await rowsOf(database), { body: '{"saved":2}', holder: null, vault: null });
});

test("a new character whose account's vault this room cannot read is let go untouched, the vault kept", async () => {
  const { database, clock, kept, token } = await world();
  const claimed = await kept.claim(token, 'node-z:1');
  assert.ok(claimed);
  await kept.release(claimed.account, 'node-z:1', null, null);
  await database
    .prepare("INSERT INTO vaults (account_id, body, saved_at) VALUES (?1, 'from a later room', 1)")
    .bind(claimed.account)
    .run();
  const room = roomOf();
  // This room reads no vault but its own empty one.
  const reading = {
    ...room,
    restoreJoined: (player: number, body: string, vault: string | null) =>
      vault === '{}' && room.restoreJoined(player, body, vault),
  };
  room.held.set(1, '{"new":1}');
  const keeper = new Keeper(kept, reading, 'node-a', () => undefined);
  assert.equal(await keeper.signIn(1, token, () => clock.now, here), false);
  await keeper.due(clock.now + 60_000);
  await keeper.leave(1);
  assert.deepEqual(await rowsOf(database), { body: null, holder: null, vault: 'from a later room' });
});
