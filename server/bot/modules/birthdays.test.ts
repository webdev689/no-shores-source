import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TARGET, TEXT_CHANNEL } from '../botForTests.ts';
import { recordOf } from '../law/settings.ts';
import { birthdaysModule, birthdaysOn, dayNumber } from './birthdays.ts';
import { interactionFrom, standEngagement } from './engagementForTests.ts';

const CAKE = '900000000000000044';
type Stood = Awaited<ReturnType<typeof standEngagement>>;

const set = async (bot: Stood, month: number, day: number) => {
  const options = [
    {
      type: 1,
      name: 'set',
      options: [
        { type: 4, name: 'month', value: month },
        { type: 4, name: 'day', value: day },
      ],
    },
  ];
  const reply = await birthdaysModule.command?.(
    bot.context,
    interactionFrom(TARGET, { name: 'birthday', options }),
    {},
  );
  return String(reply?.data?.content);
};
const stand = async (settings: Record<string, unknown>) => {
  const bot = await standEngagement({ birthdays: settings }, [birthdaysModule]);
  bot.world.state.members.set(TARGET, []);
  return bot;
};
const firstEmbed = (post: unknown) => recordOf((recordOf(post).embeds as unknown[])[0]);

test('birthdays: 29 February is kept on the 28th in a year without it', () => {
  assert.deepEqual(birthdaysOn(new Date(Date.UTC(2027, 1, 28))), [
    [2, 28],
    [2, 29],
  ]);
  assert.deepEqual(birthdaysOn(new Date(Date.UTC(2028, 1, 28))), [[2, 28]]);
  assert.equal(dayNumber(new Date(Date.UTC(2026, 10, 18))), 20261118);
});

test("birthdays: set and checked, wished at the hour with the day's role, the role taken back next day", async () => {
  const bot = await stand({ channel: TEXT_CHANNEL, role: CAKE, hour: 9 });
  assert.match(await set(bot, 2, 30), /not a day/);
  assert.match(await set(bot, 11, 18), /18 November/);
  bot.clock.now = Date.UTC(2026, 10, 18, 8, 0);
  await birthdaysModule.minute?.(bot.context);
  assert.equal(bot.world.posts(TEXT_CHANNEL).length, 0, 'before the hour');
  bot.clock.now = Date.UTC(2026, 10, 18, 9, 1);
  await birthdaysModule.minute?.(bot.context);
  await birthdaysModule.minute?.(bot.context);
  assert.equal(bot.world.posts(TEXT_CHANNEL).length, 1, 'wished once');
  const wished = bot.world.posts(TEXT_CHANNEL)[0];
  assert.equal(firstEmbed(wished).description, `Happy birthday, <@${TARGET}>!`);
  assert.equal(recordOf(wished).content, `<@${TARGET}>`, 'named in the words, where a mention pings');
  assert.deepEqual(bot.world.state.members.get(TARGET), [CAKE]);
  assert.equal(recordOf(bot.database.raw.prepare('SELECT role_on FROM birthdays').get()).role_on, 20261118);
  bot.clock.now = Date.UTC(2026, 10, 19, 0, 1);
  await birthdaysModule.minute?.(bot.context);
  assert.deepEqual(bot.world.state.members.get(TARGET), []);
});

test("birthdays: an empty message is not sent, no bare mention, and the day's role is still given", async () => {
  const bot = await stand({ channel: TEXT_CHANNEL, role: CAKE, hour: 9, message: { content: '', embeds: [] } });
  await set(bot, 11, 18);
  bot.clock.now = Date.UTC(2026, 10, 18, 9, 1);
  await birthdaysModule.minute?.(bot.context);
  assert.equal(bot.world.posts(TEXT_CHANNEL).length, 0);
  assert.deepEqual(bot.world.state.members.get(TARGET), [CAKE]);
});

test("birthdays: the member is wished but not pinged where the server's setting says so", async () => {
  const bot = await stand({ channel: TEXT_CHANNEL, pingMember: false });
  await set(bot, 11, 18);
  bot.clock.now = Date.UTC(2026, 10, 18, 9, 1);
  await birthdaysModule.minute?.(bot.context);
  const wished = recordOf(bot.world.posts(TEXT_CHANNEL).at(-1));
  assert.equal(firstEmbed(wished).description, `Happy birthday, <@${TARGET}>!`);
  assert.deepEqual([wished.content, wished.allowed_mentions], [undefined, { users: [] }]);
});
