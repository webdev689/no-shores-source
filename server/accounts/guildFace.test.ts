import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Banner, bannerOfName } from '../../client/src/game/guild/bannerLaw.ts';
import { accounts } from './accountsForTests.ts';
import { faceAsk } from './guildFace.ts';
import { guildOf } from './guilds.ts';

/** A world of named players, each able to ask of the Roster and read their guild. */
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
    guild: async () =>
      (await made.ask('GET', '/v1/guild', undefined, tokens[name])).body['guild'] as Record<string, unknown> | null,
    roster: async () => (await made.ask('GET', '/v1/roster', undefined, tokens[name])).body,
    details: async (whose: string) => (await made.ask('GET', `/v1/players/${whose}`, undefined, tokens[name])).body,
  });
  return { ...made, player };
}

const NAVY_ANCHOR: Banner = {
  cut: 'swallowtail',
  cloth: 'navy',
  device: 'halves',
  deviceColour: 'gold',
  sign: 'anchor',
  signColour: 'salt',
  ground: 'roundel',
  groundColour: 'crimson',
  staff: 'driftwood',
};

/** A guild of three: Ada founds it, Ben is its admin and Cal a member. */
async function guildOfThree() {
  const made = await world('Ada', 'Ben', 'Cal');
  const [ada, ben, cal] = [made.player('Ada'), made.player('Ben'), made.player('Cal')];
  await ada.ask('guild/found', { name: 'Salt Kings', tag: 'SALT' });
  for (const [name, joiner] of [
    ['Ben', ben],
    ['Cal', cal],
  ] as const) {
    await ada.ask('guild/invite', { name });
    await joiner.ask('guild/accept', { tag: 'SALT' });
  }
  await ada.ask('guild/promote', { name: 'Ben' });
  return { ...made, ada, ben, cal };
}

test('a guild founded without a banner hangs the one its name draws, and its tab reads it at level 1', async () => {
  const { ada } = await guildOfThree();
  const guild = await ada.guild();
  assert.deepEqual(guild?.['banner'], bannerOfName('Salt Kings'));
  assert.equal(guild?.['level'], 1);
  assert.equal(guild?.['members'], 3);
  assert.equal(guild?.['nextXp'], 15_000, 'level 2 is 15,000 XP away');
  assert.match(String(guild?.['key']), /^[0-9a-f]{32}$/, "its key names its outposts' rooms");
});

test('a guild founded with its own banner keeps it, and one breaking the banner law is not founded', async () => {
  const { player } = await world('Ada', 'Ben');
  const refused = await player('Ben').ask('guild/found', {
    name: 'Brine Wolves',
    tag: 'BW',
    banner: { ...NAVY_ANCHOR, deviceColour: 'navy' },
  });
  assert.equal(refused.status, 400);
  assert.equal(refused.body['error'], 'Give the device a colour unlike the cloth.');
  assert.equal(await player('Ben').guild(), null, 'nothing was founded');
  await player('Ada').ask('guild/found', { name: 'Salt Kings', tag: 'SALT', banner: NAVY_ANCHOR });
  assert.deepEqual((await player('Ada').guild())?.['banner'], NAVY_ANCHOR);
});

test('the founder and admins set the banner and the description; a member cannot', async () => {
  const { ada, ben, cal } = await guildOfThree();
  assert.equal((await ben.ask('guild/banner', { banner: NAVY_ANCHOR })).status, 200, 'an admin may');
  assert.deepEqual((await cal.guild())?.['banner'], NAVY_ANCHOR, 'every member sees it');
  assert.equal((await cal.ask('guild/banner', { banner: bannerOfName('x') })).status, 403);
  assert.equal((await ada.ask('guild/description', { description: '  Sail fast, pay no Tithe.  ' })).status, 200);
  assert.equal((await cal.guild())?.['description'], 'Sail fast, pay no Tithe.', 'kept without its spaces round it');
  assert.equal((await cal.ask('guild/description', { description: 'Mine now.' })).status, 403);
});

test('a banner breaking the law, or on a staff not yet earned, is refused in words', async () => {
  const { ada } = await guildOfThree();
  const asked = async (banner: object) => (await ada.ask('guild/banner', { banner })).body['error'];
  assert.equal(await asked({ ...NAVY_ANCHOR, signColour: 'crimson' }), 'Give the sign a colour unlike its ground.');
  assert.equal(
    await asked({ ...NAVY_ANCHOR, ground: 'none', signColour: 'gold' }),
    'Give the sign a colour unlike the cloth behind it.',
    'with no ground the sign sits on the cloth and its device',
  );
  assert.equal(await asked({ ...NAVY_ANCHOR, staff: 'gilded' }), 'Your guild has not yet earned that staff.');
  assert.equal(await asked({ ...NAVY_ANCHOR, sign: 'dragon' }), 'That banner has a part we do not know.');
  assert.equal(await asked({ cut: 'square' }), 'That is not a banner.');
});

test('a description past its length is refused, and one holding hidden marks too', async () => {
  const { ada } = await guildOfThree();
  const long = await ada.ask('guild/description', { description: 'a'.repeat(301) });
  assert.equal(long.body['error'], 'A description is 300 characters at most.');
  assert.equal((await ada.ask('guild/description', { description: 'fine‮hidden' })).status, 400);
});

test('an admin demoted before their write lands cannot set the banner, as the write reads the rank itself', async () => {
  const { deps, ben, ada } = await guildOfThree();
  const ids = (await deps.database.prepare('SELECT id, username FROM accounts').all<{ id: string; username: string }>())
    .results;
  const benId = ids.find((row) => row.username === 'Ben')?.id ?? '';
  const asAdmin = await guildOf(deps.database, benId);
  assert.equal(asAdmin?.rank, 1);
  await ada.ask('guild/demote', { name: 'Ben' });
  const late = await faceAsk(deps.database, benId, 'banner', { banner: NAVY_ANCHOR }, asAdmin!);
  assert.equal(late?.status, 403);
  assert.notDeepEqual((await ben.guild())?.['banner'], NAVY_ANCHOR);
});

test("the Roster's guild and another member's details carry the banner and level", async () => {
  const { ada, cal } = await guildOfThree();
  await ada.ask('guild/banner', { banner: NAVY_ANCHOR });
  const roster = (await cal.roster())['guild'] as Record<string, unknown>;
  assert.deepEqual(roster['banner'], NAVY_ANCHOR);
  assert.equal(roster['level'], 1);
  const details = (await cal.details('Ada'))['guild'] as Record<string, unknown>;
  assert.deepEqual(details['banner'], NAVY_ANCHOR);
  assert.equal(details['level'], 1);
});
