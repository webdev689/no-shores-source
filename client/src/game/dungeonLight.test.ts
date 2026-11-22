import assert from 'node:assert/strict';
import { test } from 'node:test';
import { falloff, FIXTURE_KINDS, flicker, LIGHT_KINDS, lightAt, moodLooks, MOODS } from './dungeonLight.ts';
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

test("rock takes the look of the open cell beside it, so a wall bulged into it keeps its room's mood", () => {
  // Three columns by two rows: a look 0 cell, rock, a look 1 cell; and below, rock with no open cell beside it but one.
  const layout = {
    columns: 3,
    rows: 2,
    cells: [0, -2, 1, -2, -2, -2],
    cellLooks: [0, -1, 1, -1, -1, -1],
  } as unknown as DungeonLayout;
  assert.deepEqual(Array.from(moodLooks(layout)), [0, 1, 1, 0, 0, 1]);
});
