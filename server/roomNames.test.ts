import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COMPANY_MOST } from './accounts/companies.ts';
import { ELITE_DUNGEONS } from './accounts/playlists.ts';
import { roomName } from './joinRequest.ts';
import {
  BREACH_MOST,
  RUN_MOST,
  breachAsk,
  breachRun,
  canonicalRoom,
  isleRoom,
  nodeRoom,
  privateRun,
  runAsk,
  runFull,
  seaDungeonRoom,
  seaRoom,
  seaRoomName,
  socketsMost,
  startedAtSea,
  testRoom,
} from './roomNames.ts';

/** A room's name as the rooms' host takes it from a join's address, at most 64 characters; null for one it refuses. */
const hosted = (name: string) => roomName(new Request(`https://rooms.example/room/${name}`));

/** The Elite Dungeon with the longest id: its runs' names are the longest of theirs. */
const LONGEST = ELITE_DUNGEONS.reduce((longest, place) => (place.length > longest.length ? place : longest));

test('a node has one room at each difficulty, by one spelling each', () => {
  assert.deepEqual(nodeRoom('tidewall'), {
    id: 'tidewall',
    seas: 0,
    dungeon: null,
    run: null,
    playlist: null,
    guild: null,
    breach: null,
  });
  assert.deepEqual(nodeRoom('tidewall--elite'), {
    id: 'tidewall',
    seas: 1,
    dungeon: null,
    run: null,
    playlist: null,
    guild: null,
    breach: null,
  });
  assert.deepEqual(nodeRoom('tidewall--abyss'), {
    id: 'tidewall',
    seas: 2,
    dungeon: null,
    run: null,
    playlist: null,
    guild: null,
    breach: null,
  });
  assert.equal(nodeRoom('tidewall--normal'), null, 'Normal is the plain name');
  assert.equal(nodeRoom('tidewall--abyss--1'), null, 'no fresh copies');
  assert.equal(nodeRoom('tidewall--squall'), null);
  assert.equal(nodeRoom('--elite'), null);
  assert.equal(nodeRoom('tidewall--rough'), null, 'the old names open no second room at a difficulty');
  assert.equal(nodeRoom('tidewall--storm'), null);
});

test('the sea has one room, at Normal: no room opens at its other tiers', () => {
  assert.equal(seaRoom('sea'), 0);
  assert.equal(seaRoom(seaRoomName(0)), 0, 'its name reads back');
  for (const name of ['sea--elite', 'sea--abyss', ...[1, 2].map(seaRoomName)]) assert.equal(seaRoom(name), null, name);
  assert.equal(seaRoom('sea--normal'), null, 'Normal is the plain name');
  assert.equal(seaRoom('sea--abyss--1'), null, 'no fresh copies');
  assert.equal(seaRoom('node-sea'), null);
});

test("an island's room is named by its number and its whole seed, one spelling each", () => {
  assert.deepEqual(isleRoom('5-00000000000000ff'), { id: 5, seed: '255', seas: 0 });
  assert.deepEqual(isleRoom('12-ffffffffffffffff'), { id: 12, seed: '18446744073709551615', seas: 0 });
  assert.equal(isleRoom('5-ff'), null, 'the seed is always 16 digits');
  assert.equal(isleRoom('05-00000000000000ff'), null, 'no leading zero');
  assert.equal(isleRoom('0-00000000000000ff'), null);
  assert.equal(isleRoom('5000000000-00000000000000ff'), null, 'past 32 bits');
  assert.equal(isleRoom('5-00000000000000FF'), null);
  // Landed at the tier the voyage set out at, as a node's room is, an island being the one sea's at any.
  assert.deepEqual(isleRoom('5-00000000000000ff--elite'), { id: 5, seed: '255', seas: 1 }, 'landed at Elite');
  assert.deepEqual(isleRoom('5-00000000000000ff--abyss'), { id: 5, seed: '255', seas: 2 }, 'landed at Abyss');
  assert.equal(isleRoom('5-00000000000000ff--normal'), null, 'Normal is the plain name');
});

