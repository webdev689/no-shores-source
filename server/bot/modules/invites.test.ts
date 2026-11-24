import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUILD, MEMBER, MOD, OWNER, TARGET, countOf, guildCreate } from '../botForTests.ts';
import { recordOf } from '../law/settings.ts';
import { writeConfig } from '../store.ts';
import { interactionFrom, standEngagement } from './engagementForTests.ts';
import { invitesModule } from './invites.ts';

const REPORTS = '900000000000000072';
const OTHER = '900000000000000013';

test('invites: the invite whose count rose is the one a new member used, and it is counted', async () => {
  const bot = await standEngagement({ invites: { channel: REPORTS } }, [invitesModule]);
  let invites = [
    { code: 'abc', uses: 3, inviter: { id: MOD } },
    { code: 'xyz', uses: 1, inviter: { id: OWNER } },
  ];
  bot.world.state.extra = [['GET', /^\/guilds\/\d+\/invites$/, () => Response.json(invites)]];
  await bot.send('GUILD_CREATE', guildCreate({ channels: [{ id: REPORTS, name: 'joins', type: 0, position: 0 }] }));
  invites = [
    { code: 'abc', uses: 4, inviter: { id: MOD } },
    { code: 'xyz', uses: 1, inviter: { id: OWNER } },
  ];
  await bot.send('GUILD_MEMBER_ADD', { guild_id: GUILD, user: { id: TARGET, username: 'user12' }, roles: [] });
  const row = recordOf(bot.database.raw.prepare('SELECT * FROM invite_joins').get());
  assert.deepEqual([row.user_id, row.inviter_id, row.code], [TARGET, MOD, 'abc']);
  const report = recordOf((recordOf(bot.world.posts(REPORTS)[0]).embeds as unknown[])[0]);
  assert.match(String(report.description), /used abc, made by/);
  const asked = interactionFrom(TARGET, { name: 'invites', options: [{ type: 6, name: 'member', value: MOD }] });
  const reply = await invitesModule.command?.(bot.context, asked, {});
  assert.equal(reply?.data?.content, `<@${MOD}> has brought 1 member.`);
  const top = await invitesModule.views?.top?.(bot.context, GUILD, new URLSearchParams());
  assert.deepEqual(top?.rows, [{ inviter: MOD, joins: 1 }]);
});

test('invites: counts never read, or read before the module was last turned on, credit no one', async () => {
  const bot = await standEngagement({ invites: { channel: REPORTS } }, [invitesModule]);
  let invites = [
    { code: 'abc', uses: 3, inviter: { id: MOD } },
    { code: 'xyz', uses: 1, inviter: { id: OWNER } },
  ];
  bot.world.state.extra = [['GET', /^\/guilds\/\d+\/invites$/, () => Response.json(invites)]];
  const joins = () =>
    bot.database.raw
      .prepare('SELECT user_id, code FROM invite_joins')
      .all()
      .map((row) => ({ ...row }));
  const join = (userId: string) =>
    bot.send('GUILD_MEMBER_ADD', { guild_id: GUILD, user: { id: userId, username: 'someone' }, roles: [] });
  await join(TARGET);
  assert.deepEqual(joins(), [], 'no counts were read while the module was on');
  // turned off; a member joins by abc unheard; turned on again; the next member joins by xyz
  const config = await bot.configOf('invites');
  bot.clock.now += 60_000;
  const nowS = Math.floor(bot.clock.now / 1000);
  const save = (enabled: boolean, rev: number) =>
    writeConfig(bot.database, { guildId: GUILD, moduleId: 'invites', config, enabled, rev, by: OWNER, nowS });
  await save(false, 1);
  await save(true, 2);
  bot.dispatcher.forget(GUILD, 'invites');
  bot.clock.now += 1000;
  invites = [
    { code: 'abc', uses: 4, inviter: { id: MOD } },
    { code: 'xyz', uses: 2, inviter: { id: OWNER } },
  ];
  await join(MEMBER);
  assert.deepEqual(joins(), [], 'counts read before it was turned on are not trusted');
  invites = [
    { code: 'abc', uses: 4, inviter: { id: MOD } },
    { code: 'xyz', uses: 3, inviter: { id: OWNER } },
  ];
  await join(OTHER);
  assert.deepEqual(joins(), [{ user_id: OTHER, code: 'xyz' }], 'counts read since are');
});

test('invites: a join that more than one invite could explain is credited to no one', async () => {
  const bot = await standEngagement({ invites: {} }, [invitesModule]);
  let invites = [
    { code: 'abc', uses: 3, inviter: { id: MOD } },
    { code: 'xyz', uses: 1, inviter: { id: OWNER } },
  ];
  bot.world.state.extra = [['GET', /^\/guilds\/\d+\/invites$/, () => Response.json(invites)]];
  await bot.send('GUILD_CREATE', guildCreate());
  invites = [
    { code: 'abc', uses: 4, inviter: { id: MOD } },
    { code: 'xyz', uses: 3, inviter: { id: OWNER } },
  ];
  await bot.send('GUILD_MEMBER_ADD', { guild_id: GUILD, user: { id: TARGET, username: 'user12' }, roles: [] });
  assert.equal(countOf(bot.database, 'SELECT COUNT(*) AS count FROM invite_joins'), 0);
});
