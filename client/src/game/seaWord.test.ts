import assert from 'node:assert/strict';
import { test } from 'node:test';
import { portCities } from './worldData.ts';
import { heldGains } from './gains.ts';
import { SeaWord, linesOf, washedUpWords } from './seaWord.ts';

const FACTS = { engageM: 750, holdReachM: 1_642.8, repairReachM: 3_000, shipNames: [] };

test('the sea’s word becomes the player’s lines: washing up, a piece that gave nothing, a ship joining, its colours struck', () => {
  const kinds = new Map([[8, 'chest']]);
  const names = new Map([[1, 'Tithe Brig']]);
  const lines = linesOf(
    [
      [20, 100, 1, 1],
      [21, 101, 7, 3, 1, 0],
      [21, 101, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [22, 102, 0, 2, 3, 1],
      [22, 103, 4, 0, 0, 0],
    ],
    [
      { kind: 'Struck', tick: 99, ship: 1 },
      { kind: 'Boarding', tick: 100, ship: 1 },
    ],
    { kinds, ports: ['Overlook', 'Sunspire', 'Rimeholt'], nameOf: (ship) => names.get(ship) ?? null },
  );
  assert.deepEqual(lines, [
    'The Tithe Brig’s colours are down: come alongside and press E to board it.',
    'Boarders away: the Tithe Brig’s crew stands to meet them.',
    'Your ship went down: you washed up at Sunspire; your ship lies at its roadstead.',
    'Gathered a chest: nothing you had room for.',
    'The Pirate Schooner joined the fight.',
    'Player 4 joined the fight.',
  ]);
});

test('what a piece held at sea goes to the feed, and is not said again', () => {
  const held = [21, 1, 7, 5, 1, 0, 4, 0, 2, 0, 1, 25, 2, 0];
  assert.deepEqual(linesOf([held], [], { kinds: new Map(), ports: [], nameOf: () => null }), []);
  const gains = heldGains(held);
  assert.deepEqual(
    gains.map((gain) => [gain.key, gain.name, gain.count]),
    [
      ['vestige-4', 'Atheric Vestige', 1],
      ['ammo-box', 'Ammo box', 1],
      ['ship-0', 'Timber', 4],
      ['ship-2', 'Iron', 2],
      ['module-25-2-0', gains[4]?.name, 1],
    ],
  );
  assert.ok(gains[4]?.glyph !== 'item' && gains[4]?.rarity === 2, 'the module by its own glyph and rarity');
  const word = new SeaWord([], FACTS);
  const room = { flotsam: [], takeTold: () => ({ naval: [], told: [held] }), shipNamed: () => null };
  word.step(room as unknown as Parameters<SeaWord['step']>[0]);
  assert.equal(word.takeGained().length, 5);
  assert.equal(word.takeGained().length, 0, 'taken once');
});

test('the ship’s repair reads its time left, whole, or how to have it, by the rules’ reach', () => {
  const word = new SeaWord([], FACTS);
  assert.equal(word.repairWords({ whole: false, left: 12.2 }), 'Repairing it: 13 s left');
  assert.equal(word.repairWords({ whole: true, left: 0 }), 'The ship is whole');
  assert.equal(word.repairWords({ whole: false, left: 0 }), 'Repair: free, lying at rest within 3 km of a port city');
  assert.equal(word.repairWords(null), 'Repairs are made at sea, by a port city');
  assert.match(new SeaWord([], { ...FACTS, repairReachM: 1_500 }).repairWords({ whole: false, left: 0 }), /1\.5 km/);
});

test('washed up, the player walks into the social space of the port city they washed up at once its landmass is open', () => {
  const ports = portCities(
    [
      { id: 'overlook', name: 'Overlook', continent: 'continent-1' },
      { id: 'saltmarsh', name: 'Saltmarsh', continent: 'continent-2' },
      { id: 'sunspire', name: 'Sunspire', continent: 'continent-3' },
    ],
    ['overlook', 'sunspire', 'rimeholt'],
  );
  const word = new SeaWord(ports, FACTS);
  const room = {
    flotsam: [],
    takeTold: () => ({ naval: [], told: [[20, 5, 1, 1]] }),
    shipNamed: () => null,
  } as unknown as Parameters<SeaWord['step']>[0];
  word.step(room);
  const nodes = [{ id: 'sunspire-social' }, { id: 'sunspire-docks' }];
  assert.equal(word.ashore({ id: 'continent-1', nodes }), null, 'that port’s landmass is not open yet');
  const ashore = word.ashore({ id: 'continent-3', nodes });
  assert.deepEqual(ashore, {
    node: { id: 'sunspire-social' },
    washUp: { kind: 'wash-up', node: 'sunspire-social', words: washedUpWords('Sunspire') },
  });
  assert.equal(washedUpWords('Sunspire'), 'You washed up at Sunspire; your ship lies at its roadstead.');
  assert.equal(word.ashore({ id: 'continent-3', nodes }), null, 'taken once');
});

test('washed up on a found island, the player is told so and walks ashore there, taken once', () => {
  const lines = linesOf([[20, 100, -1, 1, 9]], [], { kinds: new Map(), ports: ['Overlook'], nameOf: () => null });
  assert.deepEqual(lines, [
    `Your ship went down: ${washedUpWords('an island you found', true).replace(/^You/, 'you')}`,
  ]);
  const word = new SeaWord([], FACTS);
  const room = {
    flotsam: [],
    takeTold: () => ({ naval: [], told: [[20, 100, -1, 1, 9]] }),
    shipNamed: () => null,
  } as unknown as Parameters<SeaWord['step']>[0];
  word.step(room);
  assert.equal(word.takeWashedIsle(), 9);
  assert.equal(word.takeWashedIsle(), null);
});

test('each line of the sea’s word stands as a notice for a while, as DFO’s toasts do, several at once', () => {
  const told = [[[22, 1, 0, 2, 3, 1]], [[22, 2, 4, 0, 0, 0]], []];
  const room = {
    flotsam: [],
    takeTold: () => ({ naval: [], told: told.shift() ?? [] }),
    shipNamed: () => null,
  } as unknown as Parameters<SeaWord['step']>[0];
  const word = new SeaWord([], FACTS);
  assert.deepEqual(word.notices(room, 0), ['The Pirate Schooner joined the fight.']);
  assert.deepEqual(word.notices(room, 1), ['The Pirate Schooner joined the fight.', 'Player 4 joined the fight.']);
  assert.deepEqual(word.notices(room, 6.5), ['Player 4 joined the fight.'], 'each stands its own while');
  assert.deepEqual(word.notices(null, 8), []);
});

test('a line the sea says again stands newest, once', () => {
  const told = [[[22, 1, 4, 0, 0, 0]], [[22, 2, 5, 0, 0, 0]], [[22, 3, 4, 0, 0, 0]]];
  const room = {
    flotsam: [],
    takeTold: () => ({ naval: [], told: told.shift() ?? [] }),
    shipNamed: () => null,
  } as unknown as Parameters<SeaWord['step']>[0];
  const word = new SeaWord([], FACTS);
  word.notices(room, 0);
  word.notices(room, 1);
  assert.deepEqual(word.notices(room, 2), ['Player 5 joined the fight.', 'Player 4 joined the fight.']);
});
