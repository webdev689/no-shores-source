import assert from 'node:assert/strict';
import { test } from 'node:test';
import { entranceOf, roomName, sessionHash } from './joinRequest.ts';

const asked = (path: string) => new Request(`https://rooms.example/${path}`);

test('a join names its room by its one spelling, and only a room’s name', () => {
  assert.equal(roomName(asked('room/node-saltgrass-downs')), 'node-saltgrass-downs');
  assert.equal(
    roomName(asked('room/node-gullwing-vale--breach-hard--run-k3j4h5g6')),
    'node-gullwing-vale--breach-hard--run-k3j4h5g6',
  );
  for (const path of ['room/', 'room/Node-X', 'room/a/b', 'rooms/node-x', `room/${'a'.repeat(65)}`])
    assert.equal(roomName(asked(path)), null, path);
});

test('a join stands at the entrance it asks for, one digit, or at none', () => {
  assert.equal(entranceOf(asked('room/x?entrance=2')), 2);
  for (const query of ['', '?entrance=', '?entrance=12', '?entrance=a', '?entrance=-1'])
    assert.equal(entranceOf(asked(`room/x${query}`)), null, query);
});

test('a session is known at sea by its token’s SHA-256 in hex, never the token', async () => {
  assert.equal(await sessionHash('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
