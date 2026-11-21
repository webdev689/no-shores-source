import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Placed } from '../player/figures.ts';
import { PlazaLife, SERVED_M, offerAt } from './plazaLife.ts';
import { WALKERS } from './townsfolk.ts';
import type { NodeInfo } from './worldData.ts';

const STATIONS = [
  { kind: 'mage', keeper: [960.8, 1946.6], counter: [960.8, 1948.4] },
  { kind: 'chandler', keeper: [1000, 1946.6], counter: [1000, 1948.4] },
  { kind: 'weaponsmith', keeper: [1039.2, 1946.6], counter: [1039.2, 1948.4] },
  { kind: 'harbourmaster', keeper: [1078.4, 1946.6], counter: [1078.4, 1948.4] },
] as const;
const PLAZA: NodeInfo = {
  id: 'overlook-social',
  kind: 'social',
  name: 'Overlook',
  continent: 'continent-1',
  ring: [
    [870, 1940],
    [1130, 1940],
    [1130, 2060],
    [870, 2060],
  ],
  spawns: [
    [940, 2056],
    [1060, 2056],
  ],
  centre: [1000, 2000],
  stations: STATIONS,
};

test('a counter that deals with the player opens its screen; a trader’s, and one out of reach, offer nothing', () => {
  assert.deepEqual(offerAt(STATIONS, 960.8, 1950), { words: 'The Mage', opens: { view: 'mage' } });
  assert.deepEqual(offerAt(STATIONS, 1039.2, 1949)?.opens, { view: 'weaponsmith' });
  assert.deepEqual(offerAt(STATIONS, 1078.4, 1949)?.opens, { view: 'harbourmaster' }, 'the Shipwright');
  assert.equal(offerAt(STATIONS, 1000, 1949), null, 'the chandler sells nothing a player keeps');
  assert.equal(offerAt(STATIONS, 960.8, 1948.4 + SERVED_M + 0.1), null);
});

test('the plaza’s people are placed once, moved each frame on its floor, and taken away as the player leaves', () => {
  const placed: Placed[] = [];
  const others = {
    place: (dress: Placed['dress'], x: number, y: number, facing: number) => {
      const figure = { id: placed.length, x, y, z: 0, facing, dress, anim: 'idle', frame: null, spin: false };
      placed.push(figure);
      return figure;
    },
    remove: (figure: Placed) => void placed.splice(placed.indexOf(figure), 1),
  };
  const life = new PlazaLife(PLAZA, others, () => 30);
  life.frame(0.5);
  assert.equal(placed.length, STATIONS.length + WALKERS);
  for (let frame = 0; frame < 120; frame++) life.frame(0.25);
  assert.equal(placed.length, STATIONS.length + WALKERS, 'placed once');
  assert.ok(placed.every((figure) => figure.z === 30));
  assert.ok(placed.some((figure) => figure.anim === 'walk'));
  life.close();
  assert.equal(placed.length, 0);
});

test('a ruin’s plaza, keeping no station, has no one in it', () => {
  let placed = 0;
  const others = {
    place: (dress: Placed['dress'], x: number, y: number, facing: number) => {
      placed++;
      return { id: placed, x, y, z: 0, facing, dress, anim: 'idle', frame: null, spin: false } as Placed;
    },
    remove: () => {},
  };
  const life = new PlazaLife({ ...PLAZA, name: 'Ruins of Mistfall', stations: [] }, others, () => 30);
  for (let frame = 0; frame < 20; frame++) life.frame(0.25);
  assert.equal(placed, 0);
  assert.equal(offerAt([], 960.8, 1950), null, 'no counter offers anything');
});