test('a patrol’s dungeon is one shared room at Normal and a run at each harder difficulty, by its number', () => {
  for (const [seas, spelled] of ['', '--elite', '--abyss'].entries())
    for (const dungeon of [0, 1, 2]) {
      const [name, run] =
        seas === 0
          ? [`saltgrass-downs--dungeon-${dungeon}`, null]
          : [`saltgrass-downs${spelled}--dungeon-${dungeon}--run-a1b2c3d4`, 'a1b2c3d4'];
      assert.deepEqual(nodeRoom(name), {
        id: 'saltgrass-downs',
        seas,
        dungeon,
        run,
        playlist: null,
        guild: null,
        breach: null,
      });
    }
  for (const name of [
    'saltgrass-downs--dungeon-3',
    'saltgrass-downs--dungeon-01',
    'saltgrass-downs--dungeon-',
    'saltgrass-downs--dungeon',
    'saltgrass-downs--normal--dungeon-0',
    'saltgrass-downs--rough--dungeon-0',
    'saltgrass-downs--dungeon-0--elite',
    'saltgrass-downs--elite--dungeon-0--dungeon-1',
    'saltgrass-downs--dungeon-1--1',
    '--dungeon-0',
  ])
    assert.equal(nodeRoom(name), null, name);
});

test('a node called as a dungeon is named is still its own room, at every difficulty', () => {
  assert.deepEqual(nodeRoom('dungeon-0'), {
    id: 'dungeon-0',
    seas: 0,
    dungeon: null,
    run: null,
    playlist: null,
    guild: null,
    breach: null,
  });
  assert.deepEqual(nodeRoom('dungeon-1--elite'), {
    id: 'dungeon-1',
    seas: 1,
    dungeon: null,
    run: null,
    playlist: null,
    guild: null,
    breach: null,
  });
  assert.deepEqual(nodeRoom('dungeon-2--dungeon-0'), {
    id: 'dungeon-2',
    seas: 0,
    dungeon: 0,
    run: null,
    playlist: null,
    guild: null,
    breach: null,
  });
  assert.deepEqual(nodeRoom('run-a1b2c3d4'), {
    id: 'run-a1b2c3d4',
    seas: 0,
    dungeon: null,
    run: null,
    playlist: null,
    guild: null,
    breach: null,
  });
});

test('a page that still names the old tiers finds the room of the new name, and every other name is as it was', () => {
  for (const [old, now] of [
    ['node-x--rough', 'node-x--elite'],
    ['node-x--storm--dungeon-1--run-a1b2c3d4', 'node-x--abyss--dungeon-1--run-a1b2c3d4'],
  ]) {
    assert.equal(canonicalRoom(old), now);
    assert.deepEqual(nodeRoom(canonicalRoom(old).slice('node-'.length)), nodeRoom(now.slice('node-'.length)), old);
  }
  for (const name of [
    'node-x',
    'node-x--elite',
    'node-x--abyss--dungeon-1--run-a1b2c3d4',
    'node-storm',
    'node-rough--dungeon-0',
    'sea',
  ])
    assert.equal(canonicalRoom(name), name, name);
  assert.equal(canonicalRoom('node-x--constructor'), 'node-x--constructor');
});

