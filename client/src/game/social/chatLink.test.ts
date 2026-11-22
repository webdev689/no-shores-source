import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FromHall } from '../../../../server/accounts/chatLaw.ts';
import { ChatLink, type ChatSocket } from './chatLink.ts';

/** A socket the test drives: what was sent, and its listeners to call. */
function fakeSocket() {
  const sent: string[] = [];
  const listeners = new Map<string, (event: { data?: unknown; code?: number; reason?: string }) => void>();
  const socket = {
    readyState: 1,
    send: (text: string) => sent.push(text),
    close: () => undefined,
    addEventListener: (kind: string, listener: (event: { data?: unknown }) => void) => listeners.set(kind, listener),
  } as unknown as ChatSocket;
  const fire = (kind: string, event: { data?: unknown; code?: number; reason?: string } = {}) =>
    listeners.get(kind)?.(event);
  return { socket, sent, fire };
}

test('the link signs in with the token, is named by the welcome, and says lines only once welcomed', async () => {
  const fake = fakeSocket();
  const heard: FromHall[] = [];
  const link = new ChatLink(
    'ws://a.test/v1/chat',
    async () => 'a'.repeat(64),
    (said) => heard.push(said),
    () => fake.socket,
  );
  await link.start();
  fake.fire('open');
  assert.deepEqual(fake.sent, ['a'.repeat(64)]);
  assert.equal(link.say({ say: 'hi', channel: 'local' }), false, 'not before the welcome');
  fake.fire('message', { data: JSON.stringify({ welcome: { name: 'Ada' } }) });
  assert.equal(link.name, 'Ada');
  assert.equal(link.say({ say: 'hi', channel: 'local' }), true);
  assert.deepEqual(JSON.parse(fake.sent.at(-1) ?? ''), { say: 'hi', channel: 'local' });
  fake.fire('message', { data: JSON.stringify({ line: { channel: 'world', from: 'Ben', text: 'yo' } }) });
  assert.deepEqual(heard.at(-1), { line: { channel: 'world', from: 'Ben', text: 'yo' } });
  link.close();
});

test("a close with the hall's reason is told and not joined again; a page with no session joins nothing", async () => {
  const fake = fakeSocket();
  const heard: FromHall[] = [];
  let opened = 0;
  const open = () => {
    opened += 1;
    return fake.socket;
  };
  const link = new ChatLink(
    'ws://a.test/v1/chat',
    async () => 'a'.repeat(64),
    (said) => heard.push(said),
    open,
  );
  await link.start();
  fake.fire('close', { code: 4003, reason: 'Sign in to chat.' });
  assert.deepEqual(heard, [{ told: 'Sign in to chat.' }]);
  assert.equal(opened, 1);
  const alone = new ChatLink(
    'ws://a.test/v1/chat',
    async () => null,
    () => undefined,
    open,
  );
  await alone.start();
  assert.equal(opened, 1);
});
