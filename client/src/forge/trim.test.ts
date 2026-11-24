import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { PART, type Strip, composeFrame } from './compose.ts';
import { TRIM_ALPHA, coverSteps } from './coverLight.ts';
import type { ForgeLooks } from './looks.ts';

// A faction's blade: the forge marks its hilt's texels (TRIM_ALPHA) and the page lays the faction's colour there.

const looks: ForgeLooks = {
  bodies: {
    male: {
      anims: { idle: { cell: [3, 1], frames: 1, root: [1, 1] } },
      layers: { sword_elven: ['idle'], shirt: ['idle'] },
    },
  },
  dye: ['shirt'],
  depth: { base: -3, scale: 10000 },
};
const colours = { skins: { bodies: {} }, hair: { bodies: {} } };
const violet = Array.from({ length: 16 }, (unused, step) => [step * 10, 0, step * 16] as const);

/** A strip of one row: each texel its colour and alpha, none where `null`. */
function strip(texels: readonly (readonly [number, number, number, number] | null)[]): Strip {
  const data = new Uint8Array(texels.length * 4);
  texels.forEach((texel, index) => {
    if (texel) data.set(texel, index * 4);
  });
  return { width: texels.length, height: 1, data };
}

// Left the blade's own metal, then its guard and its grip, marked as trim.
const marked = strip([
  [220, 216, 204, 255],
  [212, 170, 70, TRIM_ALPHA],
  [40, 30, 22, TRIM_ALPHA],
]);
// The same blade drawn before the forge marked its trim.
const unmarked = strip([
  [220, 216, 204, 255],
  [212, 170, 70, 255],
  [40, 30, 22, 255],
]);
const depth = strip([
  [117, 40, PART.weapon, 255],
  [117, 40, PART.weapon, 255],
  [117, 40, PART.weapon, 255],
]);
const sword = { body: 'male', race: null, tone: null, hair: null, gear: ['sword_elven'] };
const reader = (colour: Strip) => (path: string) =>
  Promise.resolve(path.endsWith('_z.png') ? depth : path.includes('sword_elven') ? colour : null);
const pixels = async (colour: Strip, ramps: Record<string, readonly (readonly [number, number, number])[]>) => {
  const frame = await composeFrame(sword, 'idle', 0, 0, looks, colours, ramps, reader(colour));
  assert.ok(frame);
  return [0, 1, 2].map((texel) => [...frame.pixels.subarray(texel * 4, texel * 4 + 4)]);
};

test("a faction's blade keeps its metal and lays its faction's colour on its marked trim, by its light", async () => {
  const [metal, guard, grip] = await pixels(marked, { sword_elven: violet });
  assert.deepEqual(metal, [220, 216, 204, 255], 'the blade keeps its metal');
  // Unstretched, each light takes its own share of the ramp: the guard's 170 step 10, the grip's 32 step 2.
  assert.deepEqual(guard, [100, 0, 160, 255]);
  assert.deepEqual(grip, [20, 0, 32, 255]);
});

test("another content's blade of the same metal keeps its own hilt: no ramp, no colour laid", async () => {
  assert.deepEqual(await pixels(marked, {}), [
    [220, 216, 204, 255],
    [212, 170, 70, 255],
    [40, 30, 22, 255],
  ]);
});

test("a strip the forge drew before it marked trim draws as it did, a faction's or not", async () => {
  const own = [
    [220, 216, 204, 255],
    [212, 170, 70, 255],
    [40, 30, 22, 255],
  ];
  assert.deepEqual(await pixels(unmarked, { sword_elven: violet }), own);
  assert.deepEqual(await pixels(unmarked, {}), own);
});

test("a faction's blade is laid across its trim's own span of light, its darkest to the ramp's first step", async () => {
  // The guard is the trim's brightest, the grip its darkest: the metal's light, unmarked, stretches nothing.
  const steps = coverSteps([marked], true);
  const frame = await composeFrame(
    sword,
    'idle',
    0,
    0,
    looks,
    colours,
    { sword_elven: violet },
    reader(marked),
    new Set(),
    new Map([['sword_elven', steps]]),
  );
  assert.ok(frame);
  assert.deepEqual([...frame.pixels.subarray(4, 8)], [150, 0, 240, 255], 'the guard, the last step');
  assert.deepEqual([...frame.pixels.subarray(8, 12)], [0, 0, 0, 255], 'the grip, the first');
});

test('a span read from trim alone, from a strip with none marked, keeps each light as it is', () => {
  const steps = coverSteps([unmarked], true);
  assert.deepEqual([steps[0], steps[255]], [0, 15]);
});