test('a run is a room of its own: an instance after its dungeon, at Elite and Abyss, and every Elite Dungeon', () => {
  assert.deepEqual(nodeRoom('saltgrass-downs--abyss--dungeon-2--run-k3j4h5g6'), {
    id: 'saltgrass-downs',
    seas: 2,
    dungeon: 2,
    run: 'k3j4h5g6',
    playlist: null,
    guild: null,
    breach: null,
  });
  assert.deepEqual(nodeRoom('krakens-grotto--run-k3j4h5g6'), {
    id: 'krakens-grotto',
    seas: 0,
    dungeon: null,
    run: 'k3j4h5g6',
    playlist: null,
    guild: null,
    breach: null,
  });
  assert.deepEqual(nodeRoom('saltworm-warrens--abyss--run-k3j4h5g6'), {
    id: 'saltworm-warrens',
    seas: 2,
    dungeon: null,
    run: 'k3j4h5g6',
    playlist: null,
    guild: null,
    breach: null,
  });
  assert.deepEqual(nodeRoom('saltgrass-downs--dungeon-1'), {
    id: 'saltgrass-downs',
    seas: 0,
    dungeon: 1,
    run: null,
    playlist: null,
    guild: null,
    breach: null,
  });
  assert.deepEqual(nodeRoom('tidewall--elite'), {
    id: 'tidewall',
    seas: 1,
    dungeon: null,
    run: null,
    playlist: null,
    guild: null,
    breach: null,
  });
});

test('no name opens a shared Elite or Abyss dungeon, a private Normal one, or a run without its whole instance', () => {
  for (const name of [
    'saltgrass-downs--elite--dungeon-0',
    'saltgrass-downs--dungeon-0--run-k3j4h5g6',
    'krakens-grotto--run-k3j4h5g',
    'krakens-grotto--run-k3j4h5g6x',
    'krakens-grotto--run-K3J4H5G6',
    'krakens-grotto--run-',
    'krakens-grotto--run-k3j4h5g6--run-a1b2c3d4',
    'krakens-grotto--elite--run-k3j4h5g6--dungeon-0',
    'krakens-grotto--normal--run-k3j4h5g6',
  ])
    assert.equal(nodeRoom(name), null, name);
  assert.deepEqual(seaDungeonRoom('sea-dungeon-continent-4-caverns-0a1b2c3d'), {
    continent: 'continent-4',
    style: 'caverns',
    seed: 169_552_957,
    seas: 0,
    run: null,
  });
  assert.deepEqual(seaDungeonRoom('sea-dungeon-continent-4-caverns-0a1b2c3d--abyss--run-k3j4h5g6'), {
    continent: 'continent-4',
    style: 'caverns',
    seed: 169_552_957,
    seas: 2,
    run: 'k3j4h5g6',
  });
  assert.deepEqual(seaDungeonRoom('sea-dungeon-continent-7-mines-ffffffff--elite--run-k3j4h5g6'), {
    continent: 'continent-7',
    style: 'mines',
    seed: 4_294_967_295,
    seas: 1,
    run: 'k3j4h5g6',
  });
  assert.deepEqual(seaDungeonRoom('sea-dungeon-continent-1-crypt-00000000'), {
    continent: 'continent-1',
    style: 'crypt',
    seed: 0,
    seas: 0,
    run: null,
  });
  for (const name of [
    'sea-dungeon-continent-4-caverns-0a1b2c3d--abyss',
    'sea-dungeon-continent-4-crypt-0a1b2c3d--elite',
    'sea-dungeon-continent-4-grotto-0a1b2c3d',
    'sea-dungeon-continent-4-caverns-0a1b2c3',
    'sea-dungeon-continent-4-caverns-0A1B2C3D',
    'sea-dungeon-continent-4-caverns-0a1b2c3d--run-k3j4h5g6',
    'sea-dungeon-continent-10-caverns-0a1b2c3d',
    'sea-dungeon-4-caverns-0a1b2c3d',
  ])
    assert.equal(seaDungeonRoom(name), null, name);
  for (const longest of [
    'sea-dungeon-continent-9-sanctum-ffffffff--abyss--run-zzzzzzzz',
    'node-thunderhoof-grasslands--abyss--dungeon-2--run-zzzzzzzz',
  ])
    assert.equal(hosted(longest), longest);
});

