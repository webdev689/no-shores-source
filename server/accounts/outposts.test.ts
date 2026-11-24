import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RAISE_AUREM } from '../../client/src/game/guild/outpostLaw.ts';
import { accounts } from './accountsForTests.ts';
import { characters } from './characters.ts';
import { outpostRoom } from './outpostStores.ts';

const SITE = 'gull-cove-outpost';
const HOUR = 3_600_000;

/** A guild of two, Ada its founder and Ben a member, and ways to stand each at an outpost and ask of it. */
async function world() {
  const made = accounts();
  made.clock.now = Date.UTC(2026, 10, 21, 12);
  const tokens: Record<string, string> = {};
  for (const name of ['Ada', 'Ben']) {
    const token = (await made.ask('POST', '/v1/guest')).body['token'] as string;
    await made.ask('POST', '/v1/register', { username: name, password: 'long enough' }, token);
    tokens[name] = token;
  }
  const ask = (name: string, path: string, body: object = {}) =>
    made.ask('POST', `/v1/social/${path}`, body, tokens[name]);
  await ask('Ada', 'guild/found', { name: 'Salt Kings', tag: 'SALT' });
  await ask('Ada', 'guild/invite', { name: 'Ben' });
  await ask('Ben', 'guild/accept', { tag: 'SALT' });
  const kept = characters(
    made.deps.database,
    () => made.clock.now,
    () => Promise.resolve(),
  );
  const accountOf = async (name: string) => (await kept.look(tokens[name] ?? ''))?.account ?? '';
  const guild = async () =>
    (await made.deps.database
      .prepare('SELECT id, treasury, xp FROM guilds')
      .first<{ id: string; treasury: number; xp: number }>())!;
  /** Stands a player's character in their guild's outpost room at the site. */
  const standAt = async (name: string) =>
    kept.claim(tokens[name] ?? '', `${outpostRoom(SITE, (await guild()).id)}:${name}`);
  const fund = async (amount: number) =>
    kept.deposit(await accountOf('Ada'), amount, `fund-${amount}-${Math.random()}`);
  const read = async (name: string) => (await made.ask('GET', '/v1/outposts', undefined, tokens[name])).body;
  const get = async (name: string, path: string) => (await made.ask('GET', path, undefined, tokens[name])).body;
  const raiseXp = (amount: number) => made.deps.database.prepare('UPDATE guilds SET xp = ?1').bind(amount).run();
  return { ...made, ask, kept, accountOf, guild, standAt, fund, read, get, raiseXp };
}

test('an outpost is raised at its site by the founder or an admin for its Aurem, its hall and standard standing', async () => {
  const { ask, standAt, fund, guild, read } = await world();
  const raise = () => ask('Ada', 'outpost/raise', { site: SITE, turn: 0 });
  assert.equal((await raise()).body['error'], 'Go to that outpost to do that.');
  assert.equal((await read('Ada'))['at'], null);
  await standAt('Ada');
  assert.equal((await read('Ada'))['at'], SITE, 'standing at a site the guild has not raised');
  assert.equal((await raise()).body['error'], 'The treasury lacks the 5,000 Aurem raising an outpost takes.');
  await fund(7_000);
  assert.equal((await raise()).status, 200);
  assert.equal((await guild()).treasury, 7_000 - RAISE_AUREM);
  const outposts = (await read('Ada'))['outposts'] as { site: string; plot: { structures: { kind: string }[] } }[];
  assert.deepEqual(
    outposts[0]?.plot.structures.map((standing) => standing.kind),
    ['hall', 'standard'],
  );
  assert.equal((await raise()).body['error'], 'Your guild holds this outpost already.');
  assert.equal(
    (await ask('Ada', 'outpost/raise', { site: 'other-outpost', turn: 0 })).status,
    409,
    'level 1 holds one',
  );
});

