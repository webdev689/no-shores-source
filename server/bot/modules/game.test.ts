import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LinkedCharacter } from '../../accounts/linked.ts';
import { GUILD, TARGET, TEXT_CHANNEL } from '../botForTests.ts';
import { registryOf } from '../registry.ts';
import { slotsFor } from '../slots.ts';
import { interactionFrom, standCommunity } from './communityForTests.ts';
import { GAME_URL, gameModule } from './game.ts';
import { tagsModule } from './tags.ts';

const words = (content: string) => ({ content, embeds: [], buttons: [] });
const ASKING = words('{character} {character_level} {character_faction}');
const LINKED = '900000000000000013';
const TROUBLED = '900000000000000014';

/** The accounts' binding: one member linked and pledged, one linked with nothing pledged, one whose ask fails. */
const accounts = {
  linked(discordId: string): Promise<LinkedCharacter | null> {
    if (discordId === TROUBLED) return Promise.reject(new Error('the accounts are down'));
    if (discordId === LINKED) return Promise.resolve({ name: 'Ann', level: 7, faction: 'Stormcallers' });
    if (discordId === TARGET) return Promise.resolve({ name: 'Bo', level: null, faction: null });
    return Promise.resolve(null);
  },
};

test('game: a linked member fills the character placeholders; a member not linked gets the setting', async () => {
  const bot = await standCommunity({ game: { notLinked: 'not linked yet' } }, [gameModule], { ACCOUNTS: accounts });
  const registry = registryOf([gameModule]);
  const fill = (id: string) => slotsFor(bot.context, GUILD, { id, username: 'x' }, ASKING, {}, {}, registry);
  const linked = await fill(LINKED);
  assert.deepEqual([linked.character, linked.character_level, linked.character_faction], ['Ann', '7', 'Stormcallers']);
  const unpledged = await fill(TARGET);
  assert.deepEqual([unpledged.character, unpledged.character_level, unpledged.character_faction], ['Bo', '', '']);
  const stranger = await fill('900000000000000015');
  assert.deepEqual(
    [stranger.character, stranger.character_level, stranger.character_faction],
    ['not linked yet', 'not linked yet', 'not linked yet'],
  );
  const troubled = await fill(TROUBLED);
  assert.equal(troubled.character, 'not linked yet', 'the accounts failing reads as not linked');
  assert.ok(bot.lines.some((line) => line.includes('the accounts are down')));
});

test('game: with no accounts binding the placeholders fill with the setting and nothing fails', async () => {
  const bot = await standCommunity(
    { game: {}, tags: { prefix: '!', tags: [{ name: 'me', reply: ASKING, roles: [] }] } },
    [gameModule, tagsModule],
  );
  await bot.send('MESSAGE_CREATE', {
    id: '100000000000000001',
    guild_id: GUILD,
    channel_id: TEXT_CHANNEL,
    author: { id: LINKED, username: 'ann' },
    member: { roles: [] },
    content: '!me',
  });
  assert.equal(bot.posts(TEXT_CHANNEL).length, 0, 'a message filled with nothing posts nothing');
  const registry = registryOf([gameModule]);
  const filled = await slotsFor(bot.context, GUILD, { id: LINKED }, ASKING, {}, {}, registry);
  assert.deepEqual([filled.character, filled.character_level, filled.character_faction], ['', '', '']);
});

test("game: /link says privately how to link, in the account tab's own words", async () => {
  const bot = await standCommunity({ game: {} }, [gameModule]);
  const command = gameModule.command;
  assert.ok(command);
  const answer = await command(bot.context, interactionFrom(TARGET, { name: 'link' }), await bot.settingsOf('game'));
  assert.equal(answer.data?.flags, 64);
  assert.match(String(answer.data?.content), new RegExp(GAME_URL.replaceAll('.', '\\.')));
  assert.match(String(answer.data?.content), /Account.*Sign in or link with Discord/);
});

test('game: where the module is off, no character fills, linked or not', async () => {
  const bot = await standCommunity({}, [gameModule], { ACCOUNTS: accounts });
  const filled = await slotsFor(bot.context, GUILD, { id: LINKED }, ASKING, {}, {}, registryOf([gameModule]));
  assert.deepEqual([filled.character, filled.character_level, filled.character_faction], ['', '', '']);
});