test('each run’s name makes the ask its room opens from', () => {
  const asked = (room: string) => JSON.parse(runAsk(room, 29_919_420) ?? 'null') as unknown;
  assert.deepEqual(asked('node-saltgrass-downs--elite--dungeon-0--run-k3j4h5g6'), {
    dungeon: { patrol: 'saltgrass-downs', number: 0 },
    tier: 1,
    minute: 29_919_420,
  });
  assert.deepEqual(asked('node-saltworm-warrens--abyss--run-k3j4h5g6'), {
    dungeon: { place: 'saltworm-warrens' },
    tier: 2,
    minute: 29_919_420,
  });
  assert.deepEqual(asked('sea-dungeon-continent-4-caverns-0a1b2c3d'), {
    dungeon: { seed: 169_552_957, style: 'caverns', continent: 'continent-4' },
    tier: 0,
    minute: 29_919_420,
  });
  assert.equal(runAsk('node-saltgrass-downs--dungeon-0', 1), null, 'a shared dungeon opens from its patrol’s file');
  assert.equal(runAsk('node-saltgrass-downs', 1), null);
  assert.equal(runAsk('sea', 1), null);
  assert.deepEqual(
    [privateRun('node-krakens-grotto--run-k3j4h5g6'), privateRun('sea-dungeon-continent-4-caverns-0a1b2c3d')],
    [true, false],
  );
});

test('a playlist’s run names its Elite Dungeon, its tier and its foes’ level before its instance', () => {
  const room = 'saltworm-warrens--abyss--playlist-28--run-k3j4h5g6';
  assert.deepEqual(nodeRoom(room), {
    id: 'saltworm-warrens',
    seas: 2,
    dungeon: null,
    run: 'k3j4h5g6',
    playlist: 28,
    guild: null,
    breach: null,
  });
  assert.deepEqual(JSON.parse(runAsk(`node-${room}`, 29_919_420) ?? 'null'), {
    dungeon: { place: 'saltworm-warrens' },
    tier: 2,
    minute: 29_919_420,
    playlist: 28,
  });
  for (const name of [
    'krakens-grotto--playlist-12--run-k3j4h5g6',
    'krakens-grotto--elite--playlist-12',
    'krakens-grotto--elite--playlist-012--run-k3j4h5g6',
    'krakens-grotto--elite--playlist---run-k3j4h5g6',
    'krakens-grotto--elite--dungeon-0--playlist-12--run-k3j4h5g6',
    'krakens-grotto--elite--playlist-12--dungeon-0--run-k3j4h5g6',
  ])
    assert.equal(nodeRoom(name), null, name);
  assert.ok(privateRun(`node-${room}`));
  const longest = `node-${LONGEST}--abyss--playlist-32--run-zzzzzzzz`;
  assert.equal(hosted(longest), longest);
});

test('the week’s run started from the Playlist is marked `--sea`, and opens as the week’s run does', () => {
  const [marked, door] = ['saltworm-warrens--abyss--sea--run-k3j4h5g6', 'saltworm-warrens--abyss--run-k3j4h5g6'];
  assert.deepEqual(nodeRoom(marked), nodeRoom(door));
  assert.equal(runAsk(`node-${marked}`, 29_919_420), runAsk(`node-${door}`, 29_919_420));
  assert.ok(startedAtSea(`node-${marked}`));
  assert.ok(startedAtSea('node-saltworm-warrens--abyss--playlist-28--run-k3j4h5g6'), 'a playlist’s run');
  assert.ok(!startedAtSea(`node-${door}`), 'one gone into by its door');
  assert.ok(!startedAtSea('sea--run-k3j4h5g6'));
  for (const name of [
    'saltworm-warrens--normal--sea--run-k3j4h5g6',
    'saltworm-warrens--abyss--sea',
    'saltworm-warrens--abyss--dungeon-1--sea--run-k3j4h5g6',
    'saltworm-warrens--abyss--sea--dungeon-1--run-k3j4h5g6',
    'saltworm-warrens--abyss--playlist-28--sea--run-k3j4h5g6',
    'saltworm-warrens--abyss--sea--playlist-28--run-k3j4h5g6',
    'saltworm-warrens--abyss--sea--sea--run-k3j4h5g6',
  ])
    assert.equal(nodeRoom(name), null, name);
  assert.ok(startedAtSea(hosted(`node-${LONGEST}--abyss--sea--run-zzzzzzzz`) ?? ''));
});

