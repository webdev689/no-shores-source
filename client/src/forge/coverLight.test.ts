import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Strip } from './compose.ts';
import { coverGroup, coverPaths, coverSteps, coversOf } from './coverLight.ts';
import type { ForgeLooks } from './looks.ts';

/** A strip of one grey texel a light, `count` texels each. */
function greys(lights: readonly (readonly [number, number])[]): Strip {
  const texels = lights.flatMap(([light, count]) => Array.from({ length: count }, () => [light, light, light, 255]));
  return { width: texels.length, height: 1, data: Uint8Array.from(texels.flat()) };
}

const drawn = {
  helm_mages: ['idle'],
  cuirass_mages: ['idle', 'walk'],
  boots_mages: ['idle'],
  under_mages: ['idle'],
  cuirass_iron: ['idle'],
  shield_kite_elven: ['guard', 'march'],
  slung_shield_kite_elven: ['idle', 'walk'],
  bow_long_elven: ['idle_bow'],
  sheath_bow_long_elven: ['idle'],
  formal_cloak_drape: ['idle'],
  formal_cloak_plated: ['idle'],
};
const looks: ForgeLooks = { bodies: { male: { anims: {}, layers: drawn } } };

test('a covered piece is pooled with its whole set and padding, a weapon with itself put away, a cape with its hangs', () => {
  assert.deepEqual(coverGroup('helm_mages', drawn), ['helm_mages', 'cuirass_mages', 'boots_mages', 'under_mages']);
  assert.deepEqual(coverGroup('under_mages', drawn), coverGroup('boots_mages', drawn), 'the padding is of its set');
  assert.deepEqual(coverGroup('shield_kite_elven', drawn), ['shield_kite_elven', 'slung_shield_kite_elven']);
  assert.deepEqual(coverGroup('slung_shield_kite_elven', drawn), coverGroup('shield_kite_elven', drawn));
  assert.deepEqual(coverGroup('formal_cloak_plated', drawn), ['formal_cloak_drape', 'formal_cloak_plated']);
});

test('each piece is read in the move it stands in, whatever move is composed', () => {
  assert.deepEqual(coverPaths('male', 'bow_long_elven', looks), [
    'forge/layers/male/bow_long_elven_idle_bow.png',
    'forge/layers/male/sheath_bow_long_elven_idle.png',
  ]);
  assert.ok(coverPaths('male', 'shield_kite_elven', looks).includes('forge/layers/male/shield_kite_elven_guard.png'));
});

test("a covering ramp is laid across its set's span of light, darkest to its first step and brightest to its last", () => {
  // A set drawn dark, light 10 to 53, most of it at its darkest.
  const band = greys([[10, 100], ...Array.from({ length: 43 }, (_unused, index) => [11 + index, 1] as const)]);
  const steps = coverSteps([band]);
  assert.equal(steps[10], 0, 'its darkest the first step');
  assert.equal(steps[53], 15, 'its brightest the last');
  assert.equal(steps[32], 8, 'the middle of its light, the middle of the ramp, however its texels lie');
  for (let light = 1; light < 256; light++)
    assert.ok((steps[light] ?? 0) >= (steps[light - 1] ?? 0), 'it never darkens');
});

test("a stray glint or shadow, under a fiftieth of the set's texels, stretches nothing", () => {
  const steps = coverSteps([
    greys([
      [0, 1],
      [60, 50],
      [180, 49],
      [255, 1],
    ]),
  ]);
  assert.deepEqual([steps[0], steps[60], steps[120], steps[180], steps[255]], [0, 0, 8, 15, 15]);
});

test('a span too narrow to stretch keeps the light as it is', () => {
  assert.equal(coverSteps([greys([[91, 10]])])[91], 5);
});

test("a piece's laying is its set's, whatever else of it is worn or drawn", async () => {
  const strips: Record<string, Strip> = {
    'forge/layers/male/helm_mages_idle.png': greys([
      [60, 20],
      [90, 20],
    ]),
    'forge/layers/male/cuirass_mages_idle.png': greys([[120, 40]]),
    'forge/layers/male/boots_mages_idle.png': greys([[200, 40]]),
    'forge/layers/male/under_mages_idle.png': greys([[30, 10]]),
  };
  const read = (path: string) => Promise.resolve(strips[path] ?? null);
  const alone = await coversOf('male', ['helm_mages'], looks, read);
  const dressed = await coversOf('male', ['boots_mages', 'helm_mages', 'cuirass_mages'], looks, read);
  assert.deepEqual([...(alone.get('helm_mages') ?? [])], [...(dressed.get('helm_mages') ?? [])]);
  assert.deepEqual(dressed.get('helm_mages'), dressed.get('boots_mages'), 'one set, one laying');
  const helm = alone.get('helm_mages');
  assert.deepEqual([helm?.[30], helm?.[200]], [0, 15], "from the padding's darkest to the boots' brightest");
});

test("a strip with nothing drawn takes no part in its set's span", () => {
  const empty = { width: 1, height: 1, data: new Uint8Array(4) };
  assert.deepEqual(
    coverSteps([
      greys([
        [60, 10],
        [180, 10],
      ]),
      empty,
    ]),
    coverSteps([
      greys([
        [60, 10],
        [180, 10],
      ]),
    ]),
  );
});