test('a structure costs its Aurem at once, then stands when its members deliver its materials', async () => {
  const { ask, standAt, fund, guild, kept, accountOf, read, raiseXp } = await world();
  await standAt('Ada');
  await fund(20_000);
  await ask('Ada', 'outpost/raise', { site: SITE, turn: 0 });
  assert.equal((await ask('Ben', 'outpost/place', { site: SITE, kind: 'counting', x: 0, y: 0, turn: 0 })).status, 409);
  const place = await ask('Ada', 'outpost/place', { site: SITE, kind: 'counting', x: 0, y: 0, turn: 0 });
  assert.equal(place.status, 200);
  assert.equal((await guild()).treasury, 20_000 - RAISE_AUREM - 3_000);
  const room = `${outpostRoom(SITE, (await guild()).id)}`;
  const ada = await accountOf('Ada');
  assert.equal(await kept.deliver(ada, room, { id: 3, stuff: 'timber', amount: 50 }), 40, 'only what it needs');
  assert.equal(
    await kept.deliver(ada, room, { id: 3, stuff: 'canvas', amount: 5 }),
    0,
    'none of what it needs none of',
  );
  await kept.deliver(ada, room, { id: 3, stuff: 'iron', amount: 20 });
  const counting = (
    (await read('Ada'))['outposts'] as { plot: { structures: { kind: string; tier: number }[] } }[]
  )[0]?.plot.structures.find((standing) => standing.kind === 'counting');
  assert.equal(counting?.tier, 1, 'it stands');
  assert.equal(
    (await ask('Ada', 'outpost/rise', { site: SITE, id: 3 })).body['error'],
    'Your guild builds tier 2 at level 3.',
  );
  await raiseXp(40_000);
  assert.equal(
    (await ask('Ada', 'outpost/rise', { site: SITE, id: 3 })).body['error'],
    'Raise the hall to tier 2 first.',
  );
});

test('a structure may not stand over another, off the plot, or before the level that opens it', async () => {
  const { ask, standAt, fund } = await world();
  await standAt('Ada');
  await fund(30_000);
  await ask('Ada', 'outpost/raise', { site: SITE, turn: 0 });
  const place = async (kind: string, x: number, y: number) =>
    (await ask('Ada', 'outpost/place', { site: SITE, kind, x, y, turn: 0 })).body['error'];
  assert.equal(await place('counting', 7, 7), 'Something already stands there.');
  assert.equal(await place('counting', 15, 15), 'Place it on the plot.');
  assert.equal(await place('war-table', 0, 0), 'Your guild opens the War Table at level 2.');
});

test('decoration is set for its price and taken up for half back; a structure taken down gives half its Aurem back', async () => {
  const { ask, standAt, fund, guild } = await world();
  await standAt('Ada');
  await fund(20_000);
  await ask('Ada', 'outpost/raise', { site: SITE, turn: 0 });
  const before = (await guild()).treasury;
  assert.equal((await ask('Ada', 'outpost/decorate', { site: SITE, piece: 'well', x: 3, y: 3, turn: 2 })).status, 200);
  const price = before - (await guild()).treasury;
  assert.ok(price >= 25 && price <= 500);
  assert.equal(
    (await ask('Ada', 'outpost/decorate', { site: SITE, piece: 'well', x: 30, y: 30, turn: 0 })).status,
    400,
  );
  await ask('Ada', 'outpost/undecorate', { site: SITE, id: 1 });
  assert.equal((await guild()).treasury, before - price + Math.floor(price / 2));
  await ask('Ada', 'outpost/place', { site: SITE, kind: 'counting', x: 0, y: 0, turn: 0 });
  const placed = (await guild()).treasury;
  await ask('Ada', 'outpost/remove', { site: SITE, id: 3 });
  assert.equal((await guild()).treasury, placed + 1_500);
  assert.equal(
    (await ask('Ada', 'outpost/remove', { site: SITE, id: 1 })).body['error'],
    'The hall stands while the outpost does.',
  );
});

