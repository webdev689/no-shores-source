import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runAsk, runInstance, startedAtSea } from '../roomNames.ts';
import { accounts } from './accountsForTests.ts';
import { characters } from './characters.ts';
import { FOUND_KEPT_MS, companionsOf, companyRunOf, launchedFor } from './companies.ts';
import {
  BREACH_HARD_SHUT,
  BREACH_LAUNCHED,
  BREACH_RELAUNCH_MS,
  FINDING_MOST,
  Finder,
  type FinderSocket,
  Queue,
  type Seeker,
  bandOf,
  findingAt,
  foundRun,
  seekerOf,
} from './finding.ts';
import { TOKEN_WAIT_MS } from '../keeping.ts';

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

/** Named players, each one's token and account, kept at `level` past the prologue as their room last saved them. */
async function world(names: readonly string[], level = 5, prologue = true) {
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
    await kept.save(
      claimed?.account ?? '',
      `room:${name}`,
      JSON.stringify({ shown: { level }, story: { prologue } }),
      '{}',
    );
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
  assert.equal(asked('/v1/find/node-forsaken-cistern--elite--sea'), 'node-forsaken-cistern--elite--sea');
  assert.equal(asked('/v1/find/node-krakens-grotto--sea'), 'node-krakens-grotto--sea', 'at Normal, from the sea');
  for (const path of [
    '/v1/find/node-saltworm-warrens--abyss',
    '/v1/find/node-saltgrass-downs--dungeon-1',
    '/v1/find/node-krakens-grotto--run-k3j4h5g6',
    '/v1/find/node-krakens-grotto--normal',
    '/v1/find/sea',
    `/v1/find/node-${'a'.repeat(46)}`,
    '/v1/find/node-krakens-grotto/',
    '/v1/find/playlist-normal',
    '/v1/find/node-forsaken-cistern--abyss--sea',
    '/v1/find/node-forsaken-cistern--elite--sea--sea',
    '/v1/find/node-forsaken-cistern--sea--sea',
    '/v1/find/node-forsaken-cistern--sea--elite',
    '/v1/find/node-saltgrass-downs--dungeon-1--sea',
    '/v1/find/playlist-elite--run-k3j4h5g6',
  ])
    assert.equal(asked(path), null, path);
  assert.equal(asked('/v1/find/node-krakens-grotto', ''), null, 'only by WebSocket');
  assert.equal(asked('/v1/find/playlist-elite'), 'playlist-elite');
  assert.equal(asked('/v1/find/playlist-abyss'), 'playlist-abyss', 'the Abyss Playlist is matched');
});

test('a run found for each Elite Dungeon, at Normal from its door or the sea and at Elite, is named as its room reads a run', () => {
  const ids = Array.from({ length: 9 }, (_unused, index) => {
    const text = readFileSync(new URL(`../../content/world/land/continent-${index + 1}.json`, import.meta.url), 'utf8');
    const nodes = (JSON.parse(text) as { nodes: { id: string; kind: string }[] }).nodes;
    return nodes.filter((node) => node.kind === 'dungeon').map((node) => node.id);
  }).flat();
  assert.equal(ids.length, 18);
  for (const id of ids)
    for (const [base, tier] of [
      [`node-${id}`, 0],
      [`node-${id}--sea`, 0],
      [`node-${id}--elite`, 1],
    ] as const) {
      const run = `${base}--run-k3j4h5g6`;
      assert.ok(run.length <= 64 && asked(`/v1/find/${base}`) === base, run);
      assert.equal(startedAtSea(run), base.endsWith('--sea'), run);
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
    prologue: true,
    breaches: [],
    apart: [ids['Ben'], ids['Cal']].sort(),
  });
  const kept = await seekerOf(database, fresh, made.clock.now);
  assert.deepEqual([kept?.level, kept?.prologue], [1, false], 'no character kept yet');
  assert.equal(await seekerOf(database, '0'.repeat(64), made.clock.now), null);
});

test('a seeker under the week’s Elite Dungeon’s level finds no company for it, as its room would refuse them', async () => {
  const { tokens, finderOf } = await world(['Ada', 'Ben'], 23);
  for (const base of ['node-forsaken-cistern--elite', 'node-forsaken-cistern--elite--sea']) {
    const finder = finderOf(base);
    assert.deepEqual((await seeking(finder, tokens['Ada'] ?? '')).closed, [4003, 'This dungeon opens at level 24.']);
  }
  const { tokens: older, finderOf: at24 } = await world(['Cal'], 24);
  const finder = at24('node-forsaken-cistern--elite');
  await seeking(finder, older['Cal'] ?? '');
  assert.equal(finder.waiting, 1, 'at its level, in the queue');
});

