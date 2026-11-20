import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Placed } from '../player/figures.ts';
import { PlazaLife, SERVED_M, offerAt } from './plazaLife.ts';
import { POSTS, WAYS } from './welcome/plazaForTests.ts';
import type { NodeInfo } from './worldData.ts';

const STATIONS = [
  { kind: 'mage', keeper: [960.8, 1946.6], counter: [960.8, 1948.4] },
  { kind: 'chandler', keeper: [1000, 1946.6], counter: [1000, 1948.4] },
  { kind: 'weaponsmith', keeper: [1039.2, 1946.6], counter: [1039.2, 1948.4] },
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
  ways: WAYS,
  posts: POSTS,
};
/** How many of the plaza's people keep routines on its ways: a person at each kept post, the round's and the
 *  walkers. */
const TOWNSFOLK = POSTS.filter((post) => post.keep === 'kept').length + 1 + 14;

test('a counter that deals with the player opens its screen; a trader’s, and one out of reach, offer nothing', () => {
  assert.deepEqual(offerAt(STATIONS, 960.8, 1950), { words: 'The Mage', opens: { view: 'mage' } });
  assert.deepEqual(offerAt(STATIONS, 1039.2, 1949)?.opens, { view: 'weaponsmith' });
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
  life.frame(1_000_000);
  assert.equal(placed.length, STATIONS.length + TOWNSFOLK);
  const first = placed.map((figure) => [figure.x, figure.y]);
  for (let frame = 1; frame <= 120; frame++) life.frame(1_000_000 + frame * 0.25);
  assert.equal(placed.length, STATIONS.length + TOWNSFOLK, 'placed once');
  assert.ok(placed.every((figure) => figure.z === 30));
  assert.ok(placed.some((figure) => figure.anim === 'walk'));
  assert.ok(
    placed.some((figure) => figure.anim === 'play_lute'),
    'at their posts’ moves',
  );
  assert.ok(
    placed.some((figure, nth) => figure.x !== first[nth]?.[0]),
    'moved on with the clock',
  );
  life.close();
  assert.equal(placed.length, 0);
});
