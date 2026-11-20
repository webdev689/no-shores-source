import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Account, AccountLink } from '../../network/accounts.ts';
import { ACCOUNT_CHANGED } from '../gearScreen.ts';
import { type FakeElement, fakePage } from '../pageForTests.ts';
import { accountStep, lookStep } from './creation.ts';
import { FIRST_LOOK } from './look.ts';

const settle = async () => {
  for (let turn = 0; turn < 20; turn++) await Promise.resolve();
};

const account = (fields: Partial<Account>): Account => ({
  id: 'a1',
  username: null,
  discord: false,
  guest: true,
  ...fields,
});

/** The accounts as the step asks them: the session they answer, the words of a Discord sign-in, and a username given
 *  to a guest. */
function accounts(session: Account | null, said: string | null = null) {
  return {
    said,
    session: async () => session,
    register: async (username: string) => account({ username, guest: false }),
    login: async (username: string) => account({ username, guest: false }),
    discord: async () => 'https://discord.test',
  } as unknown as AccountLink;
}

/** The words shown on the step's window, each element's own. */
const wordsOn = (root: FakeElement) =>
  root
    .all()
    .filter((node) => node.children.length === 0)
    .map((node) => node.textContent)
    .filter(Boolean);

test('a Discord sign-in that came back is said once, with the offer to go on, and not as a refusal', async () => {
  const { root, page } = fakePage();
  void accountStep(root as never, accounts(account({ guest: false, discord: true }), 'Signed in with Discord.'));
  await settle();
  const words = wordsOn(root);
  assert.equal(
    words.filter((said) => /Discord/.test(said)).length,
    2,
    'the offer, and the press to sign in with Discord',
  );
  assert.ok(words.includes('You are signed in with Discord.'));
  assert.ok(!words.includes('Signed in with Discord.'));
  const refusal = root.all().find((node) => node.className === 'creation-said');
  assert.equal(refusal?.textContent, '');
  assert.equal(page.activeElement?.textContent, 'Go on', 'the way on takes the focus from an empty form');
});

test('Discord linked to a named account is said with the offer, in one line', async () => {
  const { root } = fakePage();
  void accountStep(root as never, accounts(account({ guest: false, username: 'Mack' }), 'Discord is linked.'));
  await settle();
  assert.ok(wordsOn(root).includes('Discord is linked. You are signed in as Mack.'));
});

test('a Discord sign-in that went nowhere is said under the form, as a refusal', async () => {
  const { root } = fakePage();
  void accountStep(root as never, accounts(account({}), 'Discord sign-in was cancelled.'));
  await settle();
  const refusal = root.all().find((node) => node.className === 'creation-said');
  assert.equal(refusal?.textContent, 'Discord sign-in was cancelled.');
  assert.ok(!root.find('Go on'), 'a guest is offered nothing past the form');
});

test('a player typing on the form keeps the focus when the offer to go on comes', async () => {
  const { root, page } = fakePage();
  let answer: (found: Account) => void = () => undefined;
  const link = Object.assign(accounts(null), {
    session: () => new Promise<Account>((resolve) => (answer = resolve)),
  });
  void accountStep(root as never, link);
  const name = page.activeElement;
  assert.equal(name?.tagName, 'INPUT', 'the username takes the focus first');
  if (name) name.value = 'Ma';
  answer(account({ guest: false, username: 'Mack' }));
  await settle();
  assert.ok(root.find('Go on as Mack'));
  assert.equal(page.activeElement, name);
});

test('an account made at the helm is the one the page shows from then on', async () => {
  const { root, page, window } = fakePage();
  let heard = 0;
  window.addEventListener(ACCOUNT_CHANGED, () => heard++);
  const ended = accountStep(root as never, accounts(account({})));
  await settle();
  const [name, password] = root.all().filter((node) => node.tagName === 'INPUT');
  Object.assign(name ?? {}, { value: 'Mack' });
  Object.assign(password ?? {}, { value: 'long enough' });
  root.find('Create an account')?.click();
  assert.deepEqual(await ended, { kind: 'account', username: 'Mack' });
  assert.equal(heard, 1, 'the menu, its mark and the company hear of the new account');
  assert.equal(root.children.length, 0, 'the window goes');
  assert.ok(page.activeElement);
});

test('accounts that never answer are given up, and the way on without an account is offered', async () => {
  const { root } = fakePage();
  const kept = new Map<string, string>();
  const hung: typeof fetch = (_input, init) =>
    new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('timed out'))));
  const link = new AccountLink(
    'https://accounts.test',
    { getItem: (key) => kept.get(key) ?? null, setItem: (key, value) => kept.set(key, value), removeItem: () => {} },
    hung,
  );
  link.patienceMs = 20;
  void accountStep(root as never, link);
  const guest = root.find('Play as a guest');
  guest?.click();
  assert.equal(guest?.disabled, true, 'every press waits while the ask is out');
  await new Promise((resolve) => setTimeout(resolve, 80));
  await settle();
  assert.equal(guest?.disabled, false);
  assert.ok(root.find('Go on without an account'));
  assert.ok(wordsOn(root).includes('The accounts could not be reached.'));
});

test('a step the story moves on from takes its window and its keys with it', async () => {
  const { root, window } = fakePage();
  const left = new AbortController();
  const turned: number[] = [];
  const chosen = lookStep(
    root as never,
    FIRST_LOOK,
    () => undefined,
    (step) => turned.push(step),
    left.signal,
  );
  assert.equal(window.listening('keydown'), 1);
  left.abort();
  await assert.rejects(chosen);
  assert.equal(root.children.length, 0);
  assert.equal(window.listening('keydown'), 0, 'a key pressed in the beats after turns nothing');

  const asking = new AbortController();
  const ended = accountStep(root as never, accounts(account({})), asking.signal);
  asking.abort();
  await assert.rejects(ended);
  assert.equal(root.children.length, 0);
});
