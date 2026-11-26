// Which lights reach which surfaces in a storeyed dungeon: never through a slab, and through a flight or open air only
// to the cells it joins; the shader reads the same spaces from the cells' words and the lights.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { burningOf, CELL_JOINED, CELL_ROCK, cellWords, lightAt, NearestLights } from './dungeonLight.ts';
import { lightFloats } from './dungeonShaders.ts';
import { EVERY_SPACE, JOINED_SHIFT, joinedCells, reachOf, seenFrom, spaceAt } from './dungeonSpaces.ts';
import { STOREYED } from './dungeonStoreyMesh.test.ts';

const joined = joinedCells(STOREYED);
const [TOP, LOWER, TOP_JOINED, LOWER_JOINED] = [1, 2, 1 << JOINED_SHIFT, 1 << (JOINED_SHIFT + 1)];

test('a flight, its landings, open air, the hall under it and the gallery round it are joined', () => {
  const plane = 21;
  const flight = [9, 10, 11, 12].flatMap((cell) => [cell, plane + cell]);
  const gallery = [0, 1, 7, 8, 15];
  const hall = [plane + 7, plane + 14, plane + 15];
  const landings = [8, plane + 13];
  assert.deepEqual(
    [...joined].sort((a, b) => a - b),
    [...new Set([...flight, ...gallery, 14, ...hall, ...landings])].sort((a, b) => a - b),
  );
});

test('a light reaches its storey, and from a joined cell the joined cells of the storeys beside it', () => {
  const [torch, lower] = burningOf(STOREYED);
  assert.equal(torch?.space, TOP | TOP_JOINED | LOWER_JOINED, 'the gallery torch');
  assert.equal(lower?.space, LOWER, "room 1's torch, which nothing joins");
  assert.equal(spaceAt(STOREYED, joined, [20.8, 1.6, -8]), LOWER, "room 1's floor");
  assert.equal(spaceAt(STOREYED, joined, [1.6, 8, -8]), LOWER | LOWER_JOINED, "the hall's floor under the open air");
  assert.equal(spaceAt(STOREYED, joined, [1.6, 8, 3.9]), TOP | TOP_JOINED, "the open air's ceiling");
  assert.equal(spaceAt(STOREYED, joined, [-1, 8, 0]), EVERY_SPACE, 'off the grid');
  assert.equal(reachOf(STOREYED, joined, [20.8, 0.35, -5.9]) & (TOP | TOP_JOINED), 0, 'never up through the slab');
});

test('a figure is lit only by the lights that reach its space, and the eye keeps only those it may see', () => {
  const lights = burningOf(STOREYED);
  const dark: [number, number, number] = [0, 0, 0];
  const lit = (point: readonly [number, number, number]) =>
    lightAt(lights, point, 0, dark, spaceAt(STOREYED, joined, point))[0];
  const underRoom1 = [20.8, 1.6, -7] as const;
  assert.ok(lit(underRoom1) > 0, "room 1's own torch");
  const others = lights.filter((light) => light.number !== 1);
  const without = lightAt(others, underRoom1, 0, dark, spaceAt(STOREYED, joined, underRoom1))[0];
  assert.equal(without, 0, "and only its own, though the gallery's torch and brazier stand within reach over it");
  const picker = new NearestLights(lights, { at: [0, 0, -100], number: lights.length, burning: lights[0]!.burning });
  const seen = seenFrom(STOREYED, joined, [20.8, 4.8, -6.4]);
  assert.deepEqual(
    picker.nearest([20.8, 4.8, -6.4], false, 32, seen).map((light) => light.number),
    [1, 2, 0],
    'the landing is joined: it sees up the flight',
  );
  const inRoom = seenFrom(STOREYED, joined, [20.8, 1.6, -6.4]);
  assert.equal(inRoom, LOWER | LOWER_JOINED);
});

test("the shader's words carry each storey's looks, rock and joins, and a light carries its spaces", () => {
  const words = cellWords(STOREYED);
  assert.equal(words.length, 42);
  assert.equal(words[14]! & CELL_JOINED, CELL_JOINED, 'the open air');
  assert.equal(words[21 + 6]! & (CELL_ROCK | CELL_JOINED), 0, "room 1's corner");
  assert.equal(words[21 + 0]! & CELL_ROCK, CELL_ROCK);
  const [torch] = burningOf(STOREYED);
  assert.equal(lightFloats(torch!, new Float32Array(12))[11], TOP | TOP_JOINED | LOWER_JOINED);
});
