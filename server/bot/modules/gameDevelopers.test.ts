import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OWNER } from '../botForTests.ts';
import { moduleOf } from '../law/modules.ts';
import { validate } from '../law/settings.ts';
import { standCommunity } from './communityForTests.ts';
import { gameModule } from './game.ts';
import { isDeveloper } from './gameDevelopers.ts';

const FOUNDER = '900000000000000401';
const DEVELOPER = '900000000000000402';
const MODERATOR = '900000000000000403';

/** The game module on with these developer roles (off where `enabled` is false), these members in the server, and the
 *  bot's owners as the deploy names them (the server's owner by default). */
async function standDevelopers(
  developers: string[],
  members: Record<string, string[]>,
  enabled = true,
  owners: string = OWNER,
) {
  const bot = await standCommunity(enabled ? { game: { developers } } : {}, [gameModule], { BOT_OWNERS: owners });
  for (const [id, roles] of Object.entries(members)) bot.world.members.set(id, { roles: [...roles] });
  return bot;
}

test('developers: a member holding a developer role is one, and one holding none, or no member, is not', async () => {
  const bot = await standDevelopers([FOUNDER, DEVELOPER], {
    '900000000000000501': [DEVELOPER],
    '900000000000000502': [FOUNDER, MODERATOR],
    '900000000000000503': [MODERATOR],
  });
  assert.equal(await isDeveloper(bot.context, '900000000000000501'), true);
  assert.equal(await isDeveloper(bot.context, '900000000000000502'), true);
  assert.equal(await isDeveloper(bot.context, '900000000000000503'), false, 'a role the setting does not name');
  assert.equal(await isDeveloper(bot.context, '900000000000000509'), false, 'not in the server');
  assert.equal(await isDeveloper(bot.context, 'not-a-snowflake'), false, 'an id that is no user is never asked');
});

test('developers: no role named, or the game module off, makes no one a developer', async () => {
  const none = await standDevelopers([], { '900000000000000501': [DEVELOPER] });
  assert.equal(await isDeveloper(none.context, '900000000000000501'), false);
  const off = await standDevelopers([DEVELOPER], { '900000000000000501': [DEVELOPER] }, false);
  assert.equal(await isDeveloper(off.context, '900000000000000501'), false);
});

test("developers: only the No Shores Discord's roles count, a server one of the bot's owners owns", async () => {
  const members = { '900000000000000501': [DEVELOPER] };
  const elsewhere = await standDevelopers([DEVELOPER], members, true, '900000000000000999');
  assert.equal(await isDeveloper(elsewhere.context, '900000000000000501'), false, 'a server no owner of the bot owns');
  const unnamed = await standDevelopers([DEVELOPER], members, true, '');
  assert.equal(await isDeveloper(unnamed.context, '900000000000000501'), false, 'a deploy that names no owner');
});

test('developers: the setting holds a list of roles, and names them as roles to read', () => {
  const shape = moduleOf('game');
  assert.ok(shape);
  const checked = validate(shape.schema, { developers: [FOUNDER, DEVELOPER] });
  assert.ok(checked.ok, JSON.stringify(checked));
});
