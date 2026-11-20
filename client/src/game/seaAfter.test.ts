import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SeaAfter, linesOf, portCities } from './seaAfter.ts';

test('the sea’s word becomes the player’s lines: washing up, a piece gathered, a ship joining, her colours struck', () => {
  const kinds = new Map([[7, 'chest']]);
  const lines = linesOf(
    [
      [20, 100, 1, 1],
      [21, 101, 7, 3, 1, 0],
      [22, 102, 0, 2, 3],
      [22, 103, 4, 0, 0],
    ],
    [{ kind: 'Struck', tick: 99, ship: 1 }],
    kinds,
    ['Overlook', 'Sunspire', 'Rimeholt'],
  );
  assert.deepEqual(lines, [
    'Her colours are down: come alongside and press E to board her.',
    'Your ship went down: you washed up at Sunspire, your ship moored at its roadstead.',
    'Gathered a chest: a Rare Vestige, an Ammo box.',
    'The Pirate Schooner joined the fight.',
    'Player 4 joined the fight.',
  ]);
});

test('her repair reads its time left, whole, or how to have it', () => {
  assert.equal(SeaAfter.repairWords({ whole: false, left: 12.2 }), 'Repairing her: 13 s left');
  assert.equal(SeaAfter.repairWords({ whole: true, left: 0 }), 'She is whole');
  assert.match(SeaAfter.repairWords({ whole: false, left: 0 }), /within 3 km/);
});

test('washed up, the player walks into the social space of the port city she washed up at once its landmass is open', () => {
  const ports = portCities(
    [
      { id: 'overlook', name: 'Overlook', continent: 'continent-1' },
      { id: 'saltmarsh', name: 'Saltmarsh', continent: 'continent-2' },
      { id: 'sunspire', name: 'Sunspire', continent: 'continent-3' },
    ],
    ['overlook', 'sunspire', 'rimeholt'],
  );
  const after = new SeaAfter(ports);
  const room = {
    flotsam: [],
    takeTold: () => ({ naval: [], told: [[20, 5, 1, 1]] }),
  } as unknown as Parameters<SeaAfter['step']>[0];
  after.step(room);
  const nodes = [{ id: 'sunspire-social' }, { id: 'sunspire-docks' }];
  assert.equal(after.ashore({ id: 'continent-1', nodes }), null, 'her port’s landmass is not open yet');
  const ashore = after.ashore({ id: 'continent-3', nodes });
  assert.deepEqual(ashore, {
    node: { id: 'sunspire-social' },
    washUp: {
      kind: 'wash-up',
      node: 'sunspire-social',
      words: 'Washed up at Sunspire. Your ship lies at its moorings.',
    },
  });
  assert.equal(after.ashore({ id: 'continent-3', nodes }), null, 'taken once');
});
