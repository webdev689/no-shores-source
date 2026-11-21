import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { type Account, AccountLink } from '../../network/accounts.ts';
import type { Node } from '../../ui/node.ts';
import { Stack } from '../../ui/stack.ts';
import { fakeInterface, laidOf, wordsOf } from '../../ui/uiForTests.ts';
import { ACCOUNT_CHANGED } from '../gearScreen.ts';
import { accountStep, creationOpen, lookStep } from './creation.ts';
import { FIRST_LOOK, type Look } from './look.ts';

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

/** The page's own listeners and events, as the steps reach them. */
function page() {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  Object.assign(globalThis, {
    addEventListener: (kind: string, heard: (event: unknown) => void) =>
      (listeners.get(kind) ?? listeners.set(kind, new Set()).get(kind))?.add(heard),
    removeEventListener: (kind: string, heard: (event: unknown) => void) => listeners.get(kind)?.delete(heard),
    dispatchEvent: (event: { type: string }) => {
      for (const heard of listeners.get(event.type) ?? []) heard(event);
      return true;
    },
  });
  return { listening: (kind: string) => listeners.get(kind)?.size ?? 0, listeners };
}

/** Each step's way out, taken after each test, so no window stays up into the next. */
const leaving: AbortController[] = [];
afterEach(() => {
  for (const left of leaving.splice(0)) left.abort();
});
/** A signal the test's end aborts. */
const ending = () => {
  const left = new AbortController();
  leaving.push(left);
  return left.signal;
};
/** A step left to run, its rejection at the test's end not heard. */
const running = (step: Promise<unknown>) => void step.catch(() => undefined);

/** A stack drawn through an interface the test presses and types into. */
function drawn() {
  const stack = new Stack();
  const { ui, step } = fakeInterface();
  const frame = (events: Parameters<typeof step>[1] = []) => step(() => stack.node(ui), events);
  const laid = () => laidOf(stack.node(ui));
  const press = (id: string) => {
    frame();
    const box = ui.boxOf(id);
    assert.ok(box, id);
    const [x, y] = [box.x + 2, box.y + 2];
    frame([
      { kind: 'down', x, y, button: 0 },
      { kind: 'up', x, y, button: 0 },
    ]);
  };
  const node = (id: string): Node | undefined => laid().find((each) => each.node.id === id)?.node;
  return { stack, ui, frame, laid, press, node, words: () => wordsOf(laid()) };
}

test('a Discord sign-in that came back is said once, with the offer to go on, and not as a refusal', async () => {
  page();
  const { stack, frame, words, ui } = drawn();
  running(accountStep(stack, accounts(account({ guest: false, discord: true }), 'Signed in with Discord.'), ending()));
  frame();
  await settle();
  frame();
  assert.ok(words().includes('You are signed in with Discord.'));
  assert.ok(!words().includes('Signed in with Discord.'));
  assert.equal(ui.focusedId, 'creation-go-on', 'the way on takes the focus from an empty form');
});

test('Discord linked to a named account is said with the offer, in one line', async () => {
  page();
  const { stack, frame, words } = drawn();
  running(accountStep(stack, accounts(account({ guest: false, username: 'Mack' }), 'Discord is linked.'), ending()));
  await settle();
  frame();
  assert.ok(words().includes('Discord is linked. You are signed in as Mack.'));
});

test('a Discord sign-in that went nowhere is said under the form, as a refusal', async () => {
  page();
  const { stack, frame, words, node } = drawn();
  running(accountStep(stack, accounts(account({}), 'Discord sign-in was cancelled.'), ending()));
  await settle();
  frame();
  assert.ok(words().includes('Discord sign-in was cancelled.'));
  assert.equal(node('creation-go-on'), undefined, 'a guest is offered nothing past the form');
});

test('a player typing on the form keeps the focus when the offer to go on comes', async () => {
  page();
  const { stack, frame, ui, words } = drawn();
  let answer: (found: Account) => void = () => undefined;
  const link = Object.assign(accounts(null), {
    session: () => new Promise<Account>((resolve) => (answer = resolve)),
  });
  running(accountStep(stack, link, ending()));
  frame();
  assert.equal(ui.focusedId, 'creation-username', 'the username takes the focus first');
  frame([{ kind: 'text', text: 'Ma' }]);
  answer(account({ guest: false, username: 'Mack' }));
  await settle();
  frame();
  assert.ok(words().includes('Go on as Mack'));
  assert.equal(ui.focusedId, 'creation-username');
});

