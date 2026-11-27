import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LIVE_ACCOUNTS } from '../network/accounts.ts';
import { LIVE_ROOMS } from '../network/roomAddress.ts';
import {
  testZoneOf,
  accountOf,
  accountsFrom,
  dungeonRoom,
  nodeOfRoom,
  nodeRoom,
  roomSeas,
  roomsFrom,
  runInstance,
  runOf,
  sharedRun,
  startedAtSea,
} from './rooms.ts';

const KEY = '0a1b2c3d4e5f60718293a4b5c6d7e8f9';
test('without ?room= the game plays offline', () => {
  assert.equal(roomsFrom(null), null);
});

test('a whole address names the server, with or without a room after it', () => {
  assert.equal(roomsFrom('ws://127.0.0.1:8787')?.('sea'), 'ws://127.0.0.1:8787/room/sea');
  assert.equal(roomsFrom('ws://127.0.0.1:8787/')?.('sea'), 'ws://127.0.0.1:8787/room/sea');
  assert.equal(
    roomsFrom('ws://127.0.0.1:8787/room/playtest')?.('node-tidewall'),
    'ws://127.0.0.1:8787/room/node-tidewall',
  );
});

test('anything else plays on the deployed rooms', () => {
  assert.equal(roomsFrom('live')?.('node-overlook-social'), `${LIVE_ROOMS}/room/node-overlook-social`);
});

test('the deployed rooms keep characters on the deployed accounts; a local server only on accounts named', () => {
  assert.equal(accountsFrom('live', null), LIVE_ACCOUNTS);
  assert.equal(accountsFrom(null, null), null);
  assert.equal(accountsFrom('ws://127.0.0.1:8787', null), null);
  assert.equal(accountsFrom('ws://127.0.0.1:8787', 'http://127.0.0.1:8788'), 'http://127.0.0.1:8788');
  assert.equal(accountsFrom('live', 'elsewhere'), LIVE_ACCOUNTS, 'only a whole address names other accounts');
  // A crafted link sends the session nowhere but the deployed accounts and rooms, or this machine's own.
  assert.equal(accountsFrom('live', 'https://evil.example'), LIVE_ACCOUNTS, 'accounts elsewhere are never named');
  assert.equal(accountsFrom('wss://evil.example', null), null, "another's room gets no session");
  assert.equal(accountsFrom('wss://evil.example', 'http://127.0.0.1:8788'), null);
  assert.equal(accountsFrom('ws://localhost:8787', 'http://localhost:8788/'), 'http://localhost:8788/');
});

test('a harder voyage to a patrol is a room of its own; a social space is one for all', () => {
  assert.equal(nodeRoom({ id: 'saltgrass-downs', kind: 'patrol' }, 'normal'), 'node-saltgrass-downs');
  assert.equal(nodeRoom({ id: 'saltgrass-downs', kind: 'patrol' }, 'elite'), 'node-saltgrass-downs--elite');
  assert.equal(nodeRoom({ id: 'saltgrass-downs', kind: 'patrol' }, 'abyss'), 'node-saltgrass-downs--abyss');
  assert.equal(nodeRoom({ id: 'overlook-social', kind: 'social' }, 'abyss'), 'node-overlook-social');
  // Alone too: a social space stands at Normal on any voyage, a patrol at the voyage's own.
  assert.equal(roomSeas({ kind: 'social' }, 'abyss'), 'normal');
  assert.equal(roomSeas({ kind: 'patrol' }, 'elite'), 'elite');
});

test("an outpost site is its guild's own room for a member, the wild site for anyone else, at any difficulty", () => {
  const site = { id: 'brine-reach-outpost', kind: 'outpost' };
  assert.equal(
    nodeRoom(site, 'elite', '0a1b2c3d4e5f60718293a4b5c6d7e8f9'),
    'node-brine-reach-outpost--guild-0a1b2c3d4e5f60718293a4b5c6d7e8f9',
  );
  assert.equal(nodeRoom(site, 'abyss', null), 'node-brine-reach-outpost');
  assert.equal(
    nodeRoom({ id: 'saltgrass-downs', kind: 'patrol' }, 'normal', '0a1b2c3d4e5f60718293a4b5c6d7e8f9'),
    'node-saltgrass-downs',
  );
  const kept = {
    id: 'brine-reach-outpost',
    seas: 'normal',
    dungeon: null,
    run: null,
    playlist: null,
    guild: KEY,
    breach: null,
  };
  assert.deepEqual(
    nodeOfRoom('node-brine-reach-outpost--guild-0a1b2c3d4e5f60718293a4b5c6d7e8f9'),
    kept,
    'a kept place there reads as the site',
  );
  const delve = `node-brine-reach-outpost--guild-${KEY}--elite--run-k3j4h5g6`;
  assert.deepEqual(nodeOfRoom(delve), { ...kept, seas: 'elite', run: 'k3j4h5g6' }, 'its guild dungeon’s run');
  assert.deepEqual(nodeOfRoom(`node-brine-reach-outpost--guild-${KEY}--run-k3j4h5g6`), { ...kept, run: 'k3j4h5g6' });
  for (const wrong of [`--guild-${KEY}--elite`, `--guild-${KEY}--dungeon-0`, `--elite--guild-${KEY}`])
    assert.equal(nodeOfRoom(`node-brine-reach-outpost${wrong}`), null, wrong);
});

