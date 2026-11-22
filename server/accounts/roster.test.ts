import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accounts, slowly } from './accountsForTests.ts';
import { characters } from './characters.ts';
import { INVITE_MS } from './companies.ts';
import { foundRun } from './finding.ts';
import type { Details, Roster } from './roster.ts';

/** A world of named players, each one's token, and a way to ask as them. */
async function world(...names: string[]) {
  const made = accounts();
  const tokens: Record<string, string> = {};
  for (const name of names) {
    const token = (await made.ask('POST', '/v1/guest')).body['token'] as string;
    await made.ask('POST', '/v1/register', { username: name, password: 'long enough' }, token);
    tokens[name] = token;
  }
  const player = (name: string) => ({
    ask: async (path: string, body: object = {}) => made.ask('POST', `/v1/social/${path}`, body, tokens[name]),
    roster: async () => (await made.ask('GET', '/v1/roster', undefined, tokens[name])).body as unknown as Roster,
    details: async (whose: string) => {
      const answer = await made.ask('GET', `/v1/players/${whose}`, undefined, tokens[name]);
      return { status: answer.status, body: answer.body as unknown as Details };
    },
  });
  // Puts a player's character in a room, as a node's room claims it, with what it shows.
  const kept = characters(
    made.deps.database,
    () => made.clock.now,
    () => Promise.resolve(),
  );
  const play = async (name: string, room: string, level = 7) => {
    const holder = `${room}:${name}`;
    const claimed = await kept.claim(tokens[name] ?? '', holder);
    const shown = { level, emblem: 'overlook', worn: [] };
    await kept.save(claimed?.account ?? '', holder, JSON.stringify({ shown }));
  };
  return { ...made, tokens, player, play, kept };
}

const names = (people: readonly { name: string | null }[]) => people.map((each) => each.name);

test('a block ends what is between two players, and what the blocked one asks after never reaches them', async () => {
  const { player } = await world('Ada', 'Ben');
  const [ada, ben] = [player('Ada'), player('Ben')];
  await ada.ask('friend/ask', { name: 'Ben' });
  await ben.ask('friend/accept', { name: 'Ada' });
  assert.equal((await ada.ask('block', { name: 'Ben' })).status, 200);
  assert.deepEqual(names((await ada.roster()).friends), [], 'no longer friends');
  assert.deepEqual((await ada.roster()).blocked, ['Ben']);
  assert.equal((await ben.ask('friend/ask', { name: 'Ada' })).status, 200, 'answered as made');
  assert.deepEqual(names((await ada.roster()).asking), [], 'but never reaches Ada');
  assert.equal((await ben.ask('company/invite', { name: 'Ada' })).status, 200);
  assert.deepEqual((await ada.roster()).invites, [], 'nor does an invite');
  assert.equal((await ada.ask('friend/ask', { name: 'Ben' })).status, 409, 'Ada must unblock first');
  assert.equal((await ben.details('Ada')).status, 200, 'Ada is found by the one she blocks, as by anyone');
  await ada.ask('unblock', { name: 'Ben' });
  assert.equal((await ada.ask('friend/ask', { name: 'Ben' })).status, 200);
  assert.deepEqual(names((await ben.roster()).asking), ['Ada']);
});