test('an Elite Dungeon at Normal from the sea is found as from its door: any level, banded by tens', async () => {
  const names = ['Ada', 'Ben', 'Cal', 'Dee'];
  const { tokens, finderOf } = await world(names, 5);
  const finder = finderOf('node-krakens-grotto--sea');
  const all = [];
  for (const name of names) all.push(await seeking(finder, tokens[name] ?? ''));
  assert.equal(finder.waiting, 4, 'under the week’s level, in the queue');
  await finder.tick();
  for (const socket of all) assert.deepEqual(socket.sent, ['{"run":"node-krakens-grotto--sea--run-k3j4h5g6"}']);
  const apart = await world(names, 5);
  const body = JSON.stringify({ shown: { level: 24 }, story: { prologue: true } });
  await apart.kept.save(apart.ids['Dee'] ?? '', 'room:Dee', body, '{}');
  const banded = apart.finderOf('node-krakens-grotto--sea');
  for (const name of names) await seeking(banded, apart.tokens[name] ?? '');
  await banded.tick();
  assert.equal(banded.waiting, 4, 'Dee is two bands up: no four of a band yet');
});

test('one who has not played the prologue finds no company, as no run a finder starts lets them in', async () => {
  const { tokens, finderOf } = await world(['Ada'], 12, false);
  for (const base of ['node-krakens-grotto', 'playlist-elite']) {
    const finder = finderOf(base);
    const socket = await seeking(finder, tokens['Ada'] ?? '');
    assert.deepEqual(socket.closed, [4003, 'This place opens after the prologue.'], base);
    assert.equal(finder.waiting, 0, 'in no queue');
  }
});