test('a node’s room name reads back as its node and difficulty, the old names as the new tiers', () => {
  for (const seas of ['normal', 'elite', 'abyss'] as const) {
    const room = nodeRoom({ id: 'saltgrass-downs', kind: 'patrol' }, seas);
    assert.deepEqual(nodeOfRoom(room), {
      id: 'saltgrass-downs',
      seas,
      dungeon: null,
      run: null,
      playlist: null,
      guild: null,
      breach: null,
    });
  }
  // A place the accounts kept under the other names (a presence or a held character) still reads.
  assert.deepEqual(nodeOfRoom('node-saltgrass-downs--rough'), {
    id: 'saltgrass-downs',
    seas: 'elite',
    dungeon: null,
    run: null,
    playlist: null,
    guild: null,
    breach: null,
  });
  assert.deepEqual(nodeOfRoom('node-saltgrass-downs--storm'), {
    id: 'saltgrass-downs',
    seas: 'abyss',
    dungeon: null,
    run: null,
    playlist: null,
    guild: null,
    breach: null,
  });
  assert.equal(nodeOfRoom('sea'), null);
});

test("a patrol's dungeon has one room at each difficulty, named for its patrol and its number", () => {
  const patrol = { id: 'saltgrass-downs' };
  assert.equal(dungeonRoom(patrol, 'normal', 0), 'node-saltgrass-downs--dungeon-0');
  assert.equal(dungeonRoom(patrol, 'elite', 2), 'node-saltgrass-downs--elite--dungeon-2');
  assert.equal(dungeonRoom(patrol, 'abyss', 1), 'node-saltgrass-downs--abyss--dungeon-1');
});

test("a room's name reads back as its node, its difficulty and its dungeon; a dungeon only after `--`", () => {
  assert.deepEqual(nodeOfRoom('node-saltgrass-downs'), {
    id: 'saltgrass-downs',
    seas: 'normal',
    dungeon: null,
    run: null,
    playlist: null,
    guild: null,
    breach: null,
  });
  assert.deepEqual(nodeOfRoom('node-saltgrass-downs--abyss--dungeon-2'), {
    id: 'saltgrass-downs',
    seas: 'abyss',
    dungeon: 2,
    run: null,
    playlist: null,
    guild: null,
    breach: null,
  });
  assert.deepEqual(nodeOfRoom('node-saltgrass-downs--rough--dungeon-1'), {
    id: 'saltgrass-downs',
    seas: 'elite',
    dungeon: 1,
    run: null,
    playlist: null,
    guild: null,
    breach: null,
  });
  assert.deepEqual(nodeOfRoom('node-dungeon-0'), {
    id: 'dungeon-0',
    seas: 'normal',
    dungeon: null,
    run: null,
    playlist: null,
    guild: null,
    breach: null,
  });
  assert.equal(nodeOfRoom('sea'), null);
});

test('the rooms take the session as it stands when they connect, so a sign-in after startup is the one they use', async () => {
  const kept = new Map<string, string>();
  const store = {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
    removeItem: (key: string) => void kept.delete(key),
  };
  const guestToken = 'a'.repeat(64);
  const signedIn = 'b'.repeat(64);
  const fetched = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ token: guestToken, account: { id: 'g', username: null, guest: true } }), {
      status: 200,
    })) as typeof fetch;
  try {
    const page = { search: '?room=live', hash: '', pathname: '/' } as Location;
    const { session } = accountOf(page, store, store);
    assert.equal(await session(), guestToken, 'the startup guest');
    // Signing in keeps the new token where the account link keeps its session.
    for (const key of kept.keys()) kept.set(key, signedIn);
    assert.equal(await session(), signedIn, 'the account signed in to mid-story');
  } finally {
    globalThis.fetch = fetched;
  }
});