test('a company holds four, joined by invite or as its leader allows, and its lead passes on', async () => {
  const { player, play } = await world('Ada', 'Ben', 'Cal', 'Dee', 'Eve');
  for (const name of ['Ada', 'Ben', 'Cal', 'Dee', 'Eve']) await play(name, 'node-overlook-social');
  const [ada, ben, cal, dee, eve] = ['Ada', 'Ben', 'Cal', 'Dee', 'Eve'].map(player) as [
    ReturnType<typeof player>,
    ReturnType<typeof player>,
    ReturnType<typeof player>,
    ReturnType<typeof player>,
    ReturnType<typeof player>,
  ];
  assert.equal((await ben.ask('company/join', { name: 'Ada' })).status, 403, "Friends Only: Ben is not Ada's friend");
  await ada.ask('company/invite', { name: 'Ben' });
  assert.deepEqual(names((await ben.roster()).invites), ['Ada']);
  assert.equal((await ben.ask('company/accept', { name: 'Ada' })).status, 200);
  const company = (await cal.roster()).company;
  assert.equal(company, null, 'Cal is not in it');
  assert.deepEqual(names((await ben.roster()).company?.members ?? []), ['Ada', 'Ben'], 'the leader first');
  await ada.ask('company/privacy', { privacy: 0 });
  assert.equal((await cal.ask('company/join', { name: 'Ben' })).status, 200, 'Public: anyone joins');
  assert.equal((await dee.ask('company/join', { name: 'Ada' })).status, 200, 'the fourth comes in');
  assert.equal((await eve.ask('company/join', { name: 'Ada' })).status, 409, 'four at most');
  await dee.ask('company/leave');
  assert.equal((await ben.ask('company/kick', { name: 'Cal' })).status, 403, 'only the leader removes');
  assert.equal((await ada.ask('company/lead', { name: 'Cal' })).status, 200);
  await cal.ask('company/kick', { name: 'Ada' });
  assert.deepEqual(names((await ben.roster()).company?.members ?? []), ['Cal', 'Ben']);
  await cal.ask('company/leave');
  assert.equal((await ben.roster()).company, null, 'a company of one ends');
  await ben.ask('company/privacy', { privacy: 3 });
  assert.equal((await ada.ask('company/join', { name: 'Ben' })).status, 403, 'Closed');
  await ben.ask('company/invite', { name: 'Ada' });
  assert.equal((await ada.ask('company/accept', { name: 'Ben' })).status, 200, 'an invite still stands');
});

test('a company lets go of a member away from the game ten minutes', async () => {
  const { player, play, clock, kept, tokens } = await world('Ada', 'Ben');
  await play('Ada', 'node-overlook-social');
  await play('Ben', 'node-overlook-social');
  await player('Ada').ask('company/invite', { name: 'Ben' });
  await player('Ben').ask('company/accept', { name: 'Ada' });
  const ben = await kept.claim(tokens['Ben'] ?? '', 'node-overlook-social:Ben');
  await kept.release(ben?.account ?? '', 'node-overlook-social:Ben', null);
  clock.now += 9 * 60_000;
  await play('Ada', 'node-overlook-social');
  assert.equal((await player('Ada').roster())?.company?.members.length, 2, 'away nine minutes');
  clock.now += 2 * 60_000;
  await play('Ada', 'node-overlook-social');
  assert.equal((await player('Ada').roster()).company, null);
});

test('the Roster lists those in the same room beside the company, each with where they are and what they wear', async () => {
  const { player, play, kept, tokens, ask } = await world('Ada', 'Ben', 'Cal');
  await play('Ada', 'node-overlook-social', 12);
  await play('Ben', 'node-overlook-social', 9);
  await play('Cal', 'node-saltgrass--elite');
  const guest = (await ask('POST', '/v1/guest')).body['token'] as string;
  const held = await kept.claim(guest, 'node-overlook-social:guest');
  await kept.save(held?.account ?? '', 'node-overlook-social:guest', '{}');
  const roster = await player('Ada').roster();
  assert.deepEqual(roster.me, {
    name: 'Ada',
    tag: null,
    emblem: 'overlook',
    level: 12,
    place: 'node-overlook-social',
  });
  assert.deepEqual(names(roster.nearby), ['Ben'], 'Cal is elsewhere');
  assert.equal(roster.guests, 1, 'a guest is counted, not named');
  assert.equal(await kept.present(tokens['Cal'] ?? '', 'sea'), true);
  const cal = await kept.claim(tokens['Cal'] ?? '', 'node-saltgrass--elite:Cal');
  await kept.release(cal?.account ?? '', 'node-saltgrass--elite:Cal', null);
  await player('Ada').ask('friend/ask', { name: 'Cal' });
  await player('Cal').ask('friend/accept', { name: 'Ada' });
  assert.deepEqual((await player('Ada').roster()).friends[0]?.place, 'sea', 'at sea, as the sea room says');
  const details = (await player('Ada').details('cal')).body;
  assert.equal(details.place, 'sea', 'a friend sees where');
  assert.equal((await player('Ben').details('Cal')).body.place, null, 'another does not');
  assert.equal((await player('Ben').details('Ada')).body.shown?.level, 12, 'but sees what they wear');
});

