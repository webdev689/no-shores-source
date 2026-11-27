import assert from 'node:assert/strict';
import { test } from 'node:test';
import { entranceOf, joinedRoom, roomName, sessionHash } from './joinRequest.ts';
import { passageRoomName } from './roomNames.ts';

const asked = (path: string) => new Request(`https://rooms.example/${path}`);

test('a join names its room by its one spelling, and only a room’s name', () => {
  assert.equal(roomName(asked('room/node-saltgrass-downs')), 'node-saltgrass-downs');
  assert.equal(
    roomName(asked('room/node-saltgrass-downs--breach-hard--run-k3j4h5g6')),
    'node-saltgrass-downs--breach-hard--run-k3j4h5g6',
  );
  for (const path of ['room/', 'room/Node-X', 'room/a/b', 'rooms/node-x', `room/${'a'.repeat(65)}`])
    assert.equal(roomName(asked(path)), null, path);
});

test('only a name the rooms open is a room: any other is refused before an object is made for it', () => {
  const rooms = [
    'sea',
    'sea--abyss',
    'node-tidewall--elite',
    'isle-7-0123456789abcdef--elite',
    'sea-dungeon-continent-1-crypt-0123abcd',
    passageRoomName('continent-1', 3, 2),
    'fleet-editor',
    'test-room-launch-1',
  ];
  for (const name of rooms) assert.equal(roomName(asked(`room/${name}`)), name, name);
  for (const name of ['a1', 'a99999', 'sea--normal', 'isle-zz', 'sea-dungeon-x', 'passage-x', 'node-', 'fleet', 'test'])
    assert.equal(roomName(asked(`room/${name}`)), null, name);
});

test('the Worker answers a room asked for without a WebSocket 426, and a name no room has 404', async () => {
  const upgraded = (path: string) =>
    new Request(`https://rooms.example/${path}`, { headers: { Upgrade: 'websocket' } });
  assert.equal(joinedRoom(upgraded('room/sea')), 'sea');
  const plain = joinedRoom(asked('room/sea'));
  assert.ok(plain instanceof Response && plain.status === 426);
  const unknown = joinedRoom(upgraded('room/a1'));
  assert.ok(unknown instanceof Response && unknown.status === 404);
  const health = joinedRoom(asked('health'));
  assert.ok(health instanceof Response && health.status === 200, await (health as Response).text());
});

test('a join stands at the entrance it asks for, one digit, or at none', () => {
  assert.equal(entranceOf(asked('room/x?entrance=2')), 2);
  for (const query of ['', '?entrance=', '?entrance=12', '?entrance=a', '?entrance=-1'])
    assert.equal(entranceOf(asked(`room/x${query}`)), null, query);
});

test('a session is known at sea by its token’s SHA-256 in hex, never the token', async () => {
  assert.equal(await sessionHash('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
