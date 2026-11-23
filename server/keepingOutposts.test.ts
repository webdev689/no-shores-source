import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Claimed } from './accounts/characters.ts';
import { ACCOUNTS_TROUBLE, ANOTHER_GUILD, Keeper } from './keeping.ts';
import { roomOf } from './keepingForTests.ts';

const GUILD = '0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9';
const ROOM = 'node-oakfast-landing--guild-0a1b2c3d4e5f60718293a4b5c6d7e8f9';

/** Accounts whose tokens are their accounts' names: each one's guild, each one's company, and whether they answer. */
function accounts(guilds: Record<string, string>, companies: Record<string, string[]>, answering = () => true) {
  const claimed = (token: string): Claimed => ({ account: token, body: '{}', from: null, name: null, tag: null });
  const asked = <T>(answer: T) => (answering() ? Promise.resolve(answer) : Promise.reject(new Error('down')));
  return {
    look: (token: string) => asked(claimed(token)),
    claim: (token: string) => asked(claimed(token)),
    save: () => asked(true),
    release: () => asked(true),
    launched: () => asked(true),
    companions: (account: string) => asked(companies[account] ?? [account]),
    guild: (account: string) => {
      const id = guilds[account];
      return asked(id ? { id, done: [], beforeTheWeek: true, boons: { xp: 0, aurem: 0, reputation: 0 } } : null);
    },
  };
}

async function joins(keeper: Keeper, room: ReturnType<typeof roomOf>, player: number, token: string) {
  room.held.set(player, '{}');
  return keeper.signIn(
    player,
    token,
    () => 0,
    () => true,
  );
}

test('a guild’s outpost admits its members, and anyone in a company with a member already in it', async () => {
  const kept = accounts({ ada: GUILD, eve: 'ffff0000-0000' }, { ben: ['ben', 'ada'], cal: ['cal', 'dan'] });
  const room = roomOf();
  const sent: [number, string | undefined][] = [];
  const keeper = new Keeper(
    kept,
    room,
    ROOM,
    (player, why) => sent.push([player, why]),
    () => Promise.resolve(),
  );
  keeper.forGuild('0a1b2c3d4e5f60718293a4b5c6d7e8f9');
  assert.equal(await joins(keeper, room, 1, 'ben'), false, 'Ada’s company, before she is in');
  assert.equal(await joins(keeper, room, 2, 'ada'), true, 'a member');
  assert.equal(await joins(keeper, room, 3, 'ben'), true, 'in a company with Ada, who is in');
  assert.equal(await joins(keeper, room, 4, 'cal'), false, 'a company with no member');
  assert.equal(await joins(keeper, room, 5, 'eve'), false, 'another guild’s member');
  assert.deepEqual(sent, [
    [1, ANOTHER_GUILD],
    [4, ANOTHER_GUILD],
    [5, ANOTHER_GUILD],
  ]);
});

test('a guild’s outpost keeps no one while the accounts cannot say whose it is', async () => {
  let up = true;
  const kept = accounts({ ada: GUILD }, {}, () => up);
  const room = roomOf();
  const sent: [number, string | undefined, boolean | undefined][] = [];
  const keeper = new Keeper(
    kept,
    room,
    ROOM,
    (player, why, again) => sent.push([player, why, again]),
    () => Promise.resolve(),
  );
  keeper.forGuild('0a1b2c3d4e5f60718293a4b5c6d7e8f9');
  up = false;
  assert.equal(await joins(keeper, room, 1, 'ada'), false);
  assert.deepEqual(sent, [[1, ACCOUNTS_TROUBLE, true]], 'sent to join again');
});

test('the wild site keeps anyone, as any node’s room does', async () => {
  const room = roomOf();
  const keeper = new Keeper(
    accounts({}, {}),
    room,
    'node-oakfast-landing',
    () => undefined,
    () => Promise.resolve(),
  );
  assert.equal(await joins(keeper, room, 1, 'cal'), true);
});
