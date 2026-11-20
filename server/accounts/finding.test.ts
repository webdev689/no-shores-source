import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runAsk, runInstance } from '../roomNames.ts';
import { accounts } from './accountsForTests.ts';
import { characters } from './characters.ts';
import { companionsOf } from './companies.ts';
import { Finder, type FinderSocket, Queue, type Seeker, bandOf, findingAt, foundRun, seekerOf } from './finding.ts';

const seeker = (socket: number, account: string, since: number, band = 0, apart: string[] = []): Seeker => ({
  socket,
  account,
  band,
  since,
  apart,
});
const sockets = (group: readonly Seeker[]) => group.map((one) => one.socket);
const asked = (path: string, upgrade = 'websocket') =>
  findingAt(new Request(`https://accounts.test${path}`, { headers: { Upgrade: upgrade } }));

/** A socket that writes down what it was sent and how it was closed. */
class FakeSocket implements FinderSocket {
  readonly sent: string[] = [];
  closed: [number, string] | [] = [];
  send(text: string): void {
    this.sent.push(text);
  }
  close(code: number, reason: string): void {
    this.closed = [code, reason];
  }
}

/** Named players, each one's token and account, kept at `level` as their room last saved them. */
async function world(names: readonly string[], level = 5) {
  const made = accounts();
  const kept = characters(
    made.deps.database,
    () => made.clock.now,
    () => Promise.resolve(),
  );
  const [tokens, ids]: [Record<string, string>, Record<string, string>] = [{}, {}];
  for (const name of names) {
    const token = (await made.ask('POST', '/v1/guest')).body['token'] as string;
    await made.ask('POST', '/v1/register', { username: name, password: 'long enough' }, token);
    const claimed = await kept.claim(token, `room:${name}`);
    await kept.save(claimed?.account ?? '', `room:${name}`, JSON.stringify({ shown: { level } }));
    [tokens[name], ids[name]] = [token, claimed?.account ?? ''];
  }
  const finderOf = (base: string) =>
    new Finder(base, {
      seeker: (token) => seekerOf(made.deps.database, token, made.clock.now),
      found: (run, found) => foundRun(made.deps.database, run, found, made.clock.now),
      now: () => made.clock.now,
      instance: () => 'k3j4h5g6',
    });
  return { made, kept, tokens, ids, finderOf, database: made.deps.database };
}

/** Opens a socket to the finder and has it send `token`. */
async function seeking(finder: Finder, token: string) {
  const socket = new FakeSocket();
  await finder.heard(finder.opened(socket), token);
  return socket;
}

test('a run starts with four of a band at once, oldest first, or with fewer once its first has waited a minute', () => {
  const queue = new Queue();
  for (const one of [
    seeker(1, 'ada', 0),
    seeker(2, 'ben', 10_000),
    seeker(3, 'cal', 20_000, 1),
    seeker(4, 'dee', 30_000),
  ])
    queue.join(one);
  assert.deepEqual(queue.due(50_000).map(sockets), [], 'three of band 0 and one of band 1');
  queue.join(seeker(5, 'eve', 40_000));
  queue.join(seeker(6, 'fay', 45_000));
  assert.deepEqual(queue.due(50_000).map(sockets), [[1, 2, 4, 5]]);
  assert.deepEqual(queue.due(79_999).map(sockets), [], 'cal has waited a minute less a millisecond');
  assert.deepEqual(queue.due(80_000).map(sockets), [[3]], 'cal alone; fay is of another band');
  assert.deepEqual(queue.due(105_000).map(sockets), [[6]]);
  assert.equal(queue.size, 0);
});

test('two who block each other are never in one run, whichever blocked whom', () => {
  const queue = new Queue();
  for (const one of [
    seeker(1, 'ada', 0, 0, ['ben']),
    seeker(2, 'ben', 1_000),
    seeker(3, 'cal', 2_000, 0, ['eve']),
    seeker(4, 'dee', 3_000),
    seeker(5, 'eve', 4_000),
    seeker(6, 'fay', 5_000),
  ])
    queue.join(one);
  assert.deepEqual(queue.due(6_000).map(sockets), [[1, 3, 4, 6]], 'ada without ben, cal without eve');
  assert.deepEqual(queue.due(61_000).map(sockets), [[2, 5]]);
});

test('one account waits once: a second search replaces its first, and a search left is in no run', () => {
  const queue = new Queue();
  assert.equal(queue.join(seeker(1, 'ada', 0)), null);
  assert.equal(queue.join(seeker(2, 'ada', 5_000)), 1, 'its first socket, to let go');
  queue.join(seeker(3, 'ben', 6_000));
  queue.leave(3);
  queue.leave(9);
  assert.equal(queue.size, 1);
  assert.deepEqual(queue.due(64_999).map(sockets), []);
  assert.deepEqual(queue.due(65_000).map(sockets), [[2]], 'ada once, waiting from her second search');
});

test('bands are tens of levels, and an instance is eight of a-z0-9', () => {
  assert.deepEqual([1, 10, 11, 20, 21, 24, 30].map(bandOf), [0, 0, 1, 1, 2, 2, 2]);
  assert.equal(
    runInstance((bytes) => bytes.fill(0)),
    'aaaaaaaa',
  );
  assert.equal(
    runInstance((bytes) => bytes.fill(35)),
    '99999999',
  );
});

