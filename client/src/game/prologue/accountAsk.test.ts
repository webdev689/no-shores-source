import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Account } from '../../network/accounts.ts';
import { BROWSERS_SIGN_INS, type KeptSignIn, useSignIns } from '../../ui/page.ts';
import { OUT_OF_REACH, type Accounts, askAccounts, backAtHelm, discordAway, goingOn, markHelm } from './accountAsk.ts';

const guest: Account = { id: 'g1', username: null, discord: false, guest: true };

/** Accounts that answer as told, and remember what they were asked. */
function accounts(answers: {
  readonly session?: Account | null;
  readonly register?: Account | string;
  readonly login?: Account | string;
}): Accounts & { readonly asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    session: async () => (asked.push('session'), answers.session === undefined ? guest : answers.session),
    register: async (name, password) => (asked.push(`register ${name} ${password}`), answers.register ?? 'unset'),
    login: async (name, password) => (asked.push(`login ${name} ${password}`), answers.login ?? 'unset'),
  };
}

test('creating an account makes the guest first, then names it', async () => {
  const named: Account = { ...guest, username: 'Wren', guest: false };
  const link = accounts({ register: named });
  assert.deepEqual(await askAccounts(link, 'create', 'Wren', 'hunter22'), { kind: 'account', username: 'Wren' });
  assert.deepEqual(link.asked, ['session', 'register Wren hunter22']);
});

test('a taken or refused name comes back in the accounts own words', async () => {
  const taken = accounts({ register: 'That username is taken.' });
  assert.equal(await askAccounts(taken, 'create', 'Wren', 'hunter22'), 'That username is taken.');
  const refused = accounts({ register: 'That name is not allowed. Choose another.' });
  assert.equal(await askAccounts(refused, 'create', 'x', 'y'), 'That name is not allowed. Choose another.');
  const wrong = accounts({ login: 'Wrong username or password.' });
  assert.equal(await askAccounts(wrong, 'sign in', 'Wren', 'nope'), 'Wrong username or password.');
});

test('signing in takes the account signed in to', async () => {
  const link = accounts({ login: { ...guest, id: 'a2', username: 'Wren', guest: false } });
  assert.deepEqual(await askAccounts(link, 'sign in', 'Wren', 'hunter22'), { kind: 'account', username: 'Wren' });
  assert.deepEqual(link.asked, ['login Wren hunter22']);
});

test('a guest plays on, and a named session plays on as its account', async () => {
  assert.deepEqual(await askAccounts(accounts({}), 'guest', '', ''), { kind: 'guest' });
  const named = accounts({ session: { ...guest, username: 'Wren', guest: false } });
  assert.deepEqual(await askAccounts(named, 'guest', '', ''), { kind: 'account', username: 'Wren' });
});

test('with the accounts out of reach, nothing is asked past the session and the player is told', async () => {
  const offline = accounts({ session: null });
  assert.equal(await askAccounts(offline, 'guest', '', ''), OUT_OF_REACH);
  assert.equal(await askAccounts(offline, 'create', 'Wren', 'hunter22'), OUT_OF_REACH);
  assert.deepEqual(offline.asked, ['session', 'session']);
});

test('with the accounts out of reach the player may go on without an account, as the game played before', () => {
  assert.deepEqual(goingOn(null), {
    words: OUT_OF_REACH,
    press: 'Go on without an account',
    outcome: { kind: 'alone' },
  });
});

test('a signed-in account goes on as itself, by its username or, linked by Discord alone, in plain words', () => {
  assert.deepEqual(goingOn({ ...guest, username: 'Wren', guest: false }), {
    words: 'You are signed in as Wren.',
    press: 'Go on as Wren',
    outcome: { kind: 'account', username: 'Wren' },
  });
  assert.deepEqual(goingOn({ ...guest, discord: true, guest: false }), {
    words: 'You are signed in with Discord.',
    press: 'Go on',
    outcome: { kind: 'account', username: null },
  });
  assert.equal(goingOn(guest), null, 'a guest chooses on the form');
});

test('Discord is left for only while the accounts can be reached', async () => {
  const offline = { session: async () => null, discord: async () => ({ to: 'https://discord.example' }) };
  assert.equal(await discordAway(offline, 'https://game.example/'), OUT_OF_REACH);
  const online = {
    session: async () => guest,
    discord: async (back: string) => ({ to: `https://discord.example?back=${back}` }),
  };
  assert.deepEqual(await discordAway(online, 'here'), { to: 'https://discord.example?back=here' });
});

test('a player who left for Discord comes back to the helm once, and a store that keeps nothing never throws', () => {
  const kept = new Map<string, string>();
  const tab = {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
    removeItem: (key: string) => void kept.delete(key),
  };
  assert.equal(backAtHelm(tab, false), false);
  markHelm(tab);
  assert.equal(backAtHelm(tab, false), true);
  assert.equal(backAtHelm(tab, false), false, 'read once');
  const broken = {
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('denied');
    },
    removeItem: () => undefined,
  };
  markHelm(tab);
  assert.equal(backAtHelm(tab, true), false, 'a story played through is never begun again from the helm');
  assert.equal(backAtHelm(tab, false), false, 'and the mark is cleared all the same');
  assert.doesNotThrow(() => markHelm(broken));
  assert.equal(backAtHelm(broken, false), false);
});

test("a sign-in that worked is offered to the browser's password store, and one refused is not", async () => {
  const kept: KeptSignIn[] = [];
  useSignIns({ keep: async (signIn) => void kept.push(signIn), kept: async () => null });
  try {
    const named: Account = { ...guest, username: 'Wren', guest: false };
    await askAccounts(accounts({ register: named }), 'create', 'Wren', 'hunter22');
    await askAccounts(accounts({ login: named }), 'sign in', 'Wren', 'hunter22');
    await askAccounts(accounts({ login: 'Wrong username or password.' }), 'sign in', 'Wren', 'nope');
    await askAccounts(accounts({}), 'guest', '', '');
    assert.deepEqual(kept, [
      { id: 'Wren', password: 'hunter22' },
      { id: 'Wren', password: 'hunter22' },
    ]);
  } finally {
    useSignIns(BROWSERS_SIGN_INS);
  }
});