test('an account made at the helm is the one the page shows from then on, and the keys go back to the game', async () => {
  const { listeners } = page();
  let heard = 0;
  listeners.set(ACCOUNT_CHANGED, new Set([() => heard++]));
  const { stack, frame, press, ui, words } = drawn();
  const ended = accountStep(stack, accounts(account({})));
  assert.equal(creationOpen(), true, 'the keys are the window’s');
  frame();
  frame([{ kind: 'text', text: 'Mack' }]);
  ui.focusOn('creation-password');
  frame([{ kind: 'text', text: 'long enough' }]);
  press('creation-create');
  assert.deepEqual(await ended, { kind: 'account', username: 'Mack' });
  assert.equal(heard, 1, 'the menu, its mark and the company hear of the new account');
  frame();
  assert.deepEqual(words(), [], 'the window goes');
  assert.equal(creationOpen(), false);
});

test('accounts that never answer are given up, and the way on without an account is offered', async () => {
  page();
  const { stack, frame, press, node, words } = drawn();
  const kept = new Map<string, string>();
  const hung: typeof fetch = (_input, init) =>
    new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('timed out'))));
  const link = new AccountLink(
    'https://accounts.test',
    { getItem: (key) => kept.get(key) ?? null, setItem: (key, value) => kept.set(key, value), removeItem: () => {} },
    hung,
  );
  link.patienceMs = 20;
  running(accountStep(stack, link, ending()));
  press('creation-guest');
  frame();
  assert.equal(node('creation-guest')?.disabled, true, 'every press waits while the ask is out');
  await new Promise((resolve) => setTimeout(resolve, 80));
  await settle();
  frame();
  assert.equal(node('creation-guest')?.disabled, false);
  assert.ok(words().includes('Go on without an account'));
  assert.ok(words().includes('The accounts could not be reached.'));
});

test('playing alone, the step says so and goes on', async () => {
  page();
  const { stack, press, words } = drawn();
  const ended = accountStep(stack, null);
  press('creation-go-on');
  assert.ok(!words().includes('Your account'));
  assert.deepEqual(await ended, { kind: 'alone' });
});

test('every choice of the look redresses the figure at once, and Done ends the step with it', async () => {
  const { listening } = page();
  const { stack, press, node, words } = drawn();
  const seen: Look[] = [];
  const turned: number[] = [];
  const chosen = lookStep(
    stack,
    FIRST_LOOK,
    (look) => seen.push(look),
    (step) => turned.push(step),
  );
  press('creation-Race:felid');
  assert.equal(seen.at(-1)?.race, 'felid');
  assert.equal(node('creation-tone'), undefined, 'a skin tone for a human alone');
  press('creation-Race:human');
  assert.ok(node('creation-tone'));
  press('creation-Hair colour:red');
  assert.equal(seen.at(-1)?.hair?.colour, 'red');
  press('creation-turn-right');
  assert.deepEqual(turned, [1]);
  assert.equal(listening('keydown'), 1, 'A and D turn the figure');
  assert.ok(words().includes('Your character'));
  press('creation-done');
  const look = await chosen;
  assert.equal(look.hair?.colour, 'red');
  assert.equal(listening('keydown'), 0);
});

test('a step the story moves on from takes its window and its keys with it', async () => {
  const { listening } = page();
  const { stack, words, frame } = drawn();
  const left = new AbortController();
  const chosen = lookStep(
    stack,
    FIRST_LOOK,
    () => undefined,
    () => undefined,
    left.signal,
  );
  assert.equal(listening('keydown'), 1);
  left.abort();
  await assert.rejects(chosen);
  frame();
  assert.deepEqual(words(), []);
  assert.equal(listening('keydown'), 0, 'a key pressed in the beats after turns nothing');

  const asking = new AbortController();
  const ended = accountStep(stack, accounts(account({})), asking.signal);
  asking.abort();
  await assert.rejects(ended);
  frame();
  assert.deepEqual(words(), []);
  assert.equal(creationOpen(), false);
});