test('the strongbox fills by the hour to two days and is emptied into the treasury by a member there', async () => {
  const { ask, standAt, fund, guild, kept, accountOf, clock } = await world();
  await standAt('Ada');
  await fund(20_000);
  await ask('Ada', 'outpost/raise', { site: SITE, turn: 0 });
  await ask('Ada', 'outpost/place', { site: SITE, kind: 'counting', x: 0, y: 0, turn: 0 });
  const room = outpostRoom(SITE, (await guild()).id);
  for (const [stuff, amount] of [
    ['timber', 40],
    ['iron', 20],
  ] as const)
    await kept.deliver(await accountOf('Ada'), room, { id: 3, stuff, amount });
  assert.equal((await ask('Ben', 'outpost/collect', { site: SITE })).body['error'], 'Go to that outpost to do that.');
  await standAt('Ben');
  clock.now += 5.5 * HOUR;
  await standAt('Ben');
  const before = (await guild()).treasury;
  assert.equal((await ask('Ben', 'outpost/collect', { site: SITE })).status, 200);
  assert.equal((await guild()).treasury, before + 5 * 30, 'five whole hours at tier 1');
  clock.now += 100 * HOUR;
  await standAt('Ben');
  await ask('Ben', 'outpost/collect', { site: SITE });
  assert.equal((await guild()).treasury, before + 5 * 30 + 48 * 30, 'two days at most');
});

test('a member takes from the stores within what a day allows, and the horn sounds once a week', async () => {
  const { ask, standAt, fund, guild, kept, accountOf, clock, raiseXp } = await world();
  await raiseXp(40_000);
  await standAt('Ada');
  await fund(40_000);
  await ask('Ada', 'outpost/raise', { site: SITE, turn: 0 });
  await ask('Ada', 'outpost/place', { site: SITE, kind: 'camp', x: 0, y: 0, turn: 0 });
  const room = outpostRoom(SITE, (await guild()).id);
  const ada = await accountOf('Ada');
  for (const [stuff, amount] of [
    ['timber', 40],
    ['canvas', 20],
  ] as const)
    await kept.deliver(ada, room, { id: 3, stuff, amount });
  clock.now += 2 * 24 * HOUR;
  assert.equal(await kept.takeStores(ada, room, 'island', 25), 20, "a day's most");
  assert.equal(await kept.takeStores(ada, room, 'island', 5), 0, 'none more that day');
  assert.equal(await kept.takeStores(await accountOf('Ben'), room, 'island', 25), 10, 'the rest of two days');
  assert.equal(await kept.soundHorn(ada, room), -2, 'no horn built');
  assert.equal(await kept.soundHorn(await accountOf('Ben'), room), -1, 'a member may not sound it');
});

test('the founder abandons an outpost from anywhere for half of all spent on it', async () => {
  const { ask, standAt, fund, guild, read } = await world();
  await standAt('Ada');
  await fund(10_000);
  await ask('Ada', 'outpost/raise', { site: SITE, turn: 0 });
  assert.equal((await ask('Ben', 'outpost/abandon', { site: SITE })).status, 403);
  assert.equal((await ask('Ada', 'outpost/abandon', { site: SITE })).status, 200);
  assert.equal((await guild()).treasury, 10_000 - RAISE_AUREM + RAISE_AUREM / 2);
  assert.deepEqual((await read('Ada'))['outposts'], []);
});

test('a deposit a room makes twice by the same id moves the Aurem once', async () => {
  const { kept, accountOf, guild } = await world();
  const ada = await accountOf('Ada');
  assert.equal(await kept.deposit(ada, 500, 'room-1'), 'moved');
  assert.equal(await kept.deposit(ada, 500, 'room-1'), 'already');
  assert.equal((await guild()).treasury, 500);
  assert.equal(await kept.deposit(ada, 2_000_000, 'room-2'), 'refused', 'past the most a treasury holds');
});

test("anyone signed in reads an outpost's plot and banner by its room, and none for a room with none", async () => {
  const { ask, standAt, fund, guild, get } = await world();
  await standAt('Ada');
  await fund(6_000);
  await ask('Ada', 'outpost/raise', { site: SITE, turn: 0 });
  const room = outpostRoom(SITE, (await guild()).id);
  const outpost = (await get('Ben', `/v1/outposts/${room}`))['outpost'] as {
    name: string;
    plot: { structures: unknown[] };
  } | null;
  assert.equal(outpost?.name, 'Salt Kings');
  assert.equal(outpost?.plot.structures.length, 2, 'its hall and standard');
  assert.equal(
    (await get('Ben', '/v1/outposts/node-other-outpost--guild-00000000000000000000000000000000'))['outpost'],
    null,
  );
});

