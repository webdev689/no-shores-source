// Which lights reach which surfaces in a storeyed dungeon: never through a slab, and through a flight or open air only
// onto the cells that join the storeys; the shader reads the same spaces from the cells' words and the lights.
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { storeyUnder } from './dungeonLayout.ts';
import { burningOf, CELL_ROCK, cellWords, JOINS_SHIFT, lightAt, NearestLights } from './dungeonLight.ts';
import { DUNGEON_SHADER, lightFloats } from './dungeonShaders.ts';
import { EVERY_SPACE, reachOf, seenFrom, spaceAt, spacesOf, STOREY_BITS } from './dungeonSpaces.ts';
import { STOREYED } from './dungeonStoreyMesh.test.ts';

const spaces = spacesOf(STOREYED);
const [TOP, LOWER] = [1, 2];
const [FLIGHT, AIR] = [spaces.joins[0]?.bit ?? 0, spaces.joins[1]?.bit ?? 0];
const plane = 21;

test("a flight's cells and landings and a run of open air with the hall under it are each a join of their own", () => {
  assert.equal(spaces.joins.length, 2);
  const flight = [8, 9, 10, 11, 12, plane + 9, plane + 10, plane + 11, plane + 12, plane + 13];
  assert.deepEqual(
    [...spaces.cells]
      .filter(([, bits]) => bits === FLIGHT)
      .map(([cell]) => cell)
      .sort((a, b) => a - b),
    flight,
  );
  assert.deepEqual(
    [...spaces.cells].filter(([, bits]) => bits === AIR).map(([cell]) => cell),
    [14, plane + 14],
  );
});

test('a light reaches its storey and the joins of its storey within its reach, never through a slab', () => {
  const [torch, lower, brazier] = burningOf(STOREYED);
  assert.equal(torch?.space, TOP | FLIGHT | AIR, 'the gallery torch, within reach of the open air and the landing');
  assert.equal(lower?.space, LOWER | FLIGHT, "room 1's torch, within reach of the flight's foot");
  assert.equal(brazier?.space, TOP | FLIGHT | AIR);
  assert.equal(spaceAt(STOREYED, spaces, [1.6, 8, -8]), LOWER | AIR, "the hall's floor under the open air");
  assert.equal(spaceAt(STOREYED, spaces, [4.8, 8, -4.1]), LOWER, "the hall's ceiling under the gallery");
  assert.equal(spaceAt(STOREYED, spaces, [11.2, 4.8, -2]), LOWER | FLIGHT, 'a tread under the top floor');
  assert.equal(spaceAt(STOREYED, spaces, [-1, 8, 0]), EVERY_SPACE, 'off the grid');
  assert.equal((torch?.space ?? 0) & spaceAt(STOREYED, spaces, [4.8, 8, -4.1]), 0, 'not through the gallery floor');
  assert.equal(reachOf(STOREYED, spaces, [20.8, 0.35, -5.9], 2) & TOP, 0, 'never up through the slab');
});

test('a figure is lit only by the lights that reach its space, and the eye keeps those it may see', () => {
  const lights = burningOf(STOREYED);
  const dark: [number, number, number] = [0, 0, 0];
  const under = [4.8, 8, -5] as const;
  const lit = lightAt(lights, under, 0, dark, spaceAt(STOREYED, spaces, under))[0];
  assert.equal(lit, 0, "the gallery's torch and brazier over the hall's ceiling light no figure under it");
  const inAir = [1.6, 8, -1] as const;
  assert.ok(lightAt(lights, inAir, 0, dark, spaceAt(STOREYED, spaces, inAir))[0] > 0, 'but light one under the air');
  const picker = new NearestLights(lights, { at: [0, 0, -100], number: lights.length, burning: lights[0]!.burning });
  const eye = [4.8, 1.6, 1.6] as const;
  assert.equal(seenFrom(STOREYED, spaces, eye) & LOWER, LOWER, 'near a join the eye sees the storey beside it');
  assert.ok(picker.nearest(eye, false, 32, seenFrom(STOREYED, spaces, eye)).some((light) => light.number === 1));
});

test("the shader's words carry each storey's looks, rock and joins, and a light its spaces, bit for bit", () => {
  const words = cellWords(STOREYED);
  assert.equal(words.length, 42);
  assert.equal(((words[14] ?? 0) >>> JOINS_SHIFT) << STOREY_BITS, AIR, 'the open air');
  assert.equal(words[plane + 6], 0, "room 1's corner, its look and nothing else");
  assert.equal((words[plane] ?? 0) & CELL_ROCK, CELL_ROCK);
  const floats = lightFloats({ ...burningOf(STOREYED)[0]!, space: 2 ** 25 + 1 }, new Float32Array(12));
  assert.equal(new Uint32Array(floats.buffer)[11], 2 ** 25 + 1, 'past what a float holds whole');
});

test("the shader's storey of a height is the page's", () => {
  const wgsl = /fn storey_at\([\s\S]*?\n\}/.exec(DUNGEON_SHADER)?.[0] ?? '';
  const script = wgsl
    .replace(
      /fn (\w+)\(([^)]*)\) -> \w+ \{/,
      (_whole, name: string, params: string) => `function ${name}(${params.replace(/: \w+/g, '')}) {`,
    )
    .replace(/\blet /g, 'const ')
    .replace(/(\d)u\b/g, '$1')
    .replace(/\bu32\(/g, 'Math.trunc(')
    .replace(/\bf32\(/g, 'Number(')
    .replace('&cell_looks', 'cell_looks');
  const context = {
    view: { grid: { x: 3.2, y: 7, z: 3, w: 8 } },
    arrayLength: () => 42,
    cell_looks: [],
    max: Math.max,
    clamp: (value: number, low: number, high: number) => Math.min(high, Math.max(low, value)),
    ceil: Math.ceil,
    Math,
    Number,
  };
  assert.ok(script.includes('function storey_at'));
  for (const z of [0, 0.05, 2, 7.5, -0.45, -4, -7.95, -8, -9, -20])
    assert.equal(runInNewContext(`${script}\nstorey_at(${z})`, context), storeyUnder(STOREYED, z), `at ${z} m`);
});
