import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import landmarks from '../../../content/dungeon/landmarks.json' with { type: 'json' };
import {
  type Burning,
  burningOf,
  falloff,
  FIXTURE_KINDS,
  flicker,
  GLOW_KINDS,
  LIGHT_KINDS,
  lightAt,
  cellWords,
  CELL_ROCK,
  MOODS,
  pulse,
  shoulder,
  LIGHT_WGSL,
} from './dungeonLight.ts';
import { type DungeonLayout, FIXTURE } from './dungeonLayout.ts';

test('a light is all there where it burns and gone at its reach', () => {
  assert.equal(falloff(0, 8), 1);
  assert.equal(falloff(8, 8), 0);
  assert.equal(falloff(12, 8), 0);
  assert.ok(falloff(2, 8) > falloff(4, 8));
});

test('a flame flickers gently and never two in step; a steady light never changes', () => {
  for (let time = 0; time < 10; time += 0.1) {
    assert.ok(flicker(time, 0) > 0.75 && flicker(time, 0) < 1.01);
    assert.equal(flicker(time, 3, 0), 1);
  }
  assert.notEqual(flicker(1, 0), flicker(1, 1));
});

test("past every light only the mood is left; by one, the light's own colour", () => {
  const crypt = MOODS.crypt;
  const brazier = [{ at: [0, 0, 1] as const, number: 0, burning: LIGHT_KINDS.brazier }];
  assert.deepEqual(lightAt(brazier, [20, 0, 1], 0, crypt), [...crypt]);
  const warm = lightAt(brazier, [1, 0, 1.2], 0, crypt);
  assert.ok(warm[0] > warm[2] && warm[0] > crypt[0] * 5, 'a brazier warm, and far brighter');
  const crystals = [{ at: [0, 0, 1] as const, number: 0, burning: LIGHT_KINDS.crystals }];
  const cold = lightAt(crystals, [1, 0, 1.2], 0, crypt);
  assert.ok(cold[2] > cold[0] && cold[1] > cold[0], 'crystals light blue-green');
});

test('each fixture kind burns its own way, and each style its own mood', () => {
  for (const [name, number] of Object.entries(FIXTURE))
    assert.equal(FIXTURE_KINDS[number], LIGHT_KINDS[name as keyof typeof FIXTURE]);
  assert.equal(FIXTURE_KINDS.length, Object.keys(FIXTURE).length);
  const [red, green, blue] = LIGHT_KINDS.fungus.colour;
  assert.ok(green > red && green > blue, 'fungus lights green');
  assert.ok(LIGHT_KINDS.candles.reach < LIGHT_KINDS.torch.reach && LIGHT_KINDS.brazier.reach > LIGHT_KINDS.torch.reach);
  const moods = Object.values(MOODS).map((mood) => mood.join());
  assert.equal(new Set(moods).size, moods.length, 'no two styles share a mood');
  for (const mood of Object.values(MOODS)) {
    const sum = mood[0] + mood[1] + mood[2];
    assert.ok(sum > 0.5 && sum < 0.75, 'each faint enough to keep the dark and bright enough to show a wall');
  }
});

test("rock takes the look of the open cell beside it, so a wall bulged into it keeps its room's mood, and is marked rock", () => {
  // Three columns by two rows: a look 0 cell, rock, a look 1 cell; and below, rock with no open cell beside it but one.
  const layout = {
    columns: 3,
    rows: 2,
    cells: [0, -2, 1, -2, -2, -2],
    cellLooks: [0, -1, 1, -1, -1, -1],
  } as unknown as DungeonLayout;
  const rock = CELL_ROCK;
  assert.deepEqual(Array.from(cellWords(layout)), [0, rock | 1, 1, rock, rock, rock | 1]);
});

test("a landmark's glows burn by their kind's number: the fixtures' kinds, then a spirit, daylight, water and a rune", () => {
  assert.equal(GLOW_KINDS.length, landmarks.glowKinds.length);
  landmarks.glowKinds.forEach((name, kind) =>
    assert.equal(GLOW_KINDS[kind], LIGHT_KINDS[name as keyof typeof LIGHT_KINDS], name),
  );
  FIXTURE_KINDS.forEach((burning, kind) => assert.equal(GLOW_KINDS[kind], burning));
  for (const landmark of landmarks.landmarks)
    for (const [, , , kind] of landmark.glows) assert.ok(GLOW_KINDS[kind], `${landmark.module} glows as kind ${kind}`);
});

test('a spirit glows pale green, daylight cool and far and steady, water a faint teal, and a rune violet', () => {
  const sum = ({ colour }: Burning) => colour[0] + colour[1] + colour[2];
  const { spirit, daylight, water, rune } = LIGHT_KINDS;
  assert.ok(spirit.colour[1] > spirit.colour[0] && spirit.colour[1] > spirit.colour[2], 'a spirit green');
  assert.ok(Math.min(...spirit.colour) > spirit.colour[1] / 2, 'and pale');
  assert.ok(daylight.colour[2] >= daylight.colour[1] && daylight.colour[1] >= daylight.colour[0], 'daylight cool');
  for (const burning of Object.values(LIGHT_KINDS) as Burning[]) {
    if (burning !== daylight) assert.ok(daylight.reach > burning.reach, 'daylight reaches farthest');
    if (burning !== water) assert.ok(sum(water) < sum(burning), 'water the faintest');
  }
  assert.equal(daylight.flicker, 0);
  assert.ok(water.colour[1] > water.colour[0] && water.colour[2] > water.colour[0], 'water teal');
  assert.ok(water.flicker > 0 && water.flicker < LIGHT_KINDS.candles.flicker, 'and gently stirring');
  assert.ok(rune.colour[0] > rune.colour[1] && rune.colour[2] > rune.colour[1], 'a rune violet');
});

