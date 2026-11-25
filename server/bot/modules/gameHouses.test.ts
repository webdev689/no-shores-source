import assert from 'node:assert/strict';
import { test } from 'node:test';
import { moduleOf } from '../law/modules.ts';
import { validate } from '../law/settings.ts';
import { GUILD } from '../botForTests.ts';
import { standCommunity } from './communityForTests.ts';
import { gameModule } from './game.ts';
import { HOUSES_MINUTE, HOUSE_CHANGES_A_SWEEP } from './gameHouses.ts';

const STORM = '900000000000000201';
const LAMP = '900000000000000202';
const OTHER = '900000000000000209';
const HOUSES = [
  { faction: 'Stormcallers', role: STORM },
  { faction: 'Lamplighters', role: LAMP },
  { faction: 'The Veiled', role: '' },
];
/** A minute of the clock when the house roles are swept. */
const SWEEP_AT = Date.UTC(2026, 10, 25, 12, HOUSES_MINUTE);

/** The accounts' binding, answering each member's house from `houses` (absent: linked to no account). */
function fakeAccounts(houses: Map<string, string | null>) {
  const asked: string[][] = [];
  const state = { down: false };
  return {
    asked,
    state,
    linked: () => Promise.resolve(null),
    pledges(discordIds: string[]): Promise<Record<string, string | null>> {
      asked.push(discordIds);
      if (state.down) return Promise.reject(new Error('the accounts are down'));
      const linked = discordIds.filter((id) => houses.has(id));
      return Promise.resolve(Object.fromEntries(linked.map((id) => [id, houses.get(id) ?? null])));
    },
  };
}

/** The game module on with the house roles, these members in the server, and the clock at a sweep's minute. */
async function standHouses(members: Record<string, string[]>, houses: Map<string, string | null>) {
  const accounts = fakeAccounts(houses);
  const bot = await standCommunity({ game: { houses: HOUSES } }, [gameModule], { ACCOUNTS: accounts });
  for (const [id, roles] of Object.entries(members)) bot.world.members.set(id, { roles: [...roles] });
  bot.clock.now = SWEEP_AT;
  const sweep = async (laterMs = 0) => {
    bot.clock.now = SWEEP_AT + laterMs;
    await gameModule.minute?.(bot.context);
  };
  const rolesOf = (id: string) => bot.world.members.get(id)?.roles ?? [];
  return { ...bot, accounts, sweep, rolesOf };
}

test("houses: a linked member who joins gets their house's role; one not linked gets none", async () => {
  const bot = await standHouses({}, new Map([['900000000000000301', 'Lamplighters']]));
  for (const id of ['900000000000000301', '900000000000000302'])
    await bot.send('GUILD_MEMBER_ADD', { guild_id: GUILD, user: { id, username: 'ann' }, roles: [] });
  assert.deepEqual(bot.rolesOf('900000000000000301'), [LAMP]);
  assert.deepEqual(bot.rolesOf('900000000000000302'), []);
});

test('houses: a sweep moves a switched house, takes them from the unlinked and unpledged, and keeps other roles', async () => {
  const members = {
    '900000000000000301': [STORM],
    '900000000000000302': [LAMP, OTHER],
    '900000000000000303': [STORM],
    '900000000000000304': [STORM, OTHER],
    '900000000000000305': [],
  };
  const pledged = new Map<string, string | null>([
    ['900000000000000301', 'Lamplighters'],
    ['900000000000000303', null],
    ['900000000000000304', 'The Veiled'],
    ['900000000000000305', 'Stormcallers'],
  ]);
  const bot = await standHouses(members, pledged);
  bot.world.members.set('900000000000000306', { roles: [STORM], bot: true });
  await bot.sweep();
  assert.deepEqual(bot.rolesOf('900000000000000301'), [LAMP], 'a switch of house moves the role');
  assert.deepEqual(bot.rolesOf('900000000000000302'), [OTHER], 'unlinked loses the house role, keeps the other');
  assert.deepEqual(bot.rolesOf('900000000000000303'), [], 'pledged to none holds no house role');
  assert.deepEqual(bot.rolesOf('900000000000000304'), [OTHER], 'a house with no role set gives none');
  assert.deepEqual(bot.rolesOf('900000000000000305'), [STORM]);
  assert.deepEqual(bot.rolesOf('900000000000000306'), [STORM], 'a bot is never touched');
  assert.equal(bot.accounts.asked.length, 1, 'one ask of the accounts for the page');
  assert.ok(!bot.accounts.asked.flat().includes('900000000000000306'), 'a bot is not asked about');
});