test('a delivery, a take and the horn asked again under the same id answer as they did and do nothing twice', async () => {
  const { ask, standAt, fund, guild, kept, accountOf, clock, raiseXp } = await world();
  await raiseXp(40_000);
  await standAt('Ada');
  await fund(40_000);
  await ask('Ada', 'outpost/raise', { site: SITE, turn: 0 });
  await ask('Ada', 'outpost/place', { site: SITE, kind: 'camp', x: 0, y: 0, turn: 0 });
  const room = outpostRoom(SITE, (await guild()).id);
  const ada = await accountOf('Ada');
  assert.equal(await kept.deliver(ada, room, { id: 3, stuff: 'timber', amount: 30 }, 'errand-1'), 30);
  assert.equal(
    await kept.deliver(ada, room, { id: 3, stuff: 'timber', amount: 30 }, 'errand-1'),
    30,
    'the same answer',
  );
  assert.equal(await kept.deliver(ada, room, { id: 3, stuff: 'timber', amount: 30 }, 'errand-2'), 10, 'only ten more');
  await kept.deliver(ada, room, { id: 3, stuff: 'canvas', amount: 20 }, 'errand-3');
  clock.now += 2 * 24 * HOUR;
  assert.equal(await kept.takeStores(ada, room, 'island', 12, 'errand-4'), 12);
  assert.equal(await kept.takeStores(ada, room, 'island', 12, 'errand-4'), 12, 'the same answer');
  assert.equal(await kept.takeStores(ada, room, 'island', 20, 'errand-5'), 8, "the day's most counts the first once");
});

test('a strongbox fills only from when its Counting House stands, and a new tier pays only from then', async () => {
  const { ask, standAt, fund, guild, kept, accountOf, clock, raiseXp, read, deps } = await world();
  await raiseXp(40_000);
  await standAt('Ada');
  await fund(100_000);
  await ask('Ada', 'outpost/raise', { site: SITE, turn: 0 });
  await deps.database.prepare("UPDATE outpost_structures SET tier = 2 WHERE kind = 'hall'").run();
  await ask('Ada', 'outpost/place', { site: SITE, kind: 'counting', x: 0, y: 0, turn: 0 });
  clock.now += 40 * HOUR;
  const room = outpostRoom(SITE, (await guild()).id);
  const ada = await accountOf('Ada');
  await kept.deliver(ada, room, { id: 3, stuff: 'timber', amount: 40 });
  await kept.deliver(ada, room, { id: 3, stuff: 'iron', amount: 20 });
  const box = async () => ((await read('Ada'))['outposts'] as { strongbox: number }[])[0]?.strongbox;
  assert.equal(await box(), 0, 'nothing for the hours before it stood');
  clock.now += 10 * HOUR;
  assert.equal(await box(), 10 * 30);
  await standAt('Ada');
  const rose = await ask('Ada', 'outpost/rise', { site: SITE, id: 3 });
  assert.equal(rose.status, 200);
  const before = (await guild()).treasury;
  await kept.deliver(ada, room, { id: 3, stuff: 'timber', amount: 200 });
  await kept.deliver(ada, room, { id: 3, stuff: 'iron', amount: 200 });
  await kept.deliver(ada, room, { id: 3, stuff: 'island', amount: 200 });
  clock.now += 2 * HOUR;
  await standAt('Ada');
  assert.equal((await ask('Ada', 'outpost/collect', { site: SITE })).status, 200);
  const tier = (
    (await read('Ada'))['outposts'] as { plot: { structures: { id: number; tier: number }[] } }[]
  )[0]?.plot.structures.find((each) => each.id === 3)?.tier;
  assert.equal(tier, 2, 'it stands at tier 2');
  assert.equal((await guild()).treasury - before, 10 * 30 + 2 * 60, 'ten hours at tier 1, then two at tier 2');
});