test('a guild is founded, invites, ranks its members, and passes its founding before its founder leaves', async () => {
  const { player } = await world('Ada', 'Ben', 'Cal');
  const [ada, ben, cal] = [player('Ada'), player('Ben'), player('Cal')];
  assert.equal((await ada.ask('guild/found', { name: 'The Saltwake', tag: 'w' })).status, 400, 'a tag of 2 to 4');
  assert.equal((await ada.ask('guild/found', { name: 'The Saltwake', tag: 'swk' })).status, 200);
  assert.equal((await ben.ask('guild/found', { name: 'the saltwake', tag: 'XY' })).status, 409, 'its name is taken');
  await ada.ask('guild/invite', { name: 'Ben' });
  assert.deepEqual((await ben.roster()).guildInvites, [{ name: 'The Saltwake', tag: 'SWK', from: 'Ada' }]);
  await ben.ask('guild/accept', { tag: 'swk' });
  assert.equal((await ben.ask('guild/invite', { name: 'Cal' })).status, 403, 'a member does not invite');
  await ada.ask('guild/promote', { name: 'Ben' });
  assert.equal((await ben.ask('guild/invite', { name: 'Cal' })).status, 200, 'an admin does');
  await cal.ask('guild/accept', { tag: 'SWK' });
  const members = (await cal.roster())?.guild?.members as { name: string; rank: string; tag: string }[];
  const ranked = members.map((each) => [each.name, each.rank, each.tag]).sort();
  assert.deepEqual(ranked, [
    ['Ada', 'Founder', 'SWK'],
    ['Ben', 'Admin', 'SWK'],
    ['Cal', 'Member', 'SWK'],
  ]);
  assert.equal((await cal.ask('guild/remove', { name: 'Ben' })).status, 403, 'only those below');
  assert.equal((await ada.ask('guild/leave')).status, 409, 'the founder hands it on first');
  await ada.ask('guild/founder', { name: 'Ben' });
  assert.equal((await ada.ask('guild/leave')).status, 200);
  await ben.ask('guild/remove', { name: 'Cal' });
  await ben.ask('guild/leave');
  assert.equal((await ben.roster()).guild, null);
  assert.equal((await cal.ask('guild/found', { name: 'The Saltwake', tag: 'SWK' })).status, 200, 'it ended');
});

test('a report is kept with its reason, a few a day', async () => {
  const { player, deps } = await world('Ada', 'Ben');
  assert.equal((await player('Ada').ask('report', { name: 'Ben', reason: 'spam' })).status, 400);
  assert.equal((await player('Ada').ask('report', { name: 'Ben', reason: 'name' })).status, 200);
  const kept = await deps.database.prepare('SELECT reason FROM reports').first<{ reason: string }>();
  assert.equal(kept?.reason, 'name');
  for (let more = 0; more < 9; more++) await player('Ada').ask('report', { name: 'Ben', reason: 'other' });
  assert.equal((await player('Ada').ask('report', { name: 'Ben', reason: 'other' })).status, 429);
});

type Player = ReturnType<Awaited<ReturnType<typeof world>>['player']>;

/** Players of a world, each playing in one room. */
async function playing(...named: string[]) {
  const made = await world(...named);
  for (const name of named) await made.play(name, 'node-overlook-social');
  return { ...made, players: named.map(made.player) as [Player, Player, Player, Player, Player, Player] };
}

