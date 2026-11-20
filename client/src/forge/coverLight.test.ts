import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Strip } from './compose.ts';
import { coverColour, coverGroup, coverLevels, coverPaths, coversOf } from './coverLight.ts';
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

test("a covering ramp's steps each hold as many of the set's texels, so a narrow band of light keeps its detail", () => {
  // A set drawn dark in a narrow band, light 10 to 53, every light as common.
  const band = greys(Array.from({ length: 44 }, (_unused, index) => [10 + index, 10] as const));
  const levels = coverLevels([band]);
  const steps = levels.map((level) => level >> 4);
  assert.equal(steps[10], 0, 'its darkest the first step');
  assert.equal(steps[53], 15, 'its brightest the last');
  const held = new Array<number>(16).fill(0);
  for (let light = 10; light <= 53; light++) held[steps[light] ?? 0] += 1;
  assert.ok(Math.max(...held) - Math.min(...held) <= 1, `each step holds as many lights: ${held.join()}`);
  for (let light = 1; light < 256; light++)
    assert.ok((steps[light] ?? 0) >= (steps[light - 1] ?? 0), 'it never darkens');
});

test("a stray glint or shadow, under a fiftieth of the set's texels, stretches nothing", () => {
  const levels = coverLevels([
    greys([
      [0, 1],
      [100, 50],
      [101, 49],
      [255, 1],
    ]),
  ]);
  assert.equal(levels[0], 0);
  assert.equal(levels[255], 255);
  assert.ok(
    (levels[101] ?? 0) - (levels[100] ?? 0) >= 96,
    'the two lights the set is drawn in lie far apart on the ramp',
  );
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
  assert.equal(dressed.get('helm_mages'), dressed.get('boots_mages'), 'one set, one laying, made once');
});

test('each colour a covering ramp draws holds as much of the way, however many steps the palette draws it in', () => {
  const ramp = [
    [1, 1, 1],
    [2, 2, 2],
    [2, 2, 2],
    [2, 2, 2],
    [3, 3, 3],
  ] as const;
  assert.deepEqual(coverColour(ramp, 0), [1, 1, 1]);
  assert.deepEqual(coverColour(ramp, 100), [2, 2, 2]);
  assert.deepEqual(coverColour(ramp, 180), [3, 3, 3], 'the last third is the brightest, though one step of five');
});