test('an Elite Dungeon’s run at Normal started at sea is marked `--sea` with no tier, and opens as its door’s does', () => {
  const [marked, door] = ['krakens-grotto--sea--run-k3j4h5g6', 'krakens-grotto--run-k3j4h5g6'];
  assert.deepEqual(nodeRoom(marked), nodeRoom(door));
  assert.deepEqual(JSON.parse(runAsk(`node-${marked}`, 29_919_420) ?? 'null'), {
    dungeon: { place: 'krakens-grotto' },
    tier: 0,
    minute: 29_919_420,
  });
  assert.ok(startedAtSea(`node-${marked}`));
  assert.ok(!startedAtSea(`node-${door}`), 'one gone into by its door');
  assert.ok(privateRun(`node-${marked}`));
  assert.equal(nodeRoom('sea--run-k3j4h5g6')?.id, 'sea', 'a node may itself be called `sea`');
  assert.ok(!startedAtSea('node-sea--run-k3j4h5g6'));
  for (const name of [
    'krakens-grotto--sea',
    'krakens-grotto--sea--elite--run-k3j4h5g6',
    'krakens-grotto--dungeon-0--sea--run-k3j4h5g6',
    'krakens-grotto--sea--dungeon-0--run-k3j4h5g6',
    'krakens-grotto--playlist-12--sea--run-k3j4h5g6',
    'krakens-grotto--breach-normal--sea--run-k3j4h5g6',
  ])
    assert.equal(nodeRoom(name), null, name);
  assert.ok(startedAtSea(hosted(`node-${LONGEST}--sea--run-zzzzzzzz`) ?? ''));
});

test('a run holds four, a Breach’s run a company’s most, and only a run is ever full this way', () => {
  assert.equal(BREACH_MOST, COMPANY_MOST);
  assert.equal(runFull('node-krakens-grotto--run-k3j4h5g6', 4), null);
  assert.equal(runFull('node-krakens-grotto--run-k3j4h5g6', 5), 'This run is full.');
  assert.equal(runFull('node-gullwing-vale--breach-hard--run-k3j4h5g6', 8), null);
  assert.equal(runFull('node-gullwing-vale--breach-hard--run-k3j4h5g6', 9), 'This run is full.');
  assert.equal(runFull('node-saltgrass-downs', 65), null, 'no run');
});

test('a run takes twice a company of sockets at join, signed in or not, and any other room 64', () => {
  assert.equal(socketsMost('node-krakens-grotto--run-k3j4h5g6'), RUN_MOST * 2);
  assert.equal(socketsMost('node-gullwing-vale--breach-normal--run-k3j4h5g6'), BREACH_MOST * 2);
  assert.deepEqual(
    ['sea', 'node-saltgrass-downs', 'sea-dungeon-continent-4-caverns-0a1b2c3d'].map(socketsMost),
    [64, 64, 64],
  );
});

