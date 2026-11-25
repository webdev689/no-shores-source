import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLEDGES_MAX, linkedCharacter, linkedPledges } from './linked.ts';
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

test('pledges: each linked Discord id gets its house or null, in one ask; an id linked to none is left out', async () => {
  const database = sqliteForTests();
  const accounts: Array<[string, string, string | null]> = [
    ['a1', '801', '{"allegiance":{"pledge":3}}'],
    ['a2', '802', '{"allegiance":{"pledge":0}}'],
    ['a3', '803', null],
    ['a4', '804', '{"allegiance":{"pledge":1}}'],
  ];
  for (const [id, discordId, body] of accounts) {
    await database
      .prepare("INSERT INTO accounts (id, username, discord_id, created_at) VALUES (?1, 'Ann', ?2, 1)")
      .bind(id, discordId)
      .run();
    if (body !== null)
      await database.prepare('INSERT INTO characters (account_id, body) VALUES (?1, ?2)').bind(id, body).run();
  }
  const found = await linkedPledges(database, ['801', '802', '803', '804', '805']);
  assert.deepEqual(found, { '801': 'The Veiled', '802': null, '803': null, '804': 'Stormcallers' });
  assert.deepEqual(await linkedPledges(database, ['805']), {});
});

test('pledges: more Discord ids than one ask may name answer nothing', async () => {
  const database = await withAccount('Ann', '{"allegiance":{"pledge":2}}');
  assert.deepEqual(await linkedPledges(database, [DISCORD]), { [DISCORD]: 'Lamplighters' });
  const many = [DISCORD, ...Array.from({ length: PLEDGES_MAX }, (_unused, index) => String(index))];
  assert.deepEqual(await linkedPledges(database, many), {});
});
