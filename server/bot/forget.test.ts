import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeBucket, freshDatabase, standWorker } from './botForTests.ts';
import { mediaKey } from './media.ts';
import { tick } from './worker.ts';
import { CLOSED_TICKET_KEEP_S, LEFT_KEEP_S, SERVER_TABLES, forgetLeftServers } from './store.ts';

const NOW_S = Date.UTC(2026, 10, 15) / 1000;

/** A row a server keeps in a table: every column that takes no default is given a value. */
function rowFor(raw: ReturnType<typeof freshDatabase>['raw'], table: string, guildId: string): void {
  const columns = raw.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
    type: string;
    notnull: number;
    dflt_value: unknown;
    pk: number;
  }[];
  // a lone INTEGER primary key counts itself; every other column without a default is given a value
  const keys = columns.filter((column) => column.pk > 0).length;
  const counted = (column: { type: string; pk: number }) => keys === 1 && column.pk > 0 && /int/i.test(column.type);
  const named = columns.filter(
    (column) =>
      !counted(column) &&
      (column.name === 'guild_id' || column.pk > 0 || (column.notnull && column.dflt_value === null)),
  );
  const values = named.map((column) =>
    column.name === 'guild_id' ? guildId : column.name === 'id' ? `${table}-${guildId}` : `${column.name}-${guildId}`,
  );
  raw
    .prepare(
      `INSERT INTO ${table} (${named.map((column) => column.name).join(', ')}) VALUES (${named.map(() => '?').join(', ')})`,
    )
    .run(...values);
}

function snapshot(
  raw: ReturnType<typeof freshDatabase>['raw'],
  guildId: string,
  present: boolean,
  sinceS: number,
): void {
  raw
    .prepare('INSERT INTO guild_snapshot (guild_id, name, owner_id, present, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(guildId, guildId, '1', present ? 1 : 0, sinceS);
}

test('a server left a month ago is forgotten whole, its pictures with it; one left lately, or still joined, is kept', async () => {
  const database = freshDatabase();
  const raw = database.raw;
  snapshot(raw, 'gone', false, NOW_S - LEFT_KEEP_S - 60);
  snapshot(raw, 'lately', false, NOW_S - LEFT_KEEP_S + 60);
  snapshot(raw, 'here', true, NOW_S - LEFT_KEEP_S - 60);
  for (const guildId of ['gone', 'lately', 'here']) {
    for (const table of SERVER_TABLES) rowFor(raw, table, guildId);
    raw
      .prepare('INSERT INTO giveaway_entries (giveaway_id, user_id) SELECT id, ? FROM giveaways WHERE guild_id = ?')
      .run('entrant', guildId);
  }
  const removed: string[] = [];
  const forgotten = await forgetLeftServers(database, NOW_S, async (ids) => void removed.push(...ids));
  assert.deepEqual(forgotten, ['gone']);
  assert.deepEqual(removed, ['media-gone'], 'its pictures are named for the bucket by their ids');
  const count = (table: string, guildId: string) =>
    Number((raw.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE guild_id = ?`).get(guildId) as { n: number }).n);
  for (const table of [...SERVER_TABLES, 'guild_snapshot']) {
    assert.equal(count(table, 'gone'), 0, `${table}: gone`);
    assert.equal(count(table, 'lately'), 1, `${table}: left lately`);
    assert.equal(count(table, 'here'), 1, `${table}: still joined`);
  }
  const entries = Number((raw.prepare('SELECT COUNT(*) AS n FROM giveaway_entries').get() as { n: number }).n);
  assert.equal(entries, 2, 'the gone server’s giveaway entries went with its giveaway');
});

test('every table that keeps a server’s rows by its id is one the forgetting clears', () => {
  const raw = freshDatabase().raw;
  const tables = (raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[])
    .map((row) => row.name)
    .filter((name) =>
      (raw.prepare(`PRAGMA table_info(${name})`).all() as { name: string }[]).some(
        (column) => column.name === 'guild_id',
      ),
    )
    .filter((name) => name !== 'guild_snapshot')
    .sort();
  assert.deepEqual(tables, [...SERVER_TABLES].sort());
});

test('a ticket closed a month ago is let go; an open one and one closed lately stay', async () => {
  const database = freshDatabase();
  const ticket = database.raw.prepare(
    'INSERT INTO tickets (guild_id, channel_id, user_id, opened_at, closed_at) VALUES (?, ?, ?, ?, ?)',
  );
  ticket.run('here', 'old', '1', NOW_S - CLOSED_TICKET_KEEP_S - 600, NOW_S - CLOSED_TICKET_KEEP_S - 60);
  ticket.run('here', 'recent', '1', NOW_S - 600, NOW_S - 60);
  ticket.run('here', 'open', '1', NOW_S - CLOSED_TICKET_KEEP_S - 600, 0);
  await forgetLeftServers(database, NOW_S, async () => {});
  const left = (
    database.raw.prepare('SELECT channel_id FROM tickets ORDER BY channel_id').all() as { channel_id: string }[]
  ).map((row) => row.channel_id);
  assert.deepEqual(left, ['open', 'recent']);
});

test('the hourly clock takes a forgotten server’s pictures out of the bucket, so none is served again', async () => {
  const bucket = fakeBucket();
  const bot = await standWorker({ env: { BOT_MEDIA: bucket } });
  await bucket.put(mediaKey('picture1'), new Uint8Array([1, 2, 3]), { httpMetadata: { contentType: 'image/png' } });
  const nowMs = Date.UTC(2026, 10, 15, 10, 17);
  const nowS = nowMs / 1000;
  snapshot(bot.database.raw, 'gone', false, nowS - LEFT_KEEP_S - 60);
  bot.database.raw
    .prepare('INSERT INTO media (id, guild_id, type, bytes, by_user, at) VALUES (?, ?, ?, ?, ?, ?)')
    .run('picture1', 'gone', 'image/png', 3, '1', nowS - LEFT_KEEP_S - 600);
  await tick(bot.env, nowMs, bot.execution, { fetch: bot.discord.fetch, registry: bot.registry });
  await bot.execution.settle();
  assert.equal(bucket.held.has(mediaKey('picture1')), false, 'the picture left the bucket');
  const served = await bot.call(new Request('https://bot.test/v1/media/picture1.png'));
  assert.equal(served.status, 404, 'and is served no more');
});
