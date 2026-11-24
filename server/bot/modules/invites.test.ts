import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GUILD, MOD, OWNER, TARGET, guildCreate } from '../botForTests.ts';
import { recordOf } from '../law/settings.ts';
import { interactionFrom, standEngagement } from './engagementForTests.ts';
import { invitesModule } from './invites.ts';

const REPORTS = '900000000000000072';

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