test('four seekers of a band are sent into one run, which their room lets them into together', async () => {
  const names = ['Ada', 'Ben', 'Cal', 'Dee'];
  const { made, tokens, ids, finderOf, database } = await world(names);
  const finder = finderOf('node-krakens-grotto');
  const all = [];
  for (const name of names) all.push(await seeking(finder, tokens[name] ?? ''));
  await finder.tick();
  for (const socket of all) {
    assert.deepEqual(socket.sent, ['{"run":"node-krakens-grotto--run-k3j4h5g6"}']);
    assert.deepEqual(socket.closed, [1000, 'found']);
  }
  const companions = await companionsOf(
    database,
    ids['Ben'] ?? '',
    'node-krakens-grotto--run-k3j4h5g6',
    made.clock.now,
  );
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

test('a socket that sends no token in time is let go, and only those with a token fill a finder', async () => {
  const { made, tokens, finderOf } = await world(['Ada']);
  const finder = finderOf('node-krakens-grotto');
  const silent = Array.from({ length: FINDING_MOST }, () => new FakeSocket());
  for (const socket of silent) finder.opened(socket);
  assert.equal(finder.full, false, 'no token yet: none counts');
  made.clock.now += TOKEN_WAIT_MS - 1;
  await finder.tick();
  assert.equal(finder.open, FINDING_MOST, 'within the wait');
  made.clock.now += 1;
  await finder.tick();
  assert.ok(
    silent.every((socket) => socket.closed[0] === 4003),
    'all let go after the wait',
  );
  assert.equal(finder.open, 0);
  await seeking(finder, tokens['Ada'] ?? '');
  assert.equal(finder.waiting, 1, 'a seeker with a token gets in');
});

test('silent sockets never fill a finder: past its most, the oldest silent one is let go for each new one', async () => {
  const { tokens, finderOf } = await world(['Ada'], 12);
  const finder = finderOf('playlist-elite');
  const flood = Array.from({ length: FINDING_MOST * 3 }, () => new FakeSocket());
  for (const socket of flood) finder.opened(socket);
  assert.deepEqual([finder.open, finder.full], [FINDING_MOST, false]);
  assert.ok(
    flood.slice(0, FINDING_MOST * 2).every((socket) => socket.closed[0] === 4003),
    'the oldest let go',
  );
  assert.ok(
    flood.slice(FINDING_MOST * 2).every((socket) => socket.closed.length === 0),
    'the newest kept',
  );
  await seeking(finder, tokens['Ada'] ?? '');
  assert.equal(finder.waiting, 1, 'a seeker with a token still gets in');
});

test('signed Launch sockets fill their own room: a full search queue never shuts one out, and they are bounded', async () => {
  const finder = new Finder('playlist-elite', {
    // Each token its own account, signed in past the prologue.
    seeker: (token) => Promise.resolve({ account: token, level: 30, prologue: true, apart: [] }),
    found: () => Promise.resolve(true),
    now: () => 0,
    instance: () => 'k3j4h5g6',
  });
  const tokenOf = (number: number) => number.toString(16).padStart(64, '0');
  for (let number = 0; number < FINDING_MOST; number++)
    await finder.heard(finder.opened(new FakeSocket()), tokenOf(number));
  assert.deepEqual([finder.full, finder.launchesFull], [true, false], 'searches fill the search queue alone');
  for (let number = FINDING_MOST; number < FINDING_MOST * 2; number++)
    await finder.heard(finder.opened(new FakeSocket(), true), tokenOf(number));
  assert.equal(finder.launchesFull, true, 'as many signed Launches as a finder takes fill it to more');
});

test('a second tab that searches while its account’s run is being started joins no second group', async () => {
  const names = ['Ada', 'Ben', 'Cal', 'Dee'];
  const { made, tokens } = await world(names);
  let keep: (kept: boolean) => void = () => undefined;
  const finder = new Finder('node-krakens-grotto', {
    seeker: (token) => seekerOf(made.deps.database, token, made.clock.now),
    found: () => new Promise<boolean>((resolve) => (keep = resolve)),
    now: () => made.clock.now,
    instance: () => 'k3j4h5g6',
  });
  const all = [];
  for (const name of names) all.push(await seeking(finder, tokens[name] ?? ''));
  const ticking = finder.tick();
  const again = await seeking(finder, tokens['Ada'] ?? '');
  assert.deepEqual(again.closed, [4003, 'You are finding a company in another tab.']);
  assert.equal(finder.waiting, 0, 'in no queue');
  keep(true);
  await ticking;
  assert.deepEqual(all[0]?.sent, ['{"run":"node-krakens-grotto--run-k3j4h5g6"}'], 'the first tab goes in');
  assert.equal((await seeking(finder, tokens['Ada'] ?? '')).closed.length, 0, 'once told, a search again is taken');
});

test('a socket that throws as its run is told leaves no account starting, and its group is told', async () => {
  const names = ['Ada', 'Ben', 'Cal', 'Dee'];
  const { tokens, finderOf } = await world(names);
  const finder = finderOf('node-krakens-grotto');
  const all = [];
  for (const name of names) all.push(await seeking(finder, tokens[name] ?? ''));
  const broken = all[0] ?? new FakeSocket();
  broken.send = () => {
    throw new Error('the socket closed');
  };
  await finder.tick();
  const told = ['{"run":"node-krakens-grotto--run-k3j4h5g6"}'];
  assert.deepEqual(
    all.map((socket) => socket.sent),
    [[], told, told, told],
  );
  assert.equal(finder.open, 0);
  assert.deepEqual((await seeking(finder, tokens['Ada'] ?? '')).closed, [], 'searching again, in no run starting');
  assert.equal(finder.waiting, 1);
});

test('of two searches of one account looked up at once, the newer socket is kept whichever answers first', async () => {
  const queue = new Queue();
  assert.equal(queue.join(seeker(2, 'ada', 5_000)), null, 'the second lookup answers first');
  assert.equal(queue.join(seeker(1, 'ada', 5_100)), 1, 'the first, older, is the one let go');
  assert.deepEqual(queue.due(65_000).map(sockets), [[2]]);
  const { tokens, finderOf } = await world(['Ada']);
  const finder = finderOf('node-krakens-grotto');
  const [older, newer] = [new FakeSocket(), new FakeSocket()];
  const [first, second] = [finder.opened(older), finder.opened(newer)];
  const asked = finder.heard(first, tokens['Ada'] ?? '');
  await finder.heard(second, tokens['Ada'] ?? '');
  await asked;
  assert.deepEqual([older.closed, newer.closed], [[4003, 'You are finding a company in another tab.'], []]);
});

test('whom a run was found for admits them for a day after it was found, and no one after', async () => {
  const { ids, database, made } = await world(['Ada', 'Ben']);
  const [ada, ben] = [ids['Ada'] ?? '', ids['Ben'] ?? ''];
  const run = 'node-krakens-grotto--run-k3j4h5g6';
  assert.equal(await foundRun(database, run, [ada, ben], made.clock.now), true);
  assert.deepEqual(await companionsOf(database, ada, run, made.clock.now + FOUND_KEPT_MS), [ada, ben]);
  assert.deepEqual(await companionsOf(database, ada, run, made.clock.now + FOUND_KEPT_MS + 1), [ada], 'alone');
});

test('a playlist’s seekers are banded by five levels and sent into an Elite Dungeon drawn for them at the band’s level', async () => {
  const { made, tokens, ids, database } = await world(['Ada', 'Ben'], 17);
  const young = await world(['Cal'], 9);
  const drawn: number[] = [];
  const finder = new Finder('playlist-elite', {
    seeker: (token) => seekerOf(token === young.tokens['Cal'] ? young.database : database, token, made.clock.now),
    found: (run, found) => foundRun(database, run, found, made.clock.now),
    now: () => made.clock.now,
    instance: () => 'k3j4h5g6',
    pick: (count) => (drawn.push(count), 13),
  });
  const cal = await seeking(finder, young.tokens['Cal'] ?? '');
  assert.deepEqual(cal.closed, [4003, 'The Elite Playlist opens at level 10.']);
  const both = [await seeking(finder, tokens['Ada'] ?? ''), await seeking(finder, tokens['Ben'] ?? '')];
  made.clock.now += 60_000;
  await finder.tick();
  const run = 'node-saltworm-warrens--elite--playlist-17--run-k3j4h5g6';
  for (const socket of both) assert.deepEqual(socket.sent, [JSON.stringify({ run })]);
  assert.deepEqual(drawn, [18], 'one of the 18');
  assert.deepEqual(
    (await companionsOf(database, ids['Ada'] ?? '', run, made.clock.now)).sort(),
    Object.values(ids).sort(),
  );
  assert.deepEqual(JSON.parse(runAsk(run, 29_919_420) ?? 'null'), {
    dungeon: { place: 'saltworm-warrens' },
    tier: 1,
    minute: 29_919_420,
    playlist: 17,
  });
});

test('a playlist’s Launch is started at once, for its seeker alone, its Elite Dungeon drawn and kept by the server', async () => {
  const { made, tokens, ids, database } = await world(['Ada', 'Ben'], 22);
  const finder = new Finder('playlist-abyss', {
    seeker: (token) => seekerOf(database, token, made.clock.now),
    found: (run, found) => foundRun(database, run, found, made.clock.now),
    now: () => made.clock.now,
    instance: () => 'k3j4h5g6',
    pick: () => 1,
  });
  const ben = await seeking(finder, tokens['Ben'] ?? '');
  const launch = new FakeSocket();
  await finder.heard(finder.opened(launch, true), tokens['Ada'] ?? '');
  await finder.tick();
  const run = 'node-pearl-tomb--abyss--playlist-23--run-k3j4h5g6';
  assert.deepEqual(launch.sent, [JSON.stringify({ run })], 'at once, not after a minute');
  assert.deepEqual(ben.sent, [], 'a seeker of Find a Company waits on, never put into a launch');
  assert.equal(await launchedFor(database, ids['Ada'] ?? '', run, made.clock.now), true, 'kept for its seeker');
  assert.equal(await launchedFor(database, ids['Ben'] ?? '', run, made.clock.now), false);
  // One of the launcher's company may be the first back into it, as the run would let them in after the launcher.
  await made.ask('POST', '/v1/social/company/invite', { name: 'Ben' }, tokens['Ada']);
  assert.equal((await made.ask('POST', '/v1/social/company/accept', { name: 'Ada' }, tokens['Ben'])).status, 200);
  assert.equal(await launchedFor(database, ids['Ben'] ?? '', run, made.clock.now), true, 'a member of its company');
  const elsewhere = new Finder('node-pearl-tomb', {
    seeker: (token) => seekerOf(database, token, made.clock.now),
    found: (found, accounts) => foundRun(database, found, accounts, made.clock.now),
    now: () => made.clock.now,
    instance: () => 'k3j4h5g7',
  });
  const alone = new FakeSocket();
  await elsewhere.heard(elsewhere.opened(alone, true), tokens['Ada'] ?? '');
  await elsewhere.tick();
  assert.deepEqual(alone.sent, [], 'only a playlist launches: an Elite Dungeon’s search waits for its company');
});

test('a Breach is launched from its own zone at its tier’s level, Hard once Normal is won, never matched', async () => {
  assert.equal(asked('/v1/find/node-gullwing-vale--breach-hard'), 'node-gullwing-vale--breach-hard');
  assert.equal(asked('/v1/find/node-gullwing-vale--breach-easy'), null);
  assert.equal(asked('/v1/find/node-overlook-social--breach-normal'), null, 'no Breach’s gate stands there');
  const { tokens: hardy, finderOf: hardOf, kept, ids } = await world(['Cal', 'Eve'], 29);
  const story = { prologue: true, breaches: ['drowned-vale/normal'] };
  await kept.save(ids['Cal'] ?? '', 'room:Cal', JSON.stringify({ shown: { level: 29 }, story }), '{}');
  const unwon = hardOf('node-gullwing-vale--breach-hard');
  const hard = new FakeSocket();
  await unwon.heard(unwon.opened(hard, true), hardy['Eve'] ?? '');
  assert.deepEqual(hard.closed, [4003, BREACH_HARD_SHUT], 'Normal never won');
  const launched = new FakeSocket();
  await unwon.heard(unwon.opened(launched, true), hardy['Cal'] ?? '');
  await unwon.tick();
  assert.deepEqual(launched.sent, [JSON.stringify({ run: 'node-gullwing-vale--breach-hard--run-k3j4h5g6' })]);
  const { tokens, finderOf } = await world(['Ada', 'Ben'], 28);
  const under = finderOf('node-gullwing-vale--breach-hard');
  assert.deepEqual((await seeking(under, tokens['Ada'] ?? '')).closed, [4003, 'A Breach at Hard opens at level 29.']);
  const matched = finderOf('node-gullwing-vale--breach-normal');
  assert.deepEqual((await seeking(matched, tokens['Ada'] ?? '')).closed, [4003, BREACH_LAUNCHED], 'never matched');
  const normal = finderOf('node-gullwing-vale--breach-normal');
  const launch = new FakeSocket();
  await normal.heard(normal.opened(launch, true), tokens['Ben'] ?? '');
  await normal.tick();
  const run = 'node-gullwing-vale--breach-normal--run-k3j4h5g6';
  assert.deepEqual(launch.sent, [JSON.stringify({ run })], 'launched at once');
  assert.equal(runAsk(run, 1), null, 'a Breach’s run is no dungeon’s');
});

test('a Breach launched again by its company within half an hour is the run it launched, not a second', async () => {
  const { made, tokens, ids, database } = await world(['Ada', 'Ben'], 27);
  await made.ask('POST', '/v1/social/company/invite', { name: 'Ben' }, tokens['Ada']);
  assert.equal((await made.ask('POST', '/v1/social/company/accept', { name: 'Ada' }, tokens['Ben'])).status, 200);
  let instance = 0;
  const base = 'node-gullwing-vale--breach-normal';
  const finder = new Finder(base, {
    seeker: (token) => seekerOf(database, token, made.clock.now),
    found: (run, found) => foundRun(database, run, found, made.clock.now),
    relaunched: (account, launched) => companyRunOf(database, account, launched, made.clock.now, BREACH_RELAUNCH_MS),
    now: () => made.clock.now,
    instance: () => `k3j4h5g${(instance += 1)}`,
  });
  const launch = async (name: string) => {
    const socket = new FakeSocket();
    await finder.heard(finder.opened(socket, true), tokens[name] ?? '');
    await finder.tick();
    return socket.sent;
  };
  const first = `${base}--run-k3j4h5g1`;
  assert.deepEqual(await launch('Ben'), [JSON.stringify({ run: first })]);
  assert.deepEqual(await launch('Ada'), [JSON.stringify({ run: first })], 'the company’s second Launch');
  assert.equal(await launchedFor(database, ids['Ada'] ?? '', first, made.clock.now), true);
  made.clock.now += BREACH_RELAUNCH_MS + 1;
  assert.notDeepEqual(await launch('Ada'), [JSON.stringify({ run: first })], 'long after, a run of its own');
});
