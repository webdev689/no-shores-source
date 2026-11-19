import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Account } from '../../network/accounts.ts';
import { OUT_OF_REACH, type Accounts, askAccounts } from './accountAsk.ts';

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
