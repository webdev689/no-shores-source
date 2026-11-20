import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { CAVE_BULGE_M } from './dungeonCeilings.ts';
import { LIGHT_KINDS, LIGHT_WGSL } from './dungeonLight.ts';
import { DUNGEON_SHADER, LIGHT_FLOATS, lightFloats, MOST_LOOKS, VIEW_FLOATS } from './dungeonShaders.ts';

/** The body of a fragment's branch for a layer: what it draws that layer as. */
const branchOf = (layer: string) =>
  new RegExp(`if layer == ${layer} \\{([\\s\\S]*?)\\n  \\}`).exec(DUNGEON_SHADER)?.[1] ?? '';

/** A WGSL struct's fields in order, each where it starts and how long it is in floats; every field here is a matrix,
 *  a vec4f or an array of them, so each starts where the last ends. */
function fieldsOf(wgsl: string, name: string): Map<string, { start: number; floats: number }> {
  const body = new RegExp(`struct ${name} \\{([\\s\\S]*?)\\};`).exec(wgsl)?.[1] ?? '';
  const fields = new Map<string, { start: number; floats: number }>();
  let start = 0;
  for (const [, field = '', kind = ''] of body.matchAll(/^\s*(\w+): (.+),\s*$/gm)) {
    const array = /^array<vec4f, (\d+)>$/.exec(kind);
    const floats = kind === 'mat4x4f' ? 16 : kind === 'vec4f' ? 4 : array ? Number(array[1]) * 4 : Number.NaN;
    fields.set(field, { start, floats });
    start += floats;
  }
  fields.set('', { start, floats: 0 });
  return fields;
}

test("the view's buffer is laid out as the shader's View: each part where it starts, and as long in all", () => {
  const view = fieldsOf(DUNGEON_SHADER, 'View');
  const camel = (field: string) => field.replace(/_(\w)/g, (whole, letter: string) => letter.toUpperCase());
  for (const [field, { start }] of view)
    if (field) assert.equal(VIEW_FLOATS[camel(field) as keyof typeof VIEW_FLOATS], start, field);
  assert.equal(view.get('moods')?.floats, MOST_LOOKS * 4);
  assert.equal(VIEW_FLOATS.all, view.get('')?.start, 'as long as the struct, so a frame binds it whole');
});

test("a light's floats are the shader's Light", () => {
  assert.equal(fieldsOf(LIGHT_WGSL, 'Light').get('')?.start, LIGHT_FLOATS);
});

test("a surface's mood is looked up past the farthest a cave's wall bulges into the rock", () => {
  const nudge = Number(/normal\.xy \* ([\d.]+)/.exec(DUNGEON_SHADER)?.[1]);
  assert.ok(nudge > CAVE_BULGE_M && nudge < 0.5, `${nudge} m`);
});

test("a crystal's and a lantern's glass faces glow by how squarely each meets the eye, so one crystal's faces differ", () => {
  const share = /fn facing_share\(face: vec3f, to_eye: vec3f\) -> f32 \{\s*return ([^;]+);\s*\}/.exec(
    DUNGEON_SHADER,
  )?.[1];
  assert.ok(share, 'a facing share');
  const dot = (first: readonly number[], second: readonly number[]) =>
    first.reduce((sum, value, index) => sum + value * (second[index] ?? 0), 0);
  const shareOf = (face: readonly number[]) =>
    Number(runInNewContext(share, { face, to_eye: [0, 0, 1], dot, abs: Math.abs }));
  assert.equal(shareOf([0, 0, 1]), 1, 'square to the eye: its whole glow');
  assert.equal(shareOf([0, 0, -1]), 1);
  assert.ok(Math.abs(shareOf([1, 0, 0]) - 0.55) < 1e-9, 'edge on: a little over half');
  assert.ok(shareOf([Math.SQRT1_2, 0, Math.SQRT1_2]) > 0.55 && shareOf([Math.SQRT1_2, 0, Math.SQRT1_2]) < 1);
  for (const layer of ['CRYSTAL', 'LANTERN_GLASS'])
    assert.match(branchOf(layer), /facet\(/, `${layer} glows by its facets`);
  assert.match(DUNGEON_SHADER, /fn facet\([^)]*\) -> vec3f \{[\s\S]*?facing_share\(face, to_eye\)[\s\S]*?lights_at\(/);
});

test("still water shows no gleam of the water's own glow, and never reads darker than its cell's mood", () => {
  const floats = (burning: (typeof LIGHT_KINDS)[keyof typeof LIGHT_KINDS]) =>
    lightFloats({ at: [1, 2, 0.4], number: 3, burning });
  assert.equal(floats(LIGHT_KINDS.water).length, LIGHT_FLOATS);
  assert.deepEqual(floats(LIGHT_KINDS.water).slice(0, 8), [1, 2, 0.4, 3, ...LIGHT_KINDS.water.colour, 5]);
  // Its third shape float is how much of a gleam still water shows of it: the water's own glow lies on it.
  assert.equal(floats(LIGHT_KINDS.water)[10], 0);
  for (const burning of [LIGHT_KINDS.torch, LIGHT_KINDS.brazier, LIGHT_KINDS.crystals, LIGHT_KINDS.rune])
    assert.equal(floats(burning)[10], 1);
  const water = /fn water_at[\s\S]*?\n\}/.exec(DUNGEON_SHADER)?.[0] ?? '';
  assert.match(water, /gleam \+= [^;]*lamp\.shape\.z/, "each light's gleam by its share");
  assert.match(water, /return mood \* WATER_FLOOR \+/, 'a floor of the mood under the rest');
  const floor = Number(/const WATER_FLOOR = ([\d.]+);/.exec(DUNGEON_SHADER)?.[1]);
  assert.ok(floor >= 0.4 && floor <= 1, `a floor of ${floor} of the mood`);
});
