import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SEARCH_LOST, findCompany, findingWords } from './companyFinder.ts';

/** A socket the test opens, closes and speaks through, writing down what it was sent and how it was closed. */
class FakeSocket {
  readonly sent: string[] = [];
  closed: [number, string] | [] = [];
  private readonly heard = new Map<string, ((event: never) => void)[]>();
  send(text: string): void {
    this.sent.push(text);
  }
  close(code = 1000, reason = ''): void {
    this.closed = [code, reason];
  }
  addEventListener(type: string, heard: (event: never) => void): void {
    this.heard.set(type, [...(this.heard.get(type) ?? []), heard]);
  }
  fire(type: string, event: object = {}): void {
    for (const heard of this.heard.get(type) ?? []) heard(event as never);
  }
}

const token = 'a'.repeat(64);
const address = 'ws://finder.test/v1/find/node-krakens-grotto';

test('a search sends its token once open, hears its own run found once, and says why it ended', () => {
  const heard: string[] = [];
  const told = {
    found: (run: string) => heard.push(`found ${run}`),
    ended: (why: string) => heard.push(`ended ${why}`),
  };
  const socket = new FakeSocket();
  const search = findCompany(
    address,
    'node-krakens-grotto',
    token,
    told,
    () => 5_000,
    () => socket as never,
  );
  assert.equal(search.since, 5_000);
  socket.fire('open');
  assert.deepEqual(socket.sent, [token]);
  socket.fire('message', { data: '{"run":"node-pearl-tomb--run-k3j4h5g6"}' });
  socket.fire('message', { data: '{"run":"node-krakens-grotto--run-k3j4h5g6"}' });
  socket.fire('message', { data: '{"run":"node-krakens-grotto--run-m9n8b7v6"}' });
  socket.fire('close', { code: 1000, reason: 'found' });
  assert.deepEqual(heard, ['found node-krakens-grotto--run-k3j4h5g6']);
  const elsewhere = new FakeSocket();
  findCompany(
    address,
    'node-krakens-grotto',
    token,
    told,
    () => 0,
    () => elsewhere as never,
  );
  elsewhere.fire('close', { code: 4003, reason: 'You are finding a company in another tab.' });
  const lost = new FakeSocket();
  findCompany(
    address,
    'node-krakens-grotto',
    token,
    told,
    () => 0,
    () => lost as never,
  );
  lost.fire('close', { code: 1006, reason: '' });
  assert.deepEqual(heard.slice(1), ['ended You are finding a company in another tab.', `ended ${SEARCH_LOST}`]);
  const stopped = new FakeSocket();
  findCompany(
    address,
    'node-krakens-grotto',
    token,
    told,
    () => 0,
    () => stopped as never,
  ).stop();
  stopped.fire('close', { code: 1000, reason: '' });
  assert.deepEqual([stopped.closed, heard.length], [[1000, 'stopped'], 3], 'stopped by the page: nothing heard');
});

test('the wait reads in minutes and seconds', () => {
  assert.deepEqual(
    [
      [0, 0],
      [0, 23_400],
      [0, 61_000],
    ].map(([since, now]) => findingWords(since ?? 0, now ?? 0)),
    ['Finding a company · 0:00', 'Finding a company · 0:23', 'Finding a company · 1:01'],
  );
});