test('an ask the page names and sends twice pays and places once, and answers the same', async () => {
  const { ask, standAt, fund, guild, deps } = await world();
  await standAt('Ada');
  await fund(20_000);
  await ask('Ada', 'outpost/raise', { site: SITE, turn: 0 });
  const decorate = () =>
    ask('Ada', 'outpost/decorate', { site: SITE, piece: 'well', x: 3, y: 3, turn: 0, rid: 'well-1' });
  const before = (await guild()).treasury;
  assert.equal((await decorate()).status, 200);
  const after = (await guild()).treasury;
  assert.equal((await decorate()).status, 200, 'the same answer');
  assert.equal((await guild()).treasury, after);
  assert.ok(after < before);
  const pieces = await deps.database.prepare('SELECT COUNT(*) AS count FROM outpost_decor').first<{ count: number }>();
  assert.equal(pieces?.count, 1);
  const bad = await ask('Ada', 'outpost/decorate', { site: SITE, piece: 'well', x: 3, y: 30, turn: 0, rid: 'NO!' });
  assert.equal(bad.status, 400);
});

test('the ledger names what was built, begun and taken down, writes nothing for nothing, and keeps its newest', async () => {
  const { ask, standAt, fund, guild, deps } = await world();
  await standAt('Ada');
  await fund(20_000);
  await ask('Ada', 'outpost/raise', { site: SITE, turn: 0 });
  await ask('Ada', 'outpost/place', { site: SITE, kind: 'counting', x: 0, y: 0, turn: 0 });
  await ask('Ada', 'outpost/remove', { site: SITE, id: 3 });
  await ask('Ada', 'outpost/decorate', { site: SITE, piece: 'well', x: 3, y: 3, turn: 0 });
  await ask('Ada', 'outpost/undecorate', { site: SITE, id: 1 });
  await ask('Ada', 'outpost/remove', { site: SITE, id: 2 });
  const kinds = async () =>
    (await deps.database.prepare('SELECT kind FROM guild_ledger ORDER BY rowid').all<{ kind: string }>()).results.map(
      (row) => row.kind,
    );
  assert.deepEqual((await kinds()).slice(1), [
    'raise',
    'begin counting',
    'take down counting',
    'decorate well',
    'take down well',
  ]);
  assert.equal((await ask('Ada', 'outpost/place', { site: SITE, kind: 'standard', x: 0, y: 0, turn: 0 })).status, 200);
  assert.equal((await kinds()).length, 6, 'a free standard writes no line');
  const id = (await guild()).id;
  for (let each = 0; each < 210; each++)
    await deps.database
      .prepare(
        "INSERT INTO guild_ledger (guild_id, rid, mark, kind, amount, balance, at) VALUES (?1, ?2, '', 'old', 0, 0, 0)",
      )
      .bind(id, `old-${each}`)
      .run();
  assert.equal((await ask('Ada', 'outpost/decorate', { site: SITE, piece: 'well', x: 3, y: 50, turn: 0 })).status, 200);
  assert.equal((await kinds()).length, 200);
  assert.ok((await kinds()).includes('decorate well'), 'the newest kept');
});

test('a strongbox that would fill the treasury past its most moves what fits and keeps the rest', async () => {
  const { ask, standAt, fund, guild, kept, accountOf, clock, read } = await world();
  await standAt('Ada');
  await fund(20_000);
  await ask('Ada', 'outpost/raise', { site: SITE, turn: 0 });
  await ask('Ada', 'outpost/place', { site: SITE, kind: 'counting', x: 0, y: 0, turn: 0 });
  const room = outpostRoom(SITE, (await guild()).id);
  const ada = await accountOf('Ada');
  await kept.deliver(ada, room, { id: 3, stuff: 'timber', amount: 40 });
  await kept.deliver(ada, room, { id: 3, stuff: 'iron', amount: 20 });
  await fund(1_000_000 - (await guild()).treasury - 100);
  clock.now += 10 * HOUR;
  await standAt('Ada');
  assert.equal((await ask('Ada', 'outpost/collect', { site: SITE })).status, 200);
  assert.equal((await guild()).treasury, 1_000_000);
  assert.equal(((await read('Ada'))['outposts'] as { strongbox: number }[])[0]?.strongbox, 10 * 30 - 100);
});

