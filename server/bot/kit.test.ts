import assert from 'node:assert/strict';
import { test } from 'node:test';
import { standGateway } from './botForTests.ts';
import {
  type BotContext,
  REPLY,
  deferred,
  durationWords,
  embed,
  holds,
  optionOf,
  parseDuration,
  pruneMemory,
  snowflakeTime,
  subcommandOf,
  topPosition,
} from './kit.ts';

test('kit: durations as people type them, and as the bot says them', () => {
  assert.equal(parseDuration('90s'), 90);
  assert.equal(parseDuration(' 1D 12h '), 129_600, 'case and spaces do not matter');
  assert.equal(parseDuration('1w'), 604_800);
  for (const bad of ['', '10', 'ten minutes', '5y', '0m', null]) assert.equal(parseDuration(bad), null, String(bad));
  assert.equal(durationWords(129_600), '1 day 12 hours');
  assert.equal(durationWords(3_661), '1 hour 1 minute', 'two parts at most');
  assert.equal(durationWords(0), '0 seconds');
});

test("kit: a slash command's option is found however deep its subcommand put it", () => {
  const interaction = {
    data: { options: [{ name: 'start', type: 1, options: [{ name: 'prize', type: 3, value: 'A ship' }] }] },
  };
  assert.equal(optionOf(interaction, 'prize'), 'A ship');
  assert.equal(optionOf(interaction, 'none'), undefined);
  assert.equal(subcommandOf(interaction), 'start');
  assert.equal(subcommandOf({}), '');
});

test('kit: permissions, role rank, ids and embeds held to their bounds', () => {
  assert.equal(holds(String(1n << 13n), 1n << 13n), true);
  assert.equal(holds(String(1n << 3n), 1n << 40n), true, 'an administrator holds every bit');
  assert.equal(holds('not a number', 1n), false);
  assert.equal(
    topPosition(
      [
        { id: 'a', position: 3 },
        { id: 'b', position: 7 },
      ],
      ['a', 'b', 'gone'],
    ),
    7,
  );
  assert.equal(snowflakeTime(String(1000n << 22n)), 1420070401000);
  const card = embed({ title: 't'.repeat(300), fields: [{ name: '', value: '' }] });
  assert.equal(card.title?.length, 256);
  assert.deepEqual(card.fields, [{ name: '-', value: '-', inline: false }]);
  const memory = new Map<string, unknown>([
    ['old', 1],
    ['new', 999_000],
  ]);
  pruneMemory(memory, 1_000_000, 10_000);
  assert.deepEqual([...memory.keys()], ['new']);
});

test("kit: a deferred answer says so at once and draws its work through the interaction's own token", async () => {
  const bot = await standGateway({});
  const later: Promise<unknown>[] = [];
  const context: BotContext = { ...bot.context, later: (work) => void later.push(work) };
  const interaction = { application_id: '900000000000000099', token: 'interaction-token' };
  const answer = deferred(context, interaction, async () => ({ content: 'Done.' }));
  assert.deepEqual(answer, { type: REPLY.DEFERRED, data: { flags: 64 } });
  const broken = deferred(context, interaction, async () => {
    throw new Error('boom');
  });
  assert.equal(broken.type, REPLY.DEFERRED);
  await Promise.all(later);
  const edits = bot.discord.calls.filter((call) => call.method === 'PATCH');
  assert.equal(edits[0]?.path, '/api/v10/webhooks/900000000000000099/interaction-token/messages/@original');
  assert.deepEqual(
    edits.map((call) => (JSON.parse(call.body) as { content: string }).content),
    ['Done.', 'Something went wrong. Try again in a minute.'],
  );
});
