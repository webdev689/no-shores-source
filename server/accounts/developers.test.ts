import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accounts } from './accountsForTests.ts';
import { characters } from './characters.ts';

const DISCORD = '900000000000000601';

/** A guest's session, then its account linked to `discord` (none: left a guest), and the characters on that world
 *  with a bot that answers as `answer` does, counting what it is asked. */
async function standDeveloper(discord: string | null, answer: (id: string) => Promise<boolean>) {
  const world = accounts();
  const guest = await world.ask('POST', '/v1/guest');
  const token = String(guest.body.token);
  const seen = await world.ask('GET', '/v1/me', undefined, token);
  const account = String((seen.body.account as { id: string }).id);
  if (discord !== null)
    await world.deps.database.prepare('UPDATE accounts SET discord_id = ?1 WHERE id = ?2').bind(discord, account).run();
  const asked: string[] = [];
  const bot = {
    developer: (id: string) => {
      asked.push(id);
      return answer(id);
    },
  };
  const kept = characters(
    world.deps.database,
    () => world.clock.now,
    () => Promise.resolve(),
    bot,
  );
  return { kept, token, account, asked };
}

test('a developer is an account whose Discord the bot says holds a developer role', async () => {
  const yes = await standDeveloper(DISCORD, () => Promise.resolve(true));
  assert.deepEqual(await yes.kept.developer(yes.token), { account: yes.account, name: null });
  assert.deepEqual(yes.asked, [DISCORD], 'the bot is asked of the linked Discord account');
  const refused = await standDeveloper(DISCORD, () => Promise.resolve(false));
  assert.equal(await refused.kept.developer(refused.token), null);
});

test('no Discord, no session, or a bot that does not answer is no developer', async () => {
  const guest = await standDeveloper(null, () => Promise.resolve(true));
  assert.equal(await guest.kept.developer(guest.token), null);
  assert.deepEqual(guest.asked, [], 'an account with no Discord is never asked about');
  const down = await standDeveloper(DISCORD, () => Promise.reject(new Error('the bot is down')));
  assert.equal(await down.kept.developer(down.token), null);
  assert.equal(await down.kept.developer('0'.repeat(64)), null, 'a token that is no session');
});