test('a guild’s outpost’s room is a bare node’s with its guild’s key last, and no other ending goes with it', () => {
  assert.deepEqual(nodeRoom('oakfast-landing--guild-0a1b2c3d4e5f60718293a4b5c6d7e8f9'), {
    id: 'oakfast-landing',
    seas: 0,
    dungeon: null,
    run: null,
    playlist: null,
    guild: '0a1b2c3d4e5f60718293a4b5c6d7e8f9',
    breach: null,
  });
  for (const name of [
    'oakfast-landing--guild-0A1B2C3D4E5F60718293A4B5C6D7E8F9',
    'oakfast-landing--guild-0a1b2c3d4e5f60718293a4b5c6d7e8f',
    'oakfast-landing--guild-0a1b2c3d4e5f60718293a4b5c6d7e8f94',
    'oakfast-landing--elite--guild-0a1b2c3d4e5f60718293a4b5c6d7e8f9',
    'oakfast-landing--dungeon-0--guild-0a1b2c3d4e5f60718293a4b5c6d7e8f9',
    'oakfast-landing--guild-0a1b2c3d4e5f60718293a4b5c6d7e8f9--elite',
    'oakfast-landing--guild-0a1b2c3d4e5f60718293a4b5c6d7e8f9--normal--run-a1b2c3d4',
    'oakfast-landing--guild-0a1b2c3d4e5f60718293a4b5c6d7e8f9--storm--run-a1b2c3d4',
    'oakfast-landing--guild-0a1b2c3d4e5f60718293a4b5c6d7e8f9--run-a1b2c3d',
    'oakfast-landing--guild-0a1b2c3d4e5f60718293a4b5c6d7e8f9--elite--run-a1b2c3d4--run-a1b2c3d4',
    'oakfast-landing--guild-0a1b2c3d4e5f60718293a4b5c6d7e8f9--dungeon-0--run-a1b2c3d4',
    'oakfast-landing--guild-0a1b2c3d4e5f60718293a4b5c6d7e8f9--playlist-12--run-a1b2c3d4',
    '--guild-0a1b2c3d4e5f60718293a4b5c6d7e8f9',
  ])
    assert.equal(nodeRoom(name), null, name);
  assert.equal(nodeRoom('oakfast-landing')?.guild, null, 'the wild site is nobody’s plot');
  assert.equal(
    canonicalRoom('node-oakfast-landing--guild-0a1b2c3d4e5f60718293a4b5c6d7e8f9'),
    'node-oakfast-landing--guild-0a1b2c3d4e5f60718293a4b5c6d7e8f9',
  );
});

test('a Breach’s run names its gate’s patrol zone and its tier before its instance, and opens from its ask', () => {
  const room = 'gullwing-vale--breach-hard--run-k3j4h5g6';
  assert.deepEqual(nodeRoom(room), {
    id: 'gullwing-vale',
    seas: 0,
    dungeon: null,
    run: 'k3j4h5g6',
    playlist: null,
    guild: null,
    breach: 1,
  });
  assert.equal(nodeRoom('gullwing-vale--breach-normal--run-k3j4h5g6')?.breach, 0);
  for (const name of [
    'gullwing-vale--breach-hard',
    'gullwing-vale--breach-easy--run-k3j4h5g6',
    'gullwing-vale--elite--breach-hard--run-k3j4h5g6',
    'gullwing-vale--breach-hard--dungeon-0--run-k3j4h5g6',
    'gullwing-vale--breach-hard--playlist-12--run-k3j4h5g6',
  ])
    assert.equal(nodeRoom(name), null, name);
  assert.equal(runAsk(`node-${room}`, 7), null, 'no dungeon’s run');
  assert.deepEqual(JSON.parse(breachAsk(`node-${room}`, 7) ?? 'null'), { zone: 'gullwing-vale', tier: 1, minute: 7 });
  assert.equal(breachAsk('node-krakens-grotto--run-k3j4h5g6', 7), null);
  assert.deepEqual(breachRun(`node-${room}`), { zone: 'node-gullwing-vale', tier: 1 });
  assert.ok(privateRun(`node-${room}`));
  assert.equal(
    hosted('node-gullwing-vale--breach-normal--run-zzzzzzzz'),
    'node-gullwing-vale--breach-normal--run-zzzzzzzz',
  );
});