test('a dungeon at Elite or Abyss and every Elite Dungeon is a run, joined where the company already is', () => {
  const base = dungeonRoom({ id: 'saltgrass-downs' }, 'abyss', 2);
  assert.equal(runOf(base, 'k3j4h5g6'), 'node-saltgrass-downs--abyss--dungeon-2--run-k3j4h5g6');
  const grotto = nodeRoom({ id: 'krakens-grotto', kind: 'dungeon' }, 'normal');
  assert.equal(runOf(grotto, 'k3j4h5g6'), 'node-krakens-grotto--run-k3j4h5g6');
  assert.deepEqual(nodeOfRoom('node-saltgrass-downs--abyss--dungeon-2--run-k3j4h5g6'), {
    id: 'saltgrass-downs',
    seas: 'abyss',
    dungeon: 2,
    run: 'k3j4h5g6',
    playlist: null,
    guild: null,
    breach: null,
  });
  assert.deepEqual(nodeOfRoom('node-krakens-grotto--abyss--playlist-28--run-k3j4h5g6'), {
    id: 'krakens-grotto',
    seas: 'abyss',
    dungeon: null,
    run: 'k3j4h5g6',
    playlist: 28,
    guild: null,
    breach: null,
  });
  // An Elite Dungeon's run at Normal started at sea, from the island's tiles, reads as its run at Normal.
  const normal = 'node-krakens-grotto--sea--run-k3j4h5g6';
  assert.deepEqual(nodeOfRoom(normal), nodeOfRoom('node-krakens-grotto--run-k3j4h5g6'));
  assert.ok(startedAtSea(normal));
  // The week's run launched from the Playlist reads as the week's run, and as one started at sea.
  const week = 'node-krakens-grotto--abyss--sea--run-k3j4h5g6';
  assert.deepEqual(nodeOfRoom(week), nodeOfRoom('node-krakens-grotto--abyss--run-k3j4h5g6'));
  assert.ok(startedAtSea(week) && !startedAtSea('node-krakens-grotto--abyss--run-k3j4h5g6'));
  for (const name of [
    'node-krakens-grotto--playlist-12--run-k3j4h5g6',
    'node-krakens-grotto--elite--playlist-12',
    'node-saltgrass-downs--elite--dungeon-1--playlist-12--run-k3j4h5g6',
    'node-krakens-grotto--abyss--sea',
    'node-saltgrass-downs--elite--dungeon-1--sea--run-k3j4h5g6',
    'node-krakens-grotto--abyss--playlist-28--sea--run-k3j4h5g6',
  ])
    assert.equal(nodeOfRoom(name), null, name);
  assert.deepEqual(nodeOfRoom('node-krakens-grotto--run-k3j4h5g6'), {
    id: 'krakens-grotto',
    seas: 'normal',
    dungeon: null,
    run: 'k3j4h5g6',
    playlist: null,
    guild: null,
    breach: null,
  });
  const places = [
    null,
    'node-saltgrass-downs',
    `${base}--run-m9n8b7v6`,
    'node-saltgrass-downs--abyss--dungeon-1--run-a1b2c3d4',
  ];
  assert.equal(sharedRun(base, places), `${base}--run-m9n8b7v6`);
  assert.equal(
    sharedRun(dungeonRoom({ id: 'saltgrass-downs' }, 'elite', 2), places),
    null,
    'another tier is another run',
  );
  assert.match(runInstance(), /^[a-z0-9]{8}$/);
  assert.equal(
    runInstance((bytes) => bytes.fill(0)),
    'aaaaaaaa',
  );
  assert.equal(
    runInstance((bytes) => bytes.fill(35)),
    '99999999',
  );
});

test("a Breach's run reads as its gate's patrol zone and its tier, as the rooms read it, and only as a run", () => {
  assert.deepEqual(nodeOfRoom('node-gullwing-vale--breach-hard--run-k3j4h5g6'), {
    id: 'gullwing-vale',
    seas: 'normal',
    dungeon: null,
    run: 'k3j4h5g6',
    playlist: null,
    guild: null,
    breach: 1,
  });
  assert.equal(nodeOfRoom('node-gullwing-vale--breach-normal--run-k3j4h5g6')?.breach, 0);
  for (const name of [
    'node-gullwing-vale--breach-normal',
    'node-gullwing-vale--elite--breach-normal--run-k3j4h5g6',
    'node-gullwing-vale--dungeon-1--breach-hard--run-k3j4h5g6',
    'node-gullwing-vale--breach-easy--run-k3j4h5g6',
  ])
    assert.equal(nodeOfRoom(name)?.breach ?? null, null, name);
});

test('a test room reads as the run it stands for, marked a test; a Breach test opens from its zone copy', () => {
  assert.deepEqual(nodeOfRoom('node-pearl-tomb--abyss--playlist-32--test-ab12cd34'), {
    id: 'pearl-tomb',
    seas: 'abyss',
    dungeon: null,
    run: 'ab12cd34',
    playlist: 32,
    guild: null,
    breach: null,
    test: true,
  });
  assert.equal(nodeOfRoom('node-cinder-deep--elite--test-ab12cd34')?.test, true);
  assert.equal(nodeOfRoom('node-cinder-deep--elite--run-ab12cd34')?.test, undefined, 'a run is no test');
  const breach = 'node-gullwing-vale--breach-hard--test-ab12cd34';
  assert.equal(nodeOfRoom(breach)?.breach, 1);
  assert.equal(testZoneOf(breach), 'node-gullwing-vale--test-ab12cd34');
  assert.equal(testZoneOf('node-gullwing-vale--breach-hard--run-ab12cd34'), null, 'a real run opens from the zone');
  // As the rooms read them: the zone copy is no run, and what they open no test of is no room.
  assert.equal(nodeOfRoom('node-gullwing-vale--test-ab12cd34')?.run, null, 'the zone copy');
  for (const none of [
    'node-krakens-grotto--test-ab12cd34',
    'node-saltmere-wilds--elite--dungeon-1--test-ab12cd34',
    'node-cinder-deep--elite--sea--test-ab12cd34',
    'node-overlook-social--test-ab12cd34',
  ])
    assert.equal(nodeOfRoom(none), null, none);
});
