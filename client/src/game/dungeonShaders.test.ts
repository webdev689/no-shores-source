import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAVE_BULGE_M } from './dungeonCeilings.ts';
import { LIGHT_WGSL } from './dungeonLight.ts';
import { DUNGEON_SHADER, LIGHT_FLOATS, MOST_LOOKS, VIEW_FLOATS } from './dungeonShaders.ts';

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
