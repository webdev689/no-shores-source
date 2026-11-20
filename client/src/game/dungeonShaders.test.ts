import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { CAVE_BULGE_M } from './dungeonCeilings.ts';
import { CRYSTAL_GLOW, LANTERN_GLOW, LIGHT_KINDS, LIGHT_WGSL } from './dungeonLight.ts';
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

test('no facet of a crystal or a lantern clips, so its brightest still differs from its next', () => {
  // A facet glows at most its glow: the lights round it lift it toward that, never past it.
  const lift =
    /fn facet\([^)]*\) -> vec3f \{[\s\S]*?return glow \* facing_share\(face, to_eye\) \* \(([\d.]+) \+ ([\d.]+) \* min\(/.exec(
      DUNGEON_SHADER,
    );
  assert.ok(lift, 'a facet is its glow by its facing share, lifted by the lights up to 1');
  assert.equal(Number(lift[1]) + Number(lift[2]), 1);
  for (const [name, glow] of [
    ['crystal', CRYSTAL_GLOW],
    ['lantern', LANTERN_GLOW],
  ] as const) {
    assert.ok(Math.max(...glow) <= 1, `${name}'s glow peaks at ${Math.max(...glow)}`);
    assert.ok(Math.max(...glow) >= 0.95, `${name}'s glow is bright`);
  }
});

test('still water shows its bed through it and the lit room in it, by Fresnel, and no gleam of its own glow', () => {
  const floats = (burning: (typeof LIGHT_KINDS)[keyof typeof LIGHT_KINDS]) =>
    lightFloats({ at: [1, 2, 0.4], number: 3, burning });
  assert.equal(floats(LIGHT_KINDS.water).length, LIGHT_FLOATS);
  assert.deepEqual(floats(LIGHT_KINDS.water).slice(0, 8), [1, 2, 0.4, 3, ...LIGHT_KINDS.water.colour, 5]);
  // Its third shape float is how much of a gleam still water shows of it: the water's own glow lies on it.
  assert.equal(floats(LIGHT_KINDS.water)[10], 0);
  for (const burning of [LIGHT_KINDS.torch, LIGHT_KINDS.brazier, LIGHT_KINDS.crystals, LIGHT_KINDS.rune])
    assert.equal(floats(burning)[10], 1);
  const water = /fn water_at[\s\S]*?\n\}/.exec(DUNGEON_SHADER)?.[0] ?? '';
  assert.match(
    water,
    /let image = flame_image\(dot\(mirror, [^;]*\);[\s\S]*gleam \+= [^;]*image[^;]*lamp\.shape\.z/,
    "each light's flame mirrored, but water's own",
  );
  assert.doesNotMatch(/gleam \+= [^;]*;/.exec(water)?.[0] ?? '', /share/, 'a mirrored flame is as bright however far');
  assert.match(water, /let mirrors = fresnel\(max\(dot\(rippled, to_eye\), 0\.0\)\);/, 'as much as Fresnel says');
  assert.match(
    water,
    /return mix\(through, mirrored, mirrors\) \+ gleam \* mirrors;/,
    'its bed and the room by Fresnel',
  );
  assert.match(water, /let through = bed \* WATER_TINT \* lights_at\(/, 'its bed lit as a floor is, through the water');
  assert.match(water, /let mirror = reflect\(-to_eye, rippled\);/, 'the way the water mirrors');
  assert.match(water, /let mirrored = ROOM_ALBEDO \* lights_at\(point, mirror,/, 'the room lit toward its lights');
  assert.match(DUNGEON_SHADER, /if water \{\s*return vec4f\(water_at\([^;]*sampled[^;]*\), 1\.0\);/, 'its bed sampled');
  const tint = (/vec3f\(([^)]*)\)/.exec(DUNGEON_SHADER.split('const WATER_TINT =')[1] ?? '')?.[1] ?? '')
    .split(',')
    .map(Number);
  assert.equal(tint.length, 3);
  assert.ok(
    tint.every((value) => value > 0.3 && value < 0.8),
    `a wet bed, darker: ${tint}`,
  );
  assert.ok((tint[0] ?? 1) < (tint[2] ?? 0), 'water takes the red first');
  const square = Number(/const WATER_F0 = ([\d.]+);/.exec(DUNGEON_SHADER)?.[1]);
  const body = /fn fresnel\(cosine: f32\) -> f32 \{\s*return ([^;]+);\s*\}/.exec(DUNGEON_SHADER)?.[1];
  assert.ok(body, 'a fresnel');
  const fresnel = (cosine: number) => Number(runInNewContext(body, { cosine, WATER_F0: square, pow: Math.pow }));
  assert.ok(Math.abs(fresnel(1) - 0.02) < 1e-9, 'square on, water mirrors 2%');
  assert.ok(Math.abs(fresnel(0) - 1) < 1e-9, 'edge on, all of it');
  assert.ok(fresnel(0.5) > fresnel(0.8) && fresnel(0.8) > fresnel(1));
});

test('a flame mirrored in still water is as wide as it looks from there, brightest where the mirror meets it', () => {
  const flame = Number(/const FLAME_M = ([\d.]+);/.exec(DUNGEON_SHADER)?.[1]);
  assert.ok(flame > 0.05 && flame < 0.3, `a flame ${flame} m across`);
  const body = /fn flame_image\(cosine: f32, distance: f32\) -> f32 \{\s*return ([^;]+);\s*\}/.exec(
    DUNGEON_SHADER,
  )?.[1];
  assert.ok(body, 'a flame image');
  const image = (cosine: number, distance: number) =>
    Number(runInNewContext(body, { cosine, distance, FLAME_M: flame, exp: Math.exp, pow: Math.pow, max: Math.max }));
  for (const distance of [0.5, 2, 12]) assert.ok(Math.abs(image(1, distance) - 1) < 1e-9, 'whole on its line');
  // At the flame's own angular radius from its line, a fall to 1/e: it looks smaller the farther it burns.
  for (const distance of [1, 2, 8]) {
    const edge = Math.cos(flame / distance);
    assert.ok(Math.abs(image(edge, distance) - Math.exp(-1)) < 0.01, `at ${distance} m`);
  }
  assert.ok(image(Math.cos(0.05), 8) < image(Math.cos(0.05), 2));
});

/** A scalar WGSL function as JavaScript: its types dropped, its lets constant, its vars and ifs as JavaScript's. */
function wgslToJs(wgsl: string): string {
  return wgsl
    .replace(
      /fn (\w+)\(([^)]*)\) -> \w+ \{/,
      (_whole, name: string, params: string) => `function ${name}(${params.replace(/: \w+/g, '')}) {`,
    )
    .replace(/\blet /g, 'const ')
    .replace(/\bvar /g, 'let ')
    .replace(/(\d)u\b/g, '$1')
    .replace(/\bif (.+) \{/g, 'if ($1) {');
}

test('a flame behind rock shows no image in still water: its line is walked cell by cell', () => {
  const wgsl = /fn rock_between\([\s\S]*?\n\}/.exec(DUNGEON_SHADER)?.[0];
  assert.ok(wgsl, 'a walk of the line');
  assert.match(
    DUNGEON_SHADER,
    /if image > [\d.]+ && !rock_between\(point\.x, point\.y, lamp\.place\.x, lamp\.place\.y\)/,
  );
  const most = Number(/const MOST_CELLS = (\d+)u;/.exec(DUNGEON_SHADER)?.[1]);
  // Five columns by three rows of 3.2 m cells, rock in the middle column's top two rows.
  const rock = [
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 0, 0],
  ];
  const context = {
    view: { grid: { x: 3.2 } },
    MOST_CELLS: most,
    floor: Math.floor,
    abs: Math.abs,
    sign: Math.sign,
    max: Math.max,
    select: (otherwise: number, chosen: number, choose: boolean) => (choose ? chosen : otherwise),
    rock_at: (column: number, row: number) => (rock[row]?.[column] ?? 1) === 1,
  };
  const between = (from: [number, number], to: [number, number]) =>
    Boolean(runInNewContext(`${wgslToJs(wgsl)}\nrock_between(${from.join()}, ${to.join()})`, context));
  assert.equal(between([1.6, 1.6], [14.4, 1.6]), true, 'straight through the rock');
  assert.equal(between([1.6, 8.0], [14.4, 8.0]), false, 'along the open row below it');
  assert.equal(between([1.6, 1.6], [4.8, 4.8]), false, 'within the open cells');
  assert.equal(between([1.6, 1.6], [14.4, 8.0]), true, 'slanting through its foot');
  assert.equal(between([1.6, 7.0], [14.4, 7.0]), false, 'back along the open row');
  assert.equal(between([0.5, 0.5], [0.5, 0.5]), false, 'its own cell');
  assert.ok(most >= 32, 'far enough for a dungeon');
});
