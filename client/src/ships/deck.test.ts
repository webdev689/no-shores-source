import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cellHeight,
  cellsReached,
  type Deck,
  deckFloats,
  deckOf,
  deckToWorld,
  SLOOP_DECK,
  worldToDeck,
} from './deck.ts';

const standingCells = (deck: Deck) => deck.heights.filter((height) => height !== null).length;

test("the Sloop's deck reads from the manifest, and behind its wheel is deck", () => {
  const [x, y] = SLOOP_DECK.helm;
  const height = cellHeight(SLOOP_DECK, x, y);
  assert.ok(height !== null && height > 1.5 && height < 3.6, `its planks over its waterline: ${height}`);
  assert.equal(cellHeight(SLOOP_DECK, 5, 0), null, 'off its side is no deck');
  assert.ok(standingCells(SLOOP_DECK) > 500, 'room to walk');
});

test('from the spot behind its wheel a walker reaches its main deck, and never the top of a rail', () => {
  const reached = cellsReached(SLOOP_DECK, ...SLOOP_DECK.helm);
  const standing = standingCells(SLOOP_DECK);
  assert.ok(reached.length > 0.9 * standing, `${reached.length} of ${standing} cells`);
  assert.ok(
    reached.some((cell) => cell.z < 1.85 && cell.y < 0),
    'its main deck forward among them',
  );
  assert.ok(
    reached.every((cell) => cell.z < 2.6),
    'no rail top, nor its bulwarks',
  );
});

test('its quarterdeck is left only down its steps at its front corners or its stair aft', () => {
  const [x, y] = SLOOP_DECK.helm;
  // Its steps lie 5 to 6.2 m aft of its middle, its stair 7.8 to 8.9 m; its main deck stands about 1.8 m up.
  const step = (cell: { y: number; z: number }) =>
    cell.z > 1.82 && ((cell.y > 5 && cell.y < 6.2) || (cell.y > 7.8 && cell.y < 8.9));
  const withoutSteps: Deck = {
    ...SLOOP_DECK,
    heights: SLOOP_DECK.heights.map((height, index) => {
      const cell = {
        y: SLOOP_DECK.north + (Math.floor(index / SLOOP_DECK.columns) + 0.5) * SLOOP_DECK.cell,
        z: height ?? 0,
      };
      return height !== null && step(cell) ? null : height;
    }),
  };
  const kept = cellsReached(withoutSteps, x, y);
  assert.ok(kept.length > 100, 'its quarterdeck still');
  assert.ok(
    kept.every((cell) => cell.z > 2.3),
    `never its main deck: ${Math.min(...kept.map((cell) => cell.z))}`,
  );
});

test('a deck crosses to the movement crate as its shape and then its heights, none as NaN', () => {
  const deck = deckOf({
    cell_m: 0.5,
    west_m: -1,
    north_m: -2,
    columns: 2,
    rows: 1,
    heights_cm: [[80, null]],
    helm: [0, 1],
  });
  const floats = deckFloats(deck);
  assert.deepEqual(floats.slice(0, 6), [-1, -2, 0.5, 2, 1, 0.8]);
  assert.ok(Number.isNaN(floats[6]));
  assert.throws(() =>
    deckOf({ ...{ cell_m: 0.5, west_m: 0, north_m: 0, helm: [0, 0] }, columns: 2, rows: 1, heights_cm: [[80]] }),
  );
});

test('a point on its deck lies in the world by its heading, its drawn size and the swell under it', () => {
  const lying = { x: 1000, y: 2000, heading: Math.PI / 2, scale: 2, heave: 0.25, pitch: 0, roll: 0 };
  const [x, y, z] = deckToWorld(lying, 0, -1, 0.8);
  assert.ok(
    Math.abs(x - 1002) < 1e-9 && Math.abs(y - 2000) < 1e-9,
    'a metre toward its bow, heading east, twice its size',
  );
  assert.equal(z, 1.6 + 0.25);
  const [starboardX, starboardY] = deckToWorld({ ...lying, heading: 0, scale: 1 }, 1, 0, 0);
  assert.ok(
    Math.abs(starboardX - 1001) < 1e-9 && Math.abs(starboardY - 2000) < 1e-9,
    'heading north, its starboard is east',
  );
});

test('a point on its deck rises at its bow as it pitches up and sinks to starboard as it heels', () => {
  const level = { x: 0, y: 0, heading: 0, scale: 1, heave: 0, pitch: 0, roll: 0 };
  const bow = deckToWorld({ ...level, pitch: 0.1 }, 0, -5, 0)[2];
  const stern = deckToWorld({ ...level, pitch: 0.1 }, 0, 5, 0)[2];
  assert.ok(Math.abs(bow - 5 * Math.sin(0.1)) < 1e-12 && Math.abs(stern + 5 * Math.sin(0.1)) < 1e-12, 'its bow up');
  const starboard = deckToWorld({ ...level, roll: 0.2 }, 2, 0, 0)[2];
  assert.ok(Math.abs(starboard + 2 * Math.sin(0.2)) < 1e-12, 'its starboard side down');
  const drawn = deckToWorld({ ...level, pitch: 0.1, scale: 4 }, 0, -5, 0)[2];
  assert.ok(Math.abs(drawn - 4 * bow) < 1e-12, 'four times as far on a ship drawn four times its size');
});

test('a point in the world comes back to the same spot on its deck, however it lies', () => {
  for (const [pitch, roll] of [
    [0, 0],
    [0.08, -0.15],
    [-0.2, 0.3],
  ] as const) {
    const lying = { x: 500, y: -300, heading: 2.1, scale: 3, heave: -0.2, pitch, roll };
    const [x, y, z] = deckToWorld(lying, 0.4, -1.7, 0.9);
    const back = worldToDeck(lying, x, y, z);
    [0.4, -1.7, 0.9].forEach((value, axis) => assert.ok(Math.abs((back[axis] ?? 0) - value) < 1e-9));
  }
});
