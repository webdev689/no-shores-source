import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accounts } from './accountsForTests.ts';
import { characters } from './characters.ts';
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
  assert.equal((await ben.ask('fireteam/invite', { name: 'Ada' })).status, 200);
  assert.deepEqual((await ada.roster()).invites, [], 'nor does an invite');
  assert.equal((await ada.ask('friend/ask', { name: 'Ben' })).status, 409, 'Ada must unblock first');
  assert.equal((await ben.details('Ada')).status, 404, 'Ada is not found by the one she blocks');
  await ada.ask('unblock', { name: 'Ben' });
  assert.equal((await ada.ask('friend/ask', { name: 'Ben' })).status, 200);
  assert.deepEqual(names((await ben.roster()).asking), ['Ada']);
});

test('a fireteam holds three, joined by invite or as its leader allows, and its lead passes on', async () => {
  const { player, play } = await world('Ada', 'Ben', 'Cal', 'Dee');
  for (const name of ['Ada', 'Ben', 'Cal', 'Dee']) await play(name, 'node-overlook-social');
  const [ada, ben, cal, dee] = ['Ada', 'Ben', 'Cal', 'Dee'].map(player) as [
    ReturnType<typeof player>,
    ReturnType<typeof player>,
    ReturnType<typeof player>,
    ReturnType<typeof player>,
  ];
  assert.equal((await ben.ask('fireteam/join', { name: 'Ada' })).status, 403, "Friends Only: Ben is not Ada's friend");
  await ada.ask('fireteam/invite', { name: 'Ben' });
  assert.deepEqual(names((await ben.roster()).invites), ['Ada']);
  assert.equal((await ben.ask('fireteam/accept', { name: 'Ada' })).status, 200);
  const fireteam = (await cal.roster()).fireteam;
  assert.equal(fireteam, null, 'Cal is not in it');
  assert.deepEqual(names((await ben.roster()).fireteam?.members ?? []), ['Ada', 'Ben'], 'the leader first');
  await ada.ask('fireteam/privacy', { privacy: 0 });
  assert.equal((await cal.ask('fireteam/join', { name: 'Ben' })).status, 200, 'Public: anyone joins');
  assert.equal((await dee.ask('fireteam/join', { name: 'Ada' })).status, 409, 'three at most');
  assert.equal((await ben.ask('fireteam/kick', { name: 'Cal' })).status, 403, 'only the leader removes');
  assert.equal((await ada.ask('fireteam/lead', { name: 'Cal' })).status, 200);
  await cal.ask('fireteam/kick', { name: 'Ada' });
  assert.deepEqual(names((await ben.roster()).fireteam?.members ?? []), ['Cal', 'Ben']);
  await cal.ask('fireteam/leave');
  assert.equal((await ben.roster()).fireteam, null, 'a fireteam of one ends');
  await ben.ask('fireteam/privacy', { privacy: 3 });
  assert.equal((await ada.ask('fireteam/join', { name: 'Ben' })).status, 403, 'Closed');
  await ben.ask('fireteam/invite', { name: 'Ada' });
  assert.equal((await ada.ask('fireteam/accept', { name: 'Ben' })).status, 200, 'an invite still stands');
});

test('a fireteam lets go of a member away from the game ten minutes', async () => {
  const { player, play, clock, kept, tokens } = await world('Ada', 'Ben');
  await play('Ada', 'node-overlook-social');
  await play('Ben', 'node-overlook-social');
  await player('Ada').ask('fireteam/invite', { name: 'Ben' });
  await player('Ben').ask('fireteam/accept', { name: 'Ada' });
  const ben = await kept.claim(tokens['Ben'] ?? '', 'node-overlook-social:Ben');
  await kept.release(ben?.account ?? '', 'node-overlook-social:Ben', null);
  clock.now += 9 * 60_000;
  await play('Ada', 'node-overlook-social');
  assert.equal((await player('Ada').roster())?.fireteam?.members.length, 2, 'away nine minutes');
  clock.now += 2 * 60_000;
  await play('Ada', 'node-overlook-social');
  assert.equal((await player('Ada').roster()).fireteam, null);
});

test('the Roster lists those in the same room beside the fireteam, each with where they are and what they wear', async () => {
  const { player, play, kept, tokens, ask } = await world('Ada', 'Ben', 'Cal');
  await play('Ada', 'node-overlook-social', 12);
  await play('Ben', 'node-overlook-social', 9);
  await play('Cal', 'node-saltgrass--rough');
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
  const cal = await kept.claim(tokens['Cal'] ?? '', 'node-saltgrass--rough:Cal');
  await kept.release(cal?.account ?? '', 'node-saltgrass--rough:Cal', null);
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