test('a block between the joiner and any member keeps them out, by join or by invite, answered as closed', async () => {
  const {
    players: [ada, ben, cal, dee],
  } = await playing('Ada', 'Ben', 'Cal', 'Dee');
  await ada.ask('company/privacy', { privacy: 0 });
  await cal.ask('company/join', { name: 'Ada' });
  await cal.ask('block', { name: 'Ben' });
  const joined = await ben.ask('company/join', { name: 'Ada' });
  assert.equal(joined.status, 403, 'Cal, a member, blocks Ben');
  await ada.ask('company/privacy', { privacy: 3 });
  assert.deepEqual(joined.body, (await dee.ask('company/join', { name: 'Ada' })).body, 'as a closed company');
  await ada.ask('company/invite', { name: 'Ben' });
  assert.equal((await ben.ask('company/accept', { name: 'Ada' })).status, 403, 'nor by an invite');
  assert.equal((await ben.roster()).company, null);
  await ada.ask('company/privacy', { privacy: 0 });
  await dee.ask('block', { name: 'Cal' });
  assert.equal((await dee.ask('company/join', { name: 'Ada' })).status, 403, 'nor one who blocks a member');
});

test('an invite ends when its sender joins another company', async () => {
  const {
    players: [ada, ben, cal],
  } = await playing('Ada', 'Ben', 'Cal');
  await cal.ask('company/privacy', { privacy: 3 });
  await ada.ask('company/invite', { name: 'Ben' });
  await cal.ask('company/invite', { name: 'Ada' });
  await ada.ask('company/accept', { name: 'Cal' });
  assert.deepEqual((await ben.roster()).invites, []);
  assert.equal((await ben.ask('company/accept', { name: 'Ada' })).status, 404, "so it opens no way into Cal's");
  assert.deepEqual(names((await cal.roster()).company?.members ?? []), ['Cal', 'Ada']);
});

test('a full company is refused before the one joining leaves their own', async () => {
  const {
    players: [ada, ben, cal, dee, eve, fay],
  } = await playing('Ada', 'Ben', 'Cal', 'Dee', 'Eve', 'Fay');
  await ada.ask('company/privacy', { privacy: 0 });
  await ben.ask('company/join', { name: 'Ada' });
  await cal.ask('company/join', { name: 'Ada' });
  await fay.ask('company/join', { name: 'Ada' });
  await dee.ask('company/invite', { name: 'Eve' });
  await eve.ask('company/accept', { name: 'Dee' });
  assert.equal((await eve.ask('company/join', { name: 'Ada' })).status, 409);
  assert.deepEqual(names((await eve.roster()).company?.members ?? []), ['Dee', 'Eve'], 'still in her own');
});

test('a leader and a member leaving at once leave no company of one', async () => {
  const {
    deps,
    players: [ada, ben, cal],
  } = await playing('Ada', 'Ben', 'Cal');
  await ada.ask('company/privacy', { privacy: 0 });
  await ben.ask('company/join', { name: 'Ada' });
  await cal.ask('company/join', { name: 'Ada' });
  slowly(deps);
  await Promise.all([ada.ask('company/leave'), ben.ask('company/leave')]);
  assert.equal((await cal.roster()).company, null);
});

test('the privacy shown is the leader’s, which is the one that applies', async () => {
  const {
    players: [ada, ben],
  } = await playing('Ada', 'Ben');
  await ada.ask('company/privacy', { privacy: 0 });
  await ben.ask('company/join', { name: 'Ada' });
  assert.equal((await ben.roster()).privacy, 'Public', "Ada's, though Ben's own is Friends Only");
  await ben.ask('company/leave');
  assert.equal((await ben.roster()).privacy, 'Friends Only', 'his own once alone');
});

test('a player who leaves the sea stays in the company until away ten minutes', async () => {
  const { player, play, kept, tokens, clock, deps } = await world('Ada', 'Ben');
  await play('Ada', 'node-overlook-social');
  await play('Ben', 'node-overlook-social');
  await player('Ada').ask('company/invite', { name: 'Ben' });
  await player('Ben').ask('company/accept', { name: 'Ada' });
  const ben = await deps.database.prepare("SELECT id FROM accounts WHERE username = 'Ben'").first<{ id: string }>();
  await kept.release(ben?.id ?? '', 'node-overlook-social:Ben', null);
  for (let reported = 0; reported < 40; reported++) {
    clock.now += 30_000;
    await kept.present(tokens['Ben'] ?? '', 'sea');
    await kept.present(tokens['Ada'] ?? '', 'sea');
  }
  await kept.present(tokens['Ben'] ?? '', null);
  clock.now += 5_000;
  const company = async () => (await player('Ada').roster()).company?.members ?? [];
  assert.deepEqual(names(await company()), ['Ada', 'Ben'], 'just left, after twenty minutes at sea');
  assert.equal((await company())[1]?.place, null, 'and no longer there');
  clock.now += 10 * 60_000;
  await kept.present(tokens['Ada'] ?? '', 'sea');
  assert.deepEqual(names(await company()), []);
});

