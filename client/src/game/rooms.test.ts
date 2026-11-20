import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LIVE_ACCOUNTS } from '../network/accounts.ts';
import { LIVE_ROOMS } from '../network/roomAddress.ts';
import { accountOf, accountsFrom, dungeonRoom, nodeOfRoom, nodeRoom, roomsFrom } from './rooms.ts';

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
});

test('a node’s room name reads back as its node and difficulty, the old names as the new tiers', () => {
  for (const seas of ['normal', 'elite', 'abyss'] as const) {
    const room = nodeRoom({ id: 'saltgrass-downs', kind: 'patrol' }, seas);
    assert.deepEqual(nodeOfRoom(room), { id: 'saltgrass-downs', seas, dungeon: null });
  }
  // A place the accounts kept from before the rename (a presence or a held character) still reads.
  assert.deepEqual(nodeOfRoom('node-saltgrass-downs--rough'), { id: 'saltgrass-downs', seas: 'elite', dungeon: null });
  assert.deepEqual(nodeOfRoom('node-saltgrass-downs--storm'), { id: 'saltgrass-downs', seas: 'abyss', dungeon: null });
  assert.equal(nodeOfRoom('sea'), null);
});

test("a patrol's dungeon has one room at each difficulty, named for its patrol and its number", () => {
  const patrol = { id: 'saltgrass-downs' };
  assert.equal(dungeonRoom(patrol, 'normal', 0), 'node-saltgrass-downs--dungeon-0');
  assert.equal(dungeonRoom(patrol, 'elite', 2), 'node-saltgrass-downs--elite--dungeon-2');
  assert.equal(dungeonRoom(patrol, 'abyss', 1), 'node-saltgrass-downs--abyss--dungeon-1');
});

test("a room's name reads back as its node, its difficulty and its dungeon; a dungeon only after `--`", () => {
  assert.deepEqual(nodeOfRoom('node-saltgrass-downs'), { id: 'saltgrass-downs', seas: 'normal', dungeon: null });
  assert.deepEqual(nodeOfRoom('node-saltgrass-downs--abyss--dungeon-2'), {
    id: 'saltgrass-downs',
    seas: 'abyss',
    dungeon: 2,
  });
  assert.deepEqual(nodeOfRoom('node-saltgrass-downs--rough--dungeon-1'), {
    id: 'saltgrass-downs',
    seas: 'elite',
    dungeon: 1,
  });
  assert.deepEqual(nodeOfRoom('node-dungeon-0'), { id: 'dungeon-0', seas: 'normal', dungeon: null });
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
