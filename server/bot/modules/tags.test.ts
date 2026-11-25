import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUILD, MOD_ROLE, TARGET, TEXT_CHANNEL } from '../botForTests.ts';
import { blankEmbed } from '../law/message.ts';
import { interactionFrom, standCommunity } from './communityForTests.ts';
import { tagsModule } from './tags.ts';

const words = (content: string) => ({ content, embeds: [], buttons: [] });
const TAGS_ON = {
  prefix: '!',
  tags: [
    { name: 'rules', reply: words('Be kind, {name}.'), roles: [] },
    { name: 'staff', reply: { content: '', embeds: [blankEmbed({ description: 'Staff only.' })] }, roles: [MOD_ROLE] },
    { name: 'blank', reply: words(''), roles: [] },
  ],
};
const asked = (value: string) => interactionFrom(TARGET, { name: 'tag', options: [{ type: 3, name: 'name', value }] });

test('tags: the prefix calls a tag up as a reply; a tag kept to roles answers only them; /tag offers names', async () => {
  const bot = await standCommunity({ tags: TAGS_ON }, [tagsModule]);
  const author = { id: TARGET, username: 'user12' };
  const say = (content: string, roles: string[] = []) =>
    bot.send('MESSAGE_CREATE', {
      id: '100000000000000001',
      guild_id: GUILD,
      channel_id: TEXT_CHANNEL,
      author,
      member: { roles },
      content,
    });
  await say('!rules please');
  const [first] = bot.posts(TEXT_CHANNEL);
  assert.equal(first?.content, 'Be kind, user12.');
  assert.deepEqual(first?.message_reference, { message_id: '100000000000000001', fail_if_not_exists: false });
  await say('!staff');
  assert.equal(bot.posts(TEXT_CHANNEL).length, 1);
  await say('!staff', [MOD_ROLE]);
  assert.equal((bot.posts(TEXT_CHANNEL)[1]?.embeds as Array<{ description: string }>)[0]?.description, 'Staff only.');
  await say('!blank');
  await say('rules');
  assert.equal(bot.posts(TEXT_CHANNEL).length, 2, 'a tag with nothing to say, or no prefix, posts nothing');
  const config = await bot.settingsOf('tags');
  const command = tagsModule.command;
  assert.ok(command);
  const typing = interactionFrom(
    TARGET,
    { name: 'tag', options: [{ type: 3, name: 'name', value: 'ru' }] },
    { type: 4 },
  );
  assert.deepEqual((await command(bot.context, typing, config)).data?.choices, [{ name: 'rules', value: 'rules' }]);
  assert.equal((await command(bot.context, asked('rules'), config)).data?.content, 'Be kind, user12.');
  assert.equal((await command(bot.context, asked('blank'), config)).data?.content, 'That tag has no answer yet.');
  assert.equal((await command(bot.context, asked('staff'), config)).data?.content, 'Your roles cannot use that tag.');
  assert.equal((await command(bot.context, asked('none'), config)).data?.content, 'There is no tag by that name.');
});