test('houses: while the accounts cannot answer, no role changes', async () => {
  const bot = await standHouses({ '900000000000000301': [STORM] }, new Map([['900000000000000301', 'Lamplighters']]));
  bot.accounts.state.down = true;
  await bot.sweep();
  await bot.send('GUILD_MEMBER_ADD', { guild_id: GUILD, user: { id: '900000000000000302' }, roles: [] });
  assert.deepEqual(bot.rolesOf('900000000000000301'), [STORM]);
  assert.deepEqual(bot.rolesOf('900000000000000302'), []);
  assert.ok(bot.lines.some((line) => line.includes('the accounts are down')));

  const before = await standCommunity({ game: { houses: HOUSES } }, [gameModule], {
    ACCOUNTS: { linked: () => Promise.resolve(null) },
  });
  before.world.members.set('900000000000000301', { roles: [STORM] });
  before.clock.now = SWEEP_AT;
  await gameModule.minute?.(before.context);
  assert.deepEqual(before.world.members.get('900000000000000301')?.roles, [STORM], 'accounts with no pledges');
});

test('houses: one sweep makes a bounded number of changes, and the next sweep is ten minutes on', async () => {
  const members: Record<string, string[]> = {};
  const pledged = new Map<string, string | null>();
  for (let index = 0; index < HOUSE_CHANGES_A_SWEEP + 10; index += 1) {
    const id = String(900000000000001000n + BigInt(index));
    members[id] = [];
    pledged.set(id, 'Stormcallers');
  }
  const bot = await standHouses(members, pledged);
  const holding = () => Object.keys(members).filter((id) => bot.rolesOf(id).includes(STORM)).length;
  await bot.sweep();
  assert.equal(holding(), HOUSE_CHANGES_A_SWEEP);
  await bot.sweep(60_000);
  await bot.sweep(9 * 60_000);
  assert.equal(holding(), HOUSE_CHANGES_A_SWEEP, 'no sweep before ten minutes are up');
  await bot.sweep(10 * 60_000);
  assert.equal(holding(), HOUSE_CHANGES_A_SWEEP + 10);
});

test('houses: a sweep reads every page of members and asks the accounts a page at a time', async () => {
  const members: Record<string, string[]> = {};
  for (let index = 0; index <= 1000; index += 1) members[String(900000000000010000n + BigInt(index))] = [];
  const last = String(900000000000010000n + 1000n);
  members[last] = [LAMP];
  const bot = await standHouses(members, new Map());
  await bot.sweep();
  assert.deepEqual(bot.rolesOf(last), []);
  assert.deepEqual(
    bot.accounts.asked.map((ids) => ids.length),
    [1000, 1],
  );
});

test('houses: a role Discord refuses is logged once a sweep, and the other houses carry on', async () => {
  const members = { '900000000000000301': [], '900000000000000302': [], '900000000000000303': [] };
  const pledged = new Map<string, string | null>([
    ['900000000000000301', 'Stormcallers'],
    ['900000000000000302', 'Stormcallers'],
    ['900000000000000303', 'Lamplighters'],
  ]);
  const bot = await standHouses(members, pledged);
  bot.world.refusedRoles.add(STORM);
  await bot.sweep();
  assert.deepEqual(bot.rolesOf('900000000000000303'), [LAMP]);
  assert.equal(bot.lines.filter((line) => line.includes(STORM)).length, 1);
});

test('houses: a house is named once at most', () => {
  const schema = moduleOf('game')?.schema ?? {};
  const twice = [
    { faction: 'Stormcallers', role: STORM },
    { faction: 'Stormcallers', role: LAMP },
  ];
  assert.equal(validate(schema, { houses: twice }).ok, false);
  assert.equal(validate(schema, { houses: HOUSES }).ok, true);
});
