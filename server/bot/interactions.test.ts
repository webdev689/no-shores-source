import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUILD, bodyOf, standWorker } from './botForTests.ts';
import type { ServerModule } from './modules/module.ts';

/** A module with a command whose options are suggested as they are typed. */
const suggester: ServerModule = {
  id: 'tags',
  commands: [{ name: 'tag', description: 'A tag' }],
  command: async () => ({ type: 8, data: { choices: [{ name: 'rules', value: 'rules' }] } }),
};

test('interactions: options typed into a command the bot cannot answer get no suggestions, never a message', async () => {
  const bot = await standWorker({ modules: [suggester] });
  const ask = async (interaction: unknown) => bodyOf(await bot.call(await bot.keys.signed(interaction)));
  const noChoices = { type: 8, data: { choices: [] } };
  assert.deepEqual(await ask({ type: 4, guild_id: GUILD, data: { name: 'tag' } }), noChoices, 'its module is off');
  assert.deepEqual(await ask({ type: 4, guild_id: GUILD, data: { name: 'nothing' } }), noChoices, 'no module owns it');
  assert.deepEqual(await ask({ type: 4, data: { name: 'tag' } }), noChoices, 'outside a server');
  const sent = await ask({ type: 2, guild_id: GUILD, data: { name: 'tag' } });
  assert.match((sent.data as { content: string }).content, /Tags is off in this server/, 'the command is told why');
  const turnedOn = await standWorker({ modules: [suggester] });
  turnedOn.database.raw
    .prepare("INSERT INTO guild_config (guild_id, module, config, enabled, updated_at) VALUES (?, 'tags', '{}', 1, 1)")
    .run(GUILD);
  const typed = await turnedOn.keys.signed({ type: 4, guild_id: GUILD, data: { name: 'tag' } });
  assert.deepEqual(await bodyOf(await turnedOn.call(typed)), {
    type: 8,
    data: { choices: [{ name: 'rules', value: 'rules' }] },
  });
});