test('a test run is named as its real run is with `--test-<instance>` last, and the Breach’s zone copy shares it', () => {
  const run = { dungeon: null, playlist: null, guild: null, breach: null, test: true };
  assert.deepEqual(nodeRoom('krakens-grotto--abyss--playlist-30--test-k3j4h5g6'), {
    ...run,
    id: 'krakens-grotto',
    seas: 2,
    run: 'k3j4h5g6',
    playlist: 30,
  });
  assert.deepEqual(nodeRoom('krakens-grotto--elite--test-k3j4h5g6'), {
    ...run,
    id: 'krakens-grotto',
    seas: 1,
    run: 'k3j4h5g6',
  });
  assert.deepEqual(nodeRoom('gullwing-vale--breach-hard--test-k3j4h5g6'), {
    ...run,
    id: 'gullwing-vale',
    seas: 0,
    run: 'k3j4h5g6',
    breach: 1,
  });
  assert.deepEqual(nodeRoom('gullwing-vale--test-k3j4h5g6'), { ...run, id: 'gullwing-vale', seas: 0, run: null });
  for (const name of [
    'krakens-grotto--test-k3j4h5g6',
    'saltgrass-downs--test-k3j4h5g6',
    'krakens-grotto--normal--test-k3j4h5g6',
    'krakens-grotto--rough--test-k3j4h5g6',
    'krakens-grotto--elite--test-k3j4h5g',
    'krakens-grotto--elite--test-K3J4H5G6',
    'krakens-grotto--elite--test-k3j4h5g6--test-k3j4h5g6',
    'krakens-grotto--elite--run-k3j4h5g6--test-k3j4h5g6',
    'krakens-grotto--elite--test-k3j4h5g6--run-k3j4h5g6',
    'krakens-grotto--elite--sea--test-k3j4h5g6',
    'krakens-grotto--elite--dungeon-0--test-k3j4h5g6',
    'krakens-grotto--playlist-30--test-k3j4h5g6',
    'gullwing-vale--elite--breach-hard--test-k3j4h5g6',
    'gullwing-vale--breach-easy--test-k3j4h5g6',
    'oakfast-landing--guild-0a1b2c3d4e5f60718293a4b5c6d7e8f9--test-k3j4h5g6',
    '--test-k3j4h5g6',
  ])
    assert.equal(nodeRoom(name), null, name);
  assert.equal(nodeRoom('krakens-grotto--elite--run-k3j4h5g6')?.test, undefined, 'a real run is no test');
  assert.equal(nodeRoom('gullwing-vale')?.test, undefined, 'nor a real zone');
});

test('a test run opens from its real run’s ask, holds a run’s sockets, and its Breach’s gate is its own zone copy', () => {
  const playlist = 'node-krakens-grotto--abyss--playlist-30--test-k3j4h5g6';
  assert.equal(runAsk(playlist, 7), runAsk('node-krakens-grotto--abyss--playlist-30--run-k3j4h5g6', 7));
  assert.equal(startedAtSea(playlist), true, 'a playlist’s test run is entered from the sea as its run is');
  const breach = 'node-gullwing-vale--breach-normal--test-k3j4h5g6';
  assert.equal(breachAsk(breach, 7), breachAsk('node-gullwing-vale--breach-normal--run-k3j4h5g6', 7));
  assert.deepEqual(breachRun(breach), { zone: 'node-gullwing-vale--test-k3j4h5g6', tier: 0 });
  const zone = 'node-gullwing-vale--test-k3j4h5g6';
  assert.equal(runAsk(zone, 7), null, 'the zone copy opens as its node does');
  assert.equal(breachAsk(zone, 7), null);
  for (const name of [playlist, breach, zone, 'node-krakens-grotto--elite--test-k3j4h5g6']) {
    assert.ok(testRoom(name), name);
    assert.ok(privateRun(name), name);
  }
  assert.equal(socketsMost(breach), BREACH_MOST * 2);
  assert.equal(socketsMost(zone), BREACH_MOST * 2, 'the zone copy holds the Breach’s company');
  assert.equal(socketsMost(playlist), RUN_MOST * 2);
  for (const name of [
    'node-krakens-grotto--elite--run-k3j4h5g6',
    'node-gullwing-vale',
    'test-course',
    'node-krakens-grotto--test-k3j4h5g6',
    'sea--test-k3j4h5g6',
  ])
    assert.equal(testRoom(name), false, name);
});
