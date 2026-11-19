import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type FootHeard, SEA_NEAR_M, type SeaHeard, hearFoot, hearSea } from './hearing.ts';

const PLACE = { kind: 'island', climate: 'desert', node: 'mission' } as const;
const view = (x: number, y: number, more: object = {}) => ({
  x,
  y,
  z: 0,
  health: 50,
  healthMax: 100,
  target: null,
  action: { kind: 'idle' },
  ...more,
});
const event = (kind: number, striker: number, defender: number) => ({ kind, striker, defender });

function fight(more: object): FootHeard {
  return { player: 1, own: view(0, 0), events: [], foes: [], ...more } as unknown as FootHeard;
}

test('on foot: each foe by its rank, alert, distance and health, engaged when it targets the player or blows pass', () => {
  const heard = hearFoot(
    PLACE,
    fight({
      foes: [
        { id: 5, name: 'Reeve', rank: 2, alert: 2, view: view(3, 4, { target: 1 }) },
        { id: 6, name: 'Brute', rank: 1, alert: 2, view: view(30, 40, { target: 9 }) },
        { id: 7, name: 'Archer', rank: 1, alert: 0, view: view(0, 8) },
      ],
      events: [event(1, 1, 7), event(8, 1, 7)],
    }),
  );
  assert.deepEqual(
    heard.foes.map(({ id, distance, health, engaged }) => [id, distance, health, engaged]),
    [
      [5, 5, 0.5, true],
      [6, 50, 0.5, false],
      [7, 8, 0.5, true],
    ],
  );
  assert.equal(heard.struck, true);
  assert.equal(heard.kills, 1);
  assert.equal(heard.health, 0.5);
  assert.equal(heard.dead, false);
  assert.equal(heard.sea, null);
});

test('on foot: a blow between two others is no fight of the player, and the player dead is heard', () => {
  const heard = hearFoot(PLACE, fight({ events: [event(1, 4, 5)], own: view(0, 0, { action: { kind: 'dead' } }) }));
  assert.equal(heard.struck, false);
  assert.equal(heard.dead, true);
});

test('at sea: the hostile ships within reach, and the fight by its hostile captains still afloat', () => {
  const sea = {
    position: [0, 0],
    sighted: {
      pirates: [
        { x: 600, y: 0, rank: 2 },
        { x: SEA_NEAR_M + 1, y: 0, rank: 4 },
      ],
    },
    fight: {
      captains: [
        { hostile: true, state: 'afloat', rank: 3 },
        { hostile: true, state: 'sunk', rank: 5 },
        { hostile: false, state: 'afloat', rank: 5 },
      ],
      vessel: { hull: 30, max_hull: 120 },
    },
  } as unknown as SeaHeard;
  assert.deepEqual(hearSea(sea).sea, {
    fighting: true,
    captains: 1,
    strongest: 3,
    hull: 0.25,
    hostilesNear: 1,
    landfall: false,
  });
  const quiet = { position: [0, 0], sighted: null, fight: null } as unknown as SeaHeard;
  assert.deepEqual(hearSea(quiet).sea, {
    fighting: false,
    captains: 0,
    strongest: 0,
    hull: 1,
    hostilesNear: 0,
    landfall: false,
  });
  assert.deepEqual(hearSea(quiet).place, { kind: 'sea' });
});