test('where a player is shows to no one they did not let: not to whom they asked, nor to a guild inviting them', async () => {
  const { player, play } = await world('Ada', 'Ben', 'Cal');
  await play('Ben', 'node-saltgrass');
  await player('Ada').ask('friend/ask', { name: 'Ben' });
  assert.deepEqual(names((await player('Ada').roster()).asked), ['Ben']);
  assert.equal((await player('Ada').roster()).asked[0]?.place, null);
  await player('Cal').ask('guild/found', { name: 'The Saltwake', tag: 'SWK' });
  await player('Cal').ask('guild/invite', { name: 'Ben' });
  assert.equal((await player('Cal').roster()).guild?.invited[0]?.place, null);
});

test('one blocked sees the blocker as a stranger does, so the block shows nowhere', async () => {
  const { player, play } = await world('Ada', 'Ben', 'Cal');
  await play('Ada', 'node-saltgrass');
  await player('Ada').ask('guild/found', { name: 'The Saltwake', tag: 'SWK' });
  await player('Ada').ask('guild/invite', { name: 'Ben' });
  await player('Ben').ask('guild/accept', { tag: 'SWK' });
  assert.equal((await player('Ben').details('Ada')).body.place, 'node-saltgrass', 'a guildmate sees where');
  await player('Ada').ask('block', { name: 'Ben' });
  const [blocked, stranger] = [await player('Ben').details('Ada'), await player('Cal').details('Ada')];
  assert.equal(blocked.status, 200);
  assert.deepEqual(blocked.body, stranger.body);
  assert.equal(blocked.body.place, null);
});

test('a report takes nothing after its name in the path, so none escapes the limit', async () => {
  const { player, deps } = await world('Ada', 'Ben');
  assert.equal((await player('Ada').ask('report/x', { name: 'Ben', reason: 'other' })).status, 404);
  assert.equal((await player('Ada').ask('report/', { name: 'Ben', reason: 'other' })).status, 404);
  assert.equal((await player('Ada').ask('block/x', { name: 'Ben' })).status, 404);
  const kept = await deps.database.prepare('SELECT COUNT(*) AS count FROM reports').first<{ count: number }>();
  assert.equal(kept?.count, 0);
});

test('a founding handed to two admins at once leaves one founder', async () => {
  const { player, deps } = await world('Ada', 'Ben', 'Cal');
  const [ada, ben, cal] = [player('Ada'), player('Ben'), player('Cal')];
  await ada.ask('guild/found', { name: 'Oaks', tag: 'OAK' });
  for (const [each, name] of [
    [ben, 'Ben'],
    [cal, 'Cal'],
  ] as const) {
    await ada.ask('guild/invite', { name });
    await each.ask('guild/accept', { tag: 'OAK' });
    await ada.ask('guild/promote', { name });
  }
  slowly(deps);
  const handed = await Promise.all([
    ada.ask('guild/founder', { name: 'Ben' }),
    ada.ask('guild/founder', { name: 'Cal' }),
  ]);
  assert.deepEqual(handed.map((each) => each.status).sort(), [200, 403]);
  const ranks = (await ada.roster()).guild?.members.map((each) => each.rank) ?? [];
  assert.deepEqual(ranks.sort(), ['Admin', 'Admin', 'Founder']);
});

