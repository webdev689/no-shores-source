import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accounts } from './accountsForTests.ts';
import { characters } from './characters.ts';
import { STILL_IN_A_ROOM } from './slots.ts';

const LOOK = { body: 'female', race: 'human', tone: 0.25, hair: { style: 'braid', colour: 'red' } };
const BODY = JSON.stringify({
  shown: { level: 7, emblem: 'tide' },
  allegiance: { pledge: 2 },
  story: { prologue: true },
  last: { kind: 'sea' },
  materials: { aurem: 300 },
});

/** A guest with its characters kept on the same world, and a way to ask its slots. */
async function guest() {
  const world = accounts();
  const token = String((await world.ask('POST', '/v1/guest')).body.token);
  const kept = characters(
    world.deps.database,
    () => world.clock.now,
    () => Promise.resolve(),
  );
  const slots = async (method = 'GET', path = '', body?: unknown) =>
    world.ask(method, `/v1/characters${path}`, body, token);
  const row = async (table: string, slot: number) => {
    const found = await world.deps.database
      .prepare(`SELECT body, look, room, came_from FROM ${table} WHERE slot = ?1`)
      .bind(slot)
      .first<Record<string, string | null>>();
    return found === null ? null : { ...found };
  };
  return { world, token, kept, slots, row };
}

test('a new account plays slot 0, all four empty, and its Aurem is none', async () => {
  const { slots, world } = await guest();
  const answered = await slots();
  assert.equal(answered.status, 200);
  assert.deepEqual(answered.body, { playing: 0, developer: false, aurem: 0, slots: [null, null, null, null] });
  assert.equal((await world.ask('GET', '/v1/characters')).status, 401, 'signed in only');
});

test('a kept character shows as its room kept it, its Aurem its own until a room saves the vault apart', async () => {
  const { slots, kept, token, world } = await guest();
  const claimed = await kept.claim(token, 'node-overlook-social:1');
  assert.ok(claimed);
  await world.deps.database
    .prepare('UPDATE characters SET body = ?1, saved_at = 77 WHERE account_id = ?2')
    .bind(BODY, claimed.account)
    .run();
  assert.equal((await slots('PUT', '/look', { look: LOOK })).status, 204);
  const answered = await slots();
  assert.equal(answered.body.aurem, 300, 'kept before the vault was the account’s');
  assert.deepEqual((answered.body.slots as unknown[])[0], {
    slot: 0,
    shown: { level: 7, emblem: 'tide' },
    pledge: 2,
    look: LOOK,
    place: { kind: 'sea' },
    prologue: true,
    saved: 77,
  });
  const seen = await world.ask('GET', '/v1/me', undefined, token);
  assert.deepEqual(seen.body.place, { kind: 'sea' }, '/v1/me answers the place of the character in play');
  assert.equal(await kept.save(claimed.account, 'node-overlook-social:1', '{"xp":1}', '{"aurem":45}'), true);
  assert.equal((await slots()).body.aurem, 45, 'the account’s vault row, once kept');
});

test('switching benches the one in play with its body, look and rooms, and brings the chosen one back as it was', async () => {
  const { slots, kept, token, row } = await guest();
  const claimed = await kept.claim(token, 'node-a:1');
  assert.ok(claimed);
  await kept.save(claimed.account, 'node-a:1', '{"xp":1}', '{"aurem":9}');
  await slots('PUT', '/look', { look: LOOK });
  await kept.release(claimed.account, 'node-a:1', '{"xp":1}', '{"aurem":9}');
  const switched = await slots('POST', '/play', { slot: 2 });
  assert.equal(switched.status, 200);
  assert.equal(switched.body.playing, 2);
  assert.deepEqual((switched.body.slots as unknown[]).slice(1), [null, null, null], 'slot 2 is a new character');
  assert.deepEqual(await row('benched', 0), {
    body: '{"xp":1}',
    look: JSON.stringify(LOOK),
    room: 'node-a',
    came_from: null,
  });
  assert.deepEqual(await row('characters', 2), { body: null, look: null, room: null, came_from: null });

  // The new character plays elsewhere, then the first comes back.
  const second = await kept.claim(token, 'node-b:1');
  assert.equal(second?.body, null, 'a new character, who plays the prologue');
  assert.equal(second?.vault, '{"aurem":9}', 'the vault stayed the account’s');
  await kept.release(claimed.account, 'node-b:1', '{"xp":2}', '{"aurem":11}');
  await slots('POST', '/play', { slot: 0 });
  assert.deepEqual(await row('characters', 0), {
    body: '{"xp":1}',
    look: JSON.stringify(LOOK),
    room: 'node-a',
    came_from: null,
  });
  assert.deepEqual(await row('benched', 2), { body: '{"xp":2}', look: null, room: 'node-b', came_from: null });
  const back = await kept.claim(token, 'node-c:1');
  assert.deepEqual([back?.body, back?.vault, back?.from], ['{"xp":1}', '{"aurem":11}', 'node-a']);
});

test('the one in play is neither switched nor deleted while a room holds it', async () => {
  const { slots, kept, token, world, row } = await guest();
  const claimed = await kept.claim(token, 'node-a:1');
  assert.ok(claimed);
  await kept.save(claimed.account, 'node-a:1', '{"xp":1}', '{}');
  for (const ask of ['/play', '/delete']) {
    const refused = await slots('POST', ask, { slot: ask === '/play' ? 1 : 0 });
    assert.deepEqual([refused.status, refused.body.error], [409, STILL_IN_A_ROOM], ask);
  }
  assert.equal((await row('characters', 0))?.body, '{"xp":1}');
  assert.equal((await slots('POST', '/play', { slot: 0 })).body.playing, 0, 'the slot in play answers as GET');
  world.clock.now += 61_000;
  assert.equal((await slots('POST', '/play', { slot: 1 })).body.playing, 1, 'a hold lapsed holds nothing');
});

