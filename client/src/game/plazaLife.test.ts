import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Placed } from '../player/figures.ts';
import { PlazaLife, SERVED_M, floorOver, offerAt } from './plazaLife.ts';
import { POSTS, WAYS } from './welcome/plazaForTests.ts';
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
  ways: WAYS,
  posts: POSTS,
};
/** How many of the plaza's people keep routines on its ways: a person at each kept post, the round's and the
 *  walkers. */
const TOWNSFOLK = POSTS.filter((post) => post.keep === 'kept').length + 1 + 14;

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

test('a patrol zone’s folk walk where its folk sites are, and only there', () => {
  let placed = 0;
  const others = {
    place: (dress: Placed['dress'], x: number, y: number, facing: number) => {
      placed++;
      return { id: placed, x, y, z: 0, facing, dress, anim: 'idle', frame: null, spin: false } as Placed;
    },
    remove: () => {},
  };
  const track = Array.from({ length: 21 }, (unused, step) => [800 + step * 20, 2000] as const);
  const zone: NodeInfo = { ...PLAZA, id: 'saltgrass-downs', kind: 'patrol', stations: [], paths: [track] };
  new PlazaLife(zone, others, () => 30).frame(0);
  assert.equal(placed, 0, 'no folk site, no one');
  new PlazaLife({ ...zone, folk: [{ at: [1000, 2000], radius: 100 }] }, others, () => 30).frame(0);
  assert.ok(placed >= 3, `a hamlet's guard and townsfolk: ${placed}`);
});

test('a figure stands on a pier, a podium and the steps on it, never on a roof over its head', () => {
  const sea = () => -2;
  const box = (top: number, bottom: number, minX = 0, maxX = 10) => ({ minX, minY: 0, maxX, maxY: 10, top, bottom });
  const pier = box(3, -6);
  assert.equal(floorOver([pier], sea)(5, 5), 3, 'on the deck 3 m up, over the sea floor 2 m down');
  assert.equal(floorOver([pier], sea)(15, 5), -2, 'beside it, on the sea floor');
  const podium = [box(0.9, -1), box(1.3, 0.9, 4, 6), box(6, 4.5)];
  assert.equal(floorOver(podium, () => 0)(5, 5), 1.3, 'up the podium and the step on it, under its roof');
  assert.equal(floorOver(podium, () => 0)(2, 5), 0.9);
  const placed: Placed[] = [];
  const others = {
    place: (dress: Placed['dress'], x: number, y: number, facing: number) => {
      const figure = { id: placed.length, x, y, z: 0, facing, dress, anim: 'idle', frame: null, spin: false };
      placed.push(figure);
      return figure;
    },
    remove: () => {},
  };
  const deck = { minX: 800, minY: 1900, maxX: 1200, maxY: 2100, top: 3, bottom: -6 };
  new PlazaLife(PLAZA, others, floorOver([deck], sea)).frame(1_000_000);
  assert.ok(placed.length > 0 && placed.every((figure) => figure.z === 3), 'everyone on the deck');
});