test('a character whose outpost room let go of it is no longer there, and the page reads what it took today', async () => {
  const { ask, standAt, fund, guild, kept, accountOf, clock, raiseXp, read } = await world();
  await raiseXp(40_000);
  await standAt('Ada');
  await fund(40_000);
  await ask('Ada', 'outpost/raise', { site: SITE, turn: 0 });
  await ask('Ada', 'outpost/place', { site: SITE, kind: 'camp', x: 0, y: 0, turn: 0 });
  const room = outpostRoom(SITE, (await guild()).id);
  const ada = await accountOf('Ada');
  await kept.deliver(ada, room, { id: 3, stuff: 'timber', amount: 40 });
  await kept.deliver(ada, room, { id: 3, stuff: 'canvas', amount: 20 });
  clock.now += 2 * 24 * HOUR;
  assert.equal(
    (await ask('Ada', 'outpost/decorate', { site: SITE, piece: 'well', x: 3, y: 50, turn: 0 })).body['error'],
    'Go to that outpost to do that.',
  );
  assert.equal(await kept.takeStores(ada, room, 'island', 7), 7);
  assert.deepEqual((await read('Ada'))['taken'], { island: 7 });
});

test("outpost asks and reads of an outpost's plot are limited", async () => {
  const { ask, get, guild } = await world();
  const room = outpostRoom(SITE, (await guild()).id);
  let asked = 0;
  while ((await ask('Ada', 'outpost/collect', { site: SITE })).status !== 429 && asked < 1_000) asked++;
  assert.ok(asked < 1_000, 'asks stop');
  let read = 0;
  while ((await get('Ben', `/v1/outposts/${room}`))['error'] === undefined && read < 1_000) read++;
  assert.ok(read < 1_000, 'reads stop');
});

test('the horn answers its tier when it sounds and 0 once it has this week; a take lets go of earlier days', async () => {
  const { ask, standAt, fund, guild, kept, accountOf, clock, deps } = await world();
  await standAt('Ada');
  await fund(6_000);
  await ask('Ada', 'outpost/raise', { site: SITE, turn: 0 });
  const { id } = await guild();
  await deps.database
    .prepare(
      "INSERT INTO outpost_structures (guild_id, site, id, kind, tier, x, y, turn) VALUES (?1, ?2, 9, 'horn', 2, 0, 0, 0)",
    )
    .bind(id, SITE)
    .run();
  const room = outpostRoom(SITE, id);
  const ada = await accountOf('Ada');
  assert.equal(await kept.soundHorn(ada, room), 2);
  assert.equal(await kept.soundHorn(ada, room), 0, 'sounded this week');
  await deps.database
    .prepare("INSERT INTO outpost_takes (account_id, day, stuff, taken) VALUES (?1, 1, 'island', 5)")
    .bind(ada)
    .run();
  await deps.database.prepare(`UPDATE outposts SET stores = '{"island":40}', stores_at = ?1`).bind(clock.now).run();
  await deps.database.prepare("UPDATE outpost_structures SET kind = 'camp', tier = 1 WHERE id = 9").run();
  assert.equal(await kept.takeStores(ada, room, 'island', 3), 3);
  const days = await deps.database.prepare('SELECT day FROM outpost_takes').all<{ day: number }>();
  assert.equal(days.results.length, 1, "only today's kept");
});

test('a Counting House taken down settles its strongbox first, so what it earned stays to be emptied', async () => {
  const { ask, standAt, fund, guild, kept, accountOf, clock, read } = await world();
  await standAt('Ada');
  await fund(20_000);
  await ask('Ada', 'outpost/raise', { site: SITE, turn: 0 });
  await ask('Ada', 'outpost/place', { site: SITE, kind: 'counting', x: 0, y: 0, turn: 0 });
  const room = outpostRoom(SITE, (await guild()).id);
  const ada = await accountOf('Ada');
  await kept.deliver(ada, room, { id: 3, stuff: 'timber', amount: 40 });
  await kept.deliver(ada, room, { id: 3, stuff: 'iron', amount: 20 });
  clock.now += 3 * HOUR;
  await standAt('Ada');
  assert.equal((await ask('Ada', 'outpost/remove', { site: SITE, id: 3 })).status, 200);
  assert.equal(((await read('Ada'))['outposts'] as { strongbox: number }[])[0]?.strongbox, 3 * 30);
});