test('Find a Company is reached by WebSocket for an Elite Dungeon or the week’s at Elite, not the Abyss’s', () => {
  assert.equal(asked('/v1/find/node-krakens-grotto'), 'node-krakens-grotto');
  assert.equal(asked('/v1/find/node-forsaken-cistern--elite'), 'node-forsaken-cistern--elite');
  for (const path of [
    '/v1/find/node-saltworm-warrens--abyss',
    '/v1/find/node-saltgrass-downs--dungeon-1',
    '/v1/find/node-krakens-grotto--run-k3j4h5g6',
    '/v1/find/node-krakens-grotto--normal',
    '/v1/find/sea',
    `/v1/find/node-${'a'.repeat(46)}`,
    '/v1/find/node-krakens-grotto/',
  ])
    assert.equal(asked(path), null, path);
  assert.equal(asked('/v1/find/node-krakens-grotto', ''), null, 'only by WebSocket');
});

test('a run found for each Elite Dungeon, and for each at Elite, is named as its room reads a run', () => {
  const ids = Array.from({ length: 9 }, (_unused, index) => {
    const text = readFileSync(new URL(`../../content/world/land/continent-${index + 1}.json`, import.meta.url), 'utf8');
    const nodes = (JSON.parse(text) as { nodes: { id: string; kind: string }[] }).nodes;
    return nodes.filter((node) => node.kind === 'dungeon').map((node) => node.id);
  }).flat();
  assert.equal(ids.length, 18);
  for (const id of ids)
    for (const [base, tier] of [
      [`node-${id}`, 0],
      [`node-${id}--elite`, 1],
    ] as const) {
      const run = `${base}--run-k3j4h5g6`;
      assert.ok(run.length <= 64 && asked(`/v1/find/${base}`) === base, run);
      assert.deepEqual(JSON.parse(runAsk(run, 29_919_420) ?? 'null'), {
        dungeon: { place: id },
        tier,
        minute: 29_919_420,
      });
    }
});

test('a seeker is their session’s account, the level their room last kept, and who blocks or is blocked', async () => {
  const { made, tokens, ids, database } = await world(['Ada', 'Ben', 'Cal'], 24);
  const fresh = (await made.ask('POST', '/v1/guest')).body['token'] as string;
  await made.ask('POST', '/v1/social/block', { name: 'Ben' }, tokens['Ada']);
  await made.ask('POST', '/v1/social/block', { name: 'Ada' }, tokens['Cal']);
  assert.deepEqual(await seekerOf(database, tokens['Ada'] ?? '', made.clock.now), {
    account: ids['Ada'],
    level: 24,
    apart: [ids['Ben'], ids['Cal']].sort(),
  });
  assert.equal((await seekerOf(database, fresh, made.clock.now))?.level, 1, 'no character kept yet');
  assert.equal(await seekerOf(database, '0'.repeat(64), made.clock.now), null);
});

test('four seekers of a band are sent into one run, which their room lets them into together', async () => {
  const names = ['Ada', 'Ben', 'Cal', 'Dee'];
  const { tokens, ids, finderOf, database } = await world(names);
  const finder = finderOf('node-krakens-grotto');
  const all = [];
  for (const name of names) all.push(await seeking(finder, tokens[name] ?? ''));
  await finder.tick();
  for (const socket of all) {
    assert.deepEqual(socket.sent, ['{"run":"node-krakens-grotto--run-k3j4h5g6"}']);
    assert.deepEqual(socket.closed, [1000, 'found']);
  }
  const companions = await companionsOf(database, ids['Ben'] ?? '', 'node-krakens-grotto--run-k3j4h5g6');
  assert.deepEqual(companions.sort(), Object.values(ids).sort());
  assert.deepEqual([finder.waiting, finder.open], [0, 0]);
});

test('a socket with no session, or anything but its token, is let go, and a second search ends its first', async () => {
  const { tokens, finderOf } = await world(['Ada']);
  const finder = finderOf('node-krakens-grotto');
  assert.deepEqual((await seeking(finder, '0'.repeat(64))).closed, [4003, 'Sign in to find a company.']);
  assert.deepEqual((await seeking(finder, 'hello')).closed, [1008, 'not a token']);
  const first = await seeking(finder, tokens['Ada'] ?? '');
  const again = new FakeSocket();
  const twice = finder.opened(again);
  await finder.heard(twice, tokens['Ada'] ?? '');
  await finder.heard(twice, tokens['Ada'] ?? '');
  assert.deepEqual(again.closed, [1008, 'not a token'], 'a second message');
  const second = await seeking(finder, tokens['Ada'] ?? '');
  assert.deepEqual(first.closed, [4003, 'You are finding a company in another tab.']);
  assert.deepEqual([second.closed, finder.waiting], [[], 1]);
});

test('a seeker gone before their run is found is told nothing, and the rest still go in', async () => {
  const names = ['Ada', 'Ben', 'Cal', 'Dee'];
  const { made, tokens, finderOf } = await world(names);
  const finder = finderOf('node-krakens-grotto');
  const opened = names.map(() => new FakeSocket());
  const numbers = opened.map((socket) => finder.opened(socket));
  for (const [index, name] of names.entries()) await finder.heard(numbers[index] ?? 0, tokens[name] ?? '');
  finder.closed(numbers[3] ?? 0);
  await finder.tick();
  assert.deepEqual(
    opened.map((socket) => socket.sent),
    [[], [], [], []],
    'three wait on',
  );
  made.clock.now += 60_000;
  await finder.tick();
  const told = ['{"run":"node-krakens-grotto--run-k3j4h5g6"}'];
  assert.deepEqual(
    opened.map((socket) => socket.sent),
    [told, told, told, []],
  );
});