test("a guild's name keeps its spaces, dashes and apostrophes apart, and its motto hides nothing", async () => {
  const { player } = await world('Ada');
  const ada = player('Ada');
  const rule =
    'A guild name is 3 to 24 characters: letters and digits, starting with a letter, with single spaces, dashes or apostrophes between them.';
  for (const name of ["O''Neil", 'Two  Spaces', 'Ends-', "Sea -'Dogs", 'Ab'])
    assert.deepEqual((await ada.ask('guild/found', { name, tag: 'ON' })).body, { error: rule }, name);
  assert.equal((await ada.ask('guild/found', { name: "O'Neil's Sea-Dogs 2", tag: 'ON' })).status, 200);
  for (const motto of ['turned‮round', 'two\nlines', 'nul\u0000', 'isolated⁦'])
    assert.equal((await ada.ask('guild/motto', { motto })).status, 400, JSON.stringify(motto));
  assert.equal((await ada.ask('guild/motto', { motto: 'We sail at dawn, come what may.' })).status, 200);
});

test('an invite past its time is swept away', async () => {
  const { player, clock, ask, deps } = await world('Ada', 'Ben');
  await player('Ada').ask('company/invite', { name: 'Ben' });
  clock.now += INVITE_MS + 1;
  await ask('POST', '/v1/guest');
  const left = await deps.database.prepare('SELECT COUNT(*) AS count FROM company_invites').first<{ count: number }>();
  assert.equal(left?.count, 0);
});

test('the Roster reads no table of every account to find those in a room', async () => {
  const { player, play, deps } = await world('Ada', 'Ben');
  await play('Ada', 'node-overlook-social');
  await play('Ben', 'node-overlook-social');
  const { database } = deps;
  const read: { sql: string; values: unknown[] }[] = [];
  const watched = (sql: string) => {
    const statement = database.prepare(sql);
    return { ...statement, bind: (...values: unknown[]) => (read.push({ sql, values }), statement.bind(...values)) };
  };
  Object.assign(deps, { database: { prepare: watched } });
  assert.deepEqual(names((await player('Ada').roster()).nearby), ['Ben']);
  Object.assign(deps, { database });
  for (const { sql, values } of read) {
    const plan = await database
      .prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .bind(...values)
      .all<{ detail: string }>();
    const scans = plan.results.filter((step) => /^SCAN (accounts|characters|presence)\b/.test(step.detail));
    assert.deepEqual(scans, [], sql);
  }
});

test('a player’s companions are their company’s members, longest there first, or themselves alone', async () => {
  const { player, kept, tokens } = await world('Ada', 'Ben', 'Cal');
  await player('Ada').ask('company/invite', { name: 'Ben' });
  await player('Ben').ask('company/accept', { name: 'Ada' });
  const account = async (name: string) => (await kept.claim(tokens[name] ?? '', `room:${name}`))?.account ?? '';
  const [ada, ben, cal] = [await account('Ada'), await account('Ben'), await account('Cal')];
  assert.deepEqual(await kept.companions(ben, 'node-x--run-a1b2c3d4'), [ada, ben]);
  assert.deepEqual(await kept.companions(cal, 'node-x--run-a1b2c3d4'), [cal]);
});

test('a player’s companions in a run are their company, and those found for that run with them alone', async () => {
  const { player, kept, tokens, deps } = await world('Ada', 'Ben', 'Cal', 'Dee');
  await player('Ada').ask('company/invite', { name: 'Ben' });
  await player('Ben').ask('company/accept', { name: 'Ada' });
  const account = async (name: string) => (await kept.claim(tokens[name] ?? '', `room:${name}`))?.account ?? '';
  const [ada, ben, cal, dee] = [await account('Ada'), await account('Ben'), await account('Cal'), await account('Dee')];
  await foundRun(deps.database, 'node-krakens-grotto--run-k3j4h5g6', [cal, dee], 0);
  assert.deepEqual(await kept.companions(ben, 'node-x--run-a1b2c3d4'), [ada, ben]);
  assert.deepEqual((await kept.companions(cal, 'node-krakens-grotto--run-k3j4h5g6')).sort(), [cal, dee].sort());
  assert.deepEqual(await kept.companions(cal, 'node-krakens-grotto--run-a1b2c3d4'), [cal], 'for one run alone');
  assert.deepEqual(await kept.companions(ada, 'node-krakens-grotto--run-k3j4h5g6'), [ada, ben], 'not found for it');
});
