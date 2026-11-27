import assert from 'node:assert/strict';
import { test } from 'node:test';
import { keptRoomOn } from './keptRoom.ts';

test("the keeper's room on a room's door opens a taken-over player's chests, then posts what lies to their mail", () => {
  const steps: string[] = [];
  const door = {
    parting: (player: number) => steps.push(`parting ${player}`),
    mailLying: (player: number) => steps.push(`mail ${player}`),
    keptApart: () => null,
    judgedMoved: () => false,
    restoreJoined: () => false,
    shut: () => '',
    name: () => false,
    tag: () => false,
    guild: () => false,
  };
  const guarded = <T>(call: () => T, fallback: T): T => {
    steps.push('guarded');
    return call() ?? fallback;
  };
  keptRoomOn(door, guarded).mailLying(3);
  assert.deepEqual(steps, ['guarded', 'parting 3', 'guarded', 'mail 3'], 'each call into the room is guarded');
});

test("a fault in the room's parting is caught and the mail is still posted", () => {
  const steps: string[] = [];
  const door = {
    parting: () => {
      throw new Error('trapped');
    },
    mailLying: (player: number) => steps.push(`mail ${player}`),
    keptApart: () => null,
    judgedMoved: () => false,
    restoreJoined: () => false,
    shut: () => '',
    name: () => false,
    tag: () => false,
    guild: () => false,
  };
  const guarded = <T>(call: () => T, fallback: T): T => {
    try {
      return call();
    } catch {
      return fallback;
    }
  };
  keptRoomOn(door, guarded).mailLying(4);
  assert.deepEqual(steps, ['mail 4']);
});