test('a rune swells and fades slowly; a light that does not pulse is always full', () => {
  for (let time = 0; time < 20; time += 0.25) {
    assert.equal(pulse(time, 2), 1);
    assert.ok(pulse(time, 2, 0.9) >= 0.6 - 1e-9 && pulse(time, 2, 0.9) <= 1 + 1e-9);
  }
  const rune = [{ at: [0, 0, 1] as const, number: 0, burning: LIGHT_KINDS.rune }];
  const strength = (time: number) => lightAt(rune, [1, 0, 1], time, MOODS.sanctum)[2];
  assert.ok(Math.abs(strength(0.1) - strength(0)) < 0.01 * strength(0), 'no flicker from moment to moment');
  assert.ok(Math.abs(strength(Math.PI / 0.9) - strength(0)) > 0.2 * strength(0), 'but dimmer half a pulse on');
  const daylight = [{ at: [0, 0, 3] as const, number: 0, burning: LIGHT_KINDS.daylight }];
  assert.deepEqual(lightAt(daylight, [1, 0, 0], 3.7, MOODS.crypt), lightAt(daylight, [1, 0, 0], 0, MOODS.crypt));
});

test("a landmark's glows burn beside the torches and the fixtures, each by its kind, numbered after them", () => {
  const layout = {
    torchReach: 8,
    torches: [[1, 2, 2.1, 0]],
    fixtures: [[3, 4, 1, 4]],
    glows: [
      [5, 6, 0.3, 6],
      [7, 8, 0.4, 9],
    ],
  } as unknown as DungeonLayout;
  const burning = burningOf(layout);
  assert.deepEqual(
    burning.map(({ at, number }) => [...at, number]),
    [
      [1, 2, 2.1, 0],
      [3, 4, 1, 1],
      [5, 6, 0.3, 2],
      [7, 8, 0.4, 3],
    ],
  );
  assert.deepEqual(
    burning.map((light) => light.burning),
    [{ ...LIGHT_KINDS.torch, reach: 8 }, LIGHT_KINDS.hearth, LIGHT_KINDS.spirit, LIGHT_KINDS.rune],
  );
  const lit = lightAt(burning, [7, 8, 1], 0, MOODS.sanctum);
  assert.ok(lit[2] > MOODS.sanctum[2] + 0.5, 'the rune lights what stands by it, as the shader lights the walls');
});

test('summed light keeps its value up to 0.8 and eases toward 1.4 past it, in the shader as for the figures', () => {
  assert.equal(shoulder(0.5), 0.5);
  assert.equal(shoulder(0.8), 0.8);
  assert.ok(shoulder(3) < 1.4 && shoulder(3) > 1.1, `3 maps to ${shoulder(3)}`);
  for (let light = 0.8; light < 6; light += 0.05) assert.ok(shoulder(light + 0.05) > shoulder(light), 'brighter still');
  // A room lit far past 1 by its lanterns, its brazier and its torches keeps its colour.
  const lit = lightAt(
    [
      { at: [0, 0, 1], number: 0, burning: LIGHT_KINDS.brazier },
      { at: [1, 0, 2], number: 1, burning: LIGHT_KINDS.lantern },
      { at: [-1, 0, 2], number: 2, burning: LIGHT_KINDS.torch },
    ],
    [0, 0.5, 1],
    0,
    MOODS.mines,
  );
  assert.ok(Math.max(...lit) < 1.4 && lit[0] > lit[1] && lit[1] > lit[2], `${lit.join()} warm and under 1.4`);
  // The shader's own shoulder, read from its WGSL and run over the same numbers.
  const constant = (name: string) => Number(new RegExp(`const ${name} = ([\\d.]+);`).exec(LIGHT_WGSL)?.[1]);
  const body = /fn shoulder\(light: f32\) -> f32 \{\s*return ([^;]+);\s*\}/.exec(LIGHT_WGSL)?.[1] ?? 'NaN';
  const knee = constant('LIGHT_KNEE');
  const ceiling = constant('LIGHT_CEILING');
  for (let light = 0; light < 6; light += 0.1) {
    const shaded = runInNewContext(body, {
      light,
      min: Math.min,
      max: Math.max,
      LIGHT_KNEE: knee,
      LIGHT_CEILING: ceiling,
    });
    assert.ok(
      Math.abs(shaded - shoulder(light)) < 1e-6,
      `${light}: the shader's ${shaded}, the figures' ${shoulder(light)}`,
    );
  }
  assert.match(
    LIGHT_WGSL,
    /return vec3f\(shoulder\(light\.r\), shoulder\(light\.g\), shoulder\(light\.b\)\);\s*\}\s*$/,
  );
});
