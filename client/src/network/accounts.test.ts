import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountLink } from './accounts.ts';

const TOKEN = 'a'.repeat(64);

test('the link keeps the account the accounts last said the page is, for what the browser keeps by account', async () => {
  const kept = new Map<string, string>();
  const storage = {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
    removeItem: (key: string) => void kept.delete(key),
  };
  const account = (id: string, guest: boolean) => ({ id, username: guest ? null : id, discord: false, guest });
  const answers: Record<string, unknown> = {
    'POST /v1/guest': { token: TOKEN, account: account('guest-1', true) },
    'GET /v1/me': { account: account('guest-1', true) },
    'POST /v1/login': { token: 'b'.repeat(64), account: account('wayfarer', false) },
    'POST /v1/logout': {},
  };
  const ask: typeof fetch = (input, init) =>
    Promise.resolve(Response.json(answers[`${init?.method} ${new URL(String(input)).pathname}`] ?? {}));
  const link = new AccountLink('https://accounts.test', storage, ask);
  const said = () => link.account?.id ?? null;
  assert.equal(said(), null, 'none until the accounts have said');
  await link.session();
  assert.equal(said(), 'guest-1');
  await link.login('wayfarer', 'long enough');
  assert.equal(said(), 'wayfarer', 'signed in');
  await link.logout();
  assert.equal(said(), null, 'signed out');
  storage.setItem('noshores.session@https://accounts.test', TOKEN);
  const again = new AccountLink('https://accounts.test', storage, ask);
  await again.session();
  assert.equal(again.account?.id, 'guest-1', 'a page loaded again, its session held');
});

test('a signed-in page whose Discord ticket did not come never starts Discord, which would sign in afresh', async () => {
  const kept = new Map<string, string>([['noshores.session@https://accounts.test', TOKEN]]);
  const storage = {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
    removeItem: (key: string) => void kept.delete(key),
  };
  let ticket: Response = Response.json({ error: 'Too many tries. Wait a minute.' }, { status: 429 });
  const ask: typeof fetch = () => Promise.resolve(ticket.clone());
  const link = new AccountLink('https://accounts.test', storage, ask);
  assert.equal(await link.discord('https://game.test/'), 'Too many tries. Wait a minute.');
  ticket = Response.json({ ticket: 'c'.repeat(64) });
  const away = await link.discord('https://game.test/');
  assert.ok(typeof away !== 'string' && new URL(away.to).searchParams.get('ticket') === 'c'.repeat(64), 'linked by it');
  const guestless = new AccountLink('https://accounts.test', { ...storage, getItem: () => null }, ask);
  const signIn = await guestless.discord('https://game.test/');
  assert.ok(
    typeof signIn !== 'string' && !new URL(signIn.to).searchParams.has('ticket'),
    'signed out: a plain sign-in',
  );
});
