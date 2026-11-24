import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUILD, MOD_ROLE, TARGET, TEXT_CHANNEL } from '../botForTests.ts';
import { emojiOf } from '../law/message.ts';
import { actorOf, interactionFrom, standCommunity } from './communityForTests.ts';
import { type Menu, applyChoice, menuMessage, roleMenusModule } from './roleMenus.ts';

const ROLE_A = '900000000000000041';
const ROLE_B = '900000000000000042';
const MENU: Menu = {
  name: 'colours',
  channel: TEXT_CHANNEL,
  title: 'Colours',
  description: '',
  style: 'buttons',
  mode: 'toggle',
  options: [
    { role: ROLE_A, label: 'Red', emoji: '🔴' },
    { role: ROLE_B, label: '', emoji: '<:blue:900000000000000099>' },
  ],
};
type Component = { custom_id: string; label: string; emoji?: unknown; max_values?: number };
const componentsOf = (message: ReturnType<typeof menuMessage>) =>
  (message.components[0]?.components ?? []) as Component[];

test('role menus: the message each style is posted as', () => {
  const names = new Map([[ROLE_B, 'Blue']]);
  const buttons = componentsOf(menuMessage(MENU, names, '#336699'));
  assert.deepEqual(
    buttons.map((button) => [button.custom_id, button.label]),
    [
      [`bot:rolemenus:colours:${ROLE_A}`, 'Red'],
      [`bot:rolemenus:colours:${ROLE_B}`, 'Blue'],
    ],
  );
  assert.deepEqual(buttons[1]?.emoji, { id: '900000000000000099', name: 'blue', animated: false });
  const list = componentsOf(menuMessage({ ...MENU, style: 'select', mode: 'unique' }, names, '#336699'));
  assert.equal(list[0]?.max_values, 1);
  const reactions = menuMessage({ ...MENU, style: 'reactions' }, names, '#336699');
  assert.deepEqual(reactions.components, []);
  assert.match(String(reactions.embeds[0]?.description), /🔴 Red/);
  assert.equal(emojiOf(''), null);
});

test('role menus: a press toggles, one-at-a-time takes the others, kept roles stay, and only offered roles move', async () => {
  const bot = await standCommunity({}, []);
  bot.world.members.set(TARGET, { roles: [] });
  const member = () => [...(bot.world.members.get(TARGET)?.roles ?? [])];
  const choose = (menu: Menu, roles: string[], how: 'press' | 'pick' = 'press') =>
    applyChoice(bot.context, GUILD, TARGET, member(), menu, roles, how);
  await choose(MENU, [ROLE_A]);
  assert.deepEqual(member(), [ROLE_A]);
  await choose(MENU, [ROLE_A]);
  assert.deepEqual(member(), []);
  bot.world.members.set(TARGET, { roles: [ROLE_A] });
  await choose({ ...MENU, mode: 'unique' }, [ROLE_B]);
  assert.deepEqual(member(), [ROLE_B]);
  await choose({ ...MENU, mode: 'keep' }, [ROLE_B]);
  assert.deepEqual(member(), [ROLE_B], 'a kept role is not taken back');
  await choose(MENU, [MOD_ROLE]);
  assert.deepEqual(member(), [ROLE_B], 'a role the menu does not offer is never given');
  await choose(MENU, [ROLE_A], 'pick');
  assert.deepEqual(member(), [ROLE_A], "a pick sets the menu's roles to the ones picked");
  await choose(MENU, [ROLE_B, MOD_ROLE], 'pick');
  assert.deepEqual(member(), [ROLE_B], 'a pick never gives a role the menu does not offer');
});

test('role menus: publishing posts, then edits; a reactions menu reacts and answers reactions', async () => {
  const bot = await standCommunity({ rolemenus: { menus: [{ ...MENU, style: 'reactions' }] } }, [roleMenusModule]);
  const config = await bot.settingsOf('rolemenus');
  const publish = roleMenusModule.actions?.publish;
  assert.ok(publish);
  const posted = await publish(bot.context, GUILD, { name: 'colours' }, actorOf(), config);
  assert.equal(posted.message, 'The menu was posted.');
  assert.deepEqual(bot.world.reactions, ['🔴', 'blue:900000000000000099']);
  const again = await publish(bot.context, GUILD, { name: 'colours' }, actorOf(), config);
  assert.equal(again.message, 'The menu was updated.');
  assert.equal(bot.posts(TEXT_CHANNEL).length, 1, 'publishing again edits the same message');
  const messageId = bot.posts(TEXT_CHANNEL)[0]?.id;
  bot.world.members.set(TARGET, { roles: [] });
  const emoji = { name: 'blue', id: '900000000000000099' };
  await bot.send('MESSAGE_REACTION_ADD', { guild_id: GUILD, message_id: messageId, user_id: TARGET, emoji });
  assert.deepEqual(bot.world.members.get(TARGET)?.roles, [ROLE_B]);
  await bot.send('MESSAGE_REACTION_REMOVE', { guild_id: GUILD, message_id: messageId, user_id: TARGET, emoji });
  assert.deepEqual(bot.world.members.get(TARGET)?.roles, []);
  const press = interactionFrom(TARGET, { custom_id: `bot:rolemenus:colours:${ROLE_A}` }, { type: 3 });
  const pressed = await roleMenusModule.component?.(bot.context, press, ['colours', ROLE_A], config);
  assert.equal(pressed?.data?.content, `Given: <@&${ROLE_A}>.`);
  assert.equal(pressed?.data?.flags, 64);
  const gone = await roleMenusModule.component?.(bot.context, press, ['gone', ROLE_A], config);
  assert.equal(gone?.data?.content, 'This menu is no longer offered.');
});

test('role menus: publishing refuses a menu with no channel, no roles, or a reaction with no emoji', async () => {
  const bot = await standCommunity({}, []);
  const publish = roleMenusModule.actions?.publish;
  assert.ok(publish);
  const tried = async (menu: Partial<Menu>, name = 'colours') =>
    (await publish(bot.context, GUILD, { name }, actorOf(), { menus: [{ ...MENU, ...menu }] })).message;
  assert.equal(await tried({}, 'other'), 'There is no menu named other. Save it first.');
  assert.equal(await tried({ channel: '' }), "Choose the menu's channel first.");
  assert.equal(await tried({ options: [] }), 'Add at least one role first.');
  const bare = { style: 'reactions' as const, options: [{ role: ROLE_A, label: 'Red', emoji: '' }] };
  assert.equal(await tried(bare), 'Every role needs an emoji in a reactions menu.');
  bot.world.closed.add(TEXT_CHANNEL);
  assert.equal(await tried({}), 'The bot could not post in that channel.');
});
