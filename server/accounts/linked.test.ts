import assert from 'node:assert/strict';
import { test } from 'node:test';
import { linkedCharacter } from './linked.ts';
import { sqliteForTests } from './sqliteForTests.ts';

const DISCORD = '80351110224678912';

async function withAccount(username: string | null, body: string | null) {
  const database = sqliteForTests();
  await database
    .prepare("INSERT INTO accounts (id, username, username_key, discord_id, created_at) VALUES ('a1', ?1, ?2, ?3, 1)")
    .bind(username, username?.toLowerCase() ?? null, DISCORD)
    .run();
  if (body !== null)
    await database.prepare("INSERT INTO characters (account_id, body) VALUES ('a1', ?1)").bind(body).run();
  return database;
}

test('linked: a Discord account linked to none reads as null', async () => {
  const database = await withAccount('Ann', null);
  assert.equal(await linkedCharacter(database, '1'), null);
});

test('linked: the name, the level its room kept to show and the faction pledged to, and nothing else', async () => {
  const body = JSON.stringify({
    xp: 3000,
    shown: { level: 23, emblem: 'first', worn: [{ id: 4 }] },
    allegiance: { pledge: 2, reputation: [5, 6, 7] },
    items: { 1: [] },
  });
  const found = await linkedCharacter(await withAccount('Ann', body), DISCORD);
  assert.deepEqual(found, { name: 'Ann', level: 23, faction: 'Lamplighters' });
});

test('linked: a character no room kept yet has no level; one pledged to none, or to no faction known, has none', async () => {
  assert.deepEqual(await linkedCharacter(await withAccount(null, null), DISCORD), {
    name: null,
    level: null,
    faction: null,
  });
  const unpledged = await linkedCharacter(
    await withAccount('Ann', '{"shown":{"level":4},"allegiance":{"pledge":0}}'),
    DISCORD,
  );
  assert.deepEqual(unpledged, { name: 'Ann', level: 4, faction: null });
  const unknown = await linkedCharacter(await withAccount('Ann', '{"allegiance":{"pledge":9}}'), DISCORD);
  assert.equal(unknown?.faction, null);
});