test('a slot outside 0 to 3, or a look the game does not know, is refused', async () => {
  const { slots } = await guest();
  for (const slot of [-1, 4, 1.5, '1', null]) assert.equal((await slots('POST', '/play', { slot })).status, 400);
  assert.equal((await slots('POST', '/delete', {})).status, 400);
  const looks = [
    null,
    [],
    { ...LOOK, body: 'other' },
    { ...LOOK, tone: 2 },
    { ...LOOK, hair: 'red' },
    { ...LOOK, race: 'x'.repeat(600) },
  ];
  for (const look of looks) assert.equal((await slots('PUT', '/look', { look })).status, 400, JSON.stringify(look));
  assert.equal((await slots('PUT', '/look', { look: { ...LOOK, race: 'anole', hair: null } })).status, 204);
});

test('deleting a benched slot deletes it; deleting the one in play empties it; the vault stays', async () => {
  const { slots, kept, token, world, row } = await guest();
  const claimed = await kept.claim(token, 'node-a:1');
  assert.ok(claimed);
  await kept.release(claimed.account, 'node-a:1', '{"xp":1}', '{"aurem":5}');
  await slots('POST', '/play', { slot: 3 });
  const deleted = await slots('POST', '/delete', { slot: 0 });
  assert.deepEqual(deleted.body.slots, [null, null, null, null]);
  assert.equal(await row('benched', 0), null);
  await slots('PUT', '/look', { look: LOOK });
  assert.equal(((await slots()).body.slots as unknown[])[3] !== null, true, 'a look chosen is a character');
  const emptied = await slots('POST', '/delete', { slot: 3 });
  assert.deepEqual([emptied.body.playing, emptied.body.slots], [3, [null, null, null, null]]);
  assert.deepEqual(await row('characters', 3), { body: null, look: null, room: null, came_from: null });
  const vault = await world.deps.database.prepare('SELECT body FROM vaults').first<{ body: string }>();
  assert.equal(vault?.body, '{"aurem":5}');
  assert.equal((await slots()).body.aurem, 5);
});

test('a guest swept goes with its benched characters and its vault', async () => {
  const { kept, token, slots, world } = await guest();
  const claimed = await kept.claim(token, 'node-a:1');
  assert.ok(claimed);
  await kept.release(claimed.account, 'node-a:1', '{"xp":1}', '{"aurem":5}');
  await slots('POST', '/play', { slot: 1 });
  await world.deps.database.prepare('DELETE FROM accounts WHERE id = ?1').bind(claimed.account).run();
  for (const table of ['characters', 'benched', 'vaults']) {
    const left = await world.deps.database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
    assert.equal(left?.n, 0, table);
  }
});

test('a room whose hold lapsed saves nothing over the character chosen or emptied after it', async () => {
  const { slots, kept, token, world, row } = await guest();
  const claimed = await kept.claim(token, 'node-a:1');
  assert.ok(claimed);
  await kept.save(claimed.account, 'node-a:1', '{"xp":1}', '{"aurem":5}');
  world.clock.now += 61_000;
  await slots('POST', '/play', { slot: 1 });
  assert.equal(await kept.save(claimed.account, 'node-a:1', '{"xp":2}', '{"aurem":6}'), false);
  assert.equal(await kept.release(claimed.account, 'node-a:1', '{"xp":2}', '{"aurem":6}'), false);
  assert.deepEqual(await row('characters', 1), { body: null, look: null, room: null, came_from: null });
  assert.equal((await slots()).body.aurem, 5, 'the vault as the room last saved it while it held it');
});

/** A character kept before the vault was the account's: an item carried (2) and one vaulted (3), a Vestige carried (4)
 *  and one vaulted (5), and its Aurem. */
const OLD = JSON.stringify({
  next_id: 6,
  items: { 2: [{ id: 2 }, 'Carried'], 3: [{ id: 3 }, 'Vault'] },
  vestiges: { 4: [{ id: 4 }, false], 5: [{ id: 5 }, true] },
  materials: { aurem: 700, fragments: 3 },
});

for (const ask of ['/play', '/delete'])
  test(`a character kept before the four, switched or deleted before a room saves it, gives the account its vault (${ask})`, async () => {
    const { slots, world, row } = await guest();
    await slots();
    await world.deps.database.prepare('UPDATE characters SET body = ?1').bind(OLD).run();
    await slots('POST', ask, { slot: ask === '/play' ? 1 : 0 });
    const vault = await world.deps.database.prepare('SELECT body FROM vaults').first<{ body: string }>();
    assert.deepEqual(JSON.parse(vault?.body ?? 'null'), { items: [{ id: 3 }], vestiges: [{ id: 5 }], aurem: 700 });
    assert.equal((await slots()).body.aurem, 700);
    if (ask === '/play')
      assert.deepEqual(JSON.parse((await row('benched', 0))?.body ?? 'null'), {
        next_id: 6,
        items: { 2: [{ id: 2 }, 'Carried'] },
        vestiges: { 4: [{ id: 4 }, false] },
        materials: { aurem: 0, fragments: 3 },
      });
    // Asked again, nothing is parted twice.
    await slots('POST', '/play', { slot: 2 });
    const again = await world.deps.database.prepare('SELECT body FROM vaults').first<{ body: string }>();
    assert.equal(again?.body, vault?.body);
  });
