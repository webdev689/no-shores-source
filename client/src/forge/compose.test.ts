import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { type Strip, PART, composeFrame, ordersMeet } from './compose.ts';
import { PaletteSnap } from './dyes.ts';
import { type ForgeLooks, layersOf, lookCell } from './looks.ts';

const cell = { cell: [2, 1], frames: 2, root: [1, 1] } as const;
const looks: ForgeLooks = {
  bodies: {
    male: {
      anims: { idle: cell },
      cells: { cloak: { idle: { cell: [4, 1], frames: 2, root: [2, 1] } } },
      layers: { body: ['idle'], shirt: ['idle'], cuirass: ['idle'], cloak: ['idle'], hair_long: ['walk'] },
    },
  },
  order: { cuirass: 0.01 },
  dye: ['shirt'],
  depth: { base: -3, scale: 10000 },
};
const figure = { body: 'male', race: null, tone: null, hair: null, gear: ['shirt', 'cuirass'] };
const colours = { skins: { bodies: {} }, hair: { bodies: {} } };

/** A strip of one view: each frame's two texels with a colour (or depth, part) a texel; alpha 0 where `null`. */
function strip(texels: readonly ([number, number, number] | null)[]): Strip {
  const data = new Uint8Array(texels.length * 4);
  texels.forEach((texel, index) => {
    if (texel) data.set([...texel, 255], index * 4);
  });
  return { width: texels.length, height: 1, data };
}

const strips: Record<string, Strip> = {
  'forge/layers/male/body_idle.png': strip([
    [200, 150, 120],
    [200, 150, 120],
    [1, 1, 1],
    [1, 1, 1],
  ]),
  'forge/layers/male/body_idle_z.png': strip([[117, 48, PART.torso], [117, 48, PART.torso], null, null]),
  'forge/layers/male/shirt_idle.png': strip([[128, 128, 128], null, null, null]),
  'forge/layers/male/shirt_idle_z.png': strip([[117, 40, PART.torso], null, null, null]),
  'forge/layers/male/cuirass_idle.png': strip([[90, 90, 99], [90, 90, 99], null, null]),
  // A hair's breadth behind the shirt, but armour: its order brings it over the shirt on the torso.
  'forge/layers/male/cuirass_idle_z.png': strip([[117, 45, PART.torso], [117, 45, PART.torso], null, null]),
};
const read = (path: string) => Promise.resolve(strips[path] ?? null);

test('a figure stacks its body, hair and gear, only where the body draws them in the animation', () => {
  const dressed = { ...figure, hair: { layer: 'hair_long', colour: 'black' }, gear: [...figure.gear, 'sword'] };
  assert.deepEqual(layersOf(dressed, 'idle', looks), ['body', 'shirt', 'cuirass']);
});

test('the cell holds every layer about the root, one reaching past the animation cell included', () => {
  const cloaked = { ...figure, gear: ['cloak'] };
  assert.deepEqual(lookCell(cloaked, 'idle', looks), { cell: [4, 1], frames: 2, root: [2, 1] });
  assert.deepEqual(lookCell(figure, 'idle', looks), { cell: [2, 1], frames: 2, root: [1, 1] });
});

const blue = Array.from({ length: 16 }, (unused, step) => [0, 0, step * 16] as const);

test('the nearest texel is drawn, armour over the clothes it lies on by its order, and a dye lays grey only', async () => {
  const frame = await composeFrame(figure, 'idle', 0, 0, looks, colours, { shirt: blue }, read);
  assert.ok(frame);
  // Left: the cuirass lies 0.5 mm behind the shirt, but its 1 cm order draws it over.
  assert.deepEqual([...frame.pixels.subarray(0, 4)], [90, 90, 99, 255]);
  // Right: no shirt, the cuirass over the body.
  assert.deepEqual([...frame.pixels.subarray(4, 8)], [90, 90, 99, 255]);
  const bare = await composeFrame({ ...figure, gear: ['shirt'] }, 'idle', 0, 0, looks, colours, { shirt: blue }, read);
  assert.ok(bare);
  // Grey 128 is step 8 of the ramp.
  assert.deepEqual([...bare.pixels.subarray(0, 4)], [0, 0, 128, 255]);
  assert.deepEqual([...bare.pixels.subarray(4, 8)], [200, 150, 120, 255]);
  assert.ok(Math.abs((bare.depth[0] ?? 0) - (117 * 256 + 40) / 10000 + 3) < 1e-4);
});

test('a frame says which pixels are the weapon', async () => {
  const armed: ForgeLooks = {
    bodies: { male: { anims: { idle: cell }, layers: { body: ['idle'], sword: ['idle'] } } },
  };
  const sword: Record<string, Strip> = {
    'forge/layers/male/sword_idle.png': strip([[180, 190, 210], null, null, null]),
    'forge/layers/male/sword_idle_z.png': strip([[117, 30, PART.weapon], null, null, null]),
  };
  const withSword = (path: string) => Promise.resolve(sword[path] ?? strips[path] ?? null);
  const frame = await composeFrame({ ...figure, gear: ['sword'] }, 'idle', 0, 0, armed, colours, {}, withSword);
  assert.deepEqual([...(frame?.weapon ?? [])], [1, 0]);
});

test("a layer held counts as the weapon, whatever part the forge names: a cast's spark", async () => {
  const casting: ForgeLooks = {
    bodies: { male: { anims: { idle: cell }, layers: { body: ['idle'], spark: ['idle'] } } },
  };
  const spark: Record<string, Strip> = {
    'forge/layers/male/spark_idle.png': strip([null, [250, 240, 100], null, null]),
    'forge/layers/male/spark_idle_z.png': strip([null, [117, 30, PART.drape], null, null]),
  };
  const withSpark = (path: string) => Promise.resolve(spark[path] ?? strips[path] ?? null);
  const sparked = { ...figure, gear: ['spark'] };
  const plain = await composeFrame(sparked, 'idle', 0, 0, casting, colours, {}, withSpark);
  assert.deepEqual([...(plain?.weapon ?? [])], [0, 0], 'it hangs free');
  const held = await composeFrame(sparked, 'idle', 0, 0, casting, colours, {}, withSpark, new Set(['spark']));
  assert.deepEqual([...(held?.weapon ?? [])], [0, 1]);
});

test('orders weigh on one part and for a drape over what it hangs on, never for a weapon or a horse', () => {
  assert.ok(ordersMeet(PART.torso, PART.torso));
  assert.ok(ordersMeet(PART.drape, PART.torso));
  assert.ok(!ordersMeet(PART.drape, PART.armL));
  assert.ok(!ordersMeet(PART.weapon, PART.weapon));
  assert.ok(!ordersMeet(PART.horse, PART.none));
  assert.ok(ordersMeet(PART.none, PART.head));
});

test('a skin tone mixes the two nearest natural skin ramps, lightest first, deepest past the darkest', async () => {
  const ramp = (light: number) =>
    Array.from({ length: 4 }, (unused, step) => [light * (step + 1), light * (step + 1), light * (step + 1)] as const);
  const skins = {
    bodies: { male: { skin: [ramp(50)], races: { breton: ramp(60), redguard: ramp(20), darkelf: ramp(40) } } },
  };
  const tones = (await import('./skins.ts')).skinTones(skins, 'male');
  // Only natural skin: the ash-grey ramp is left out.
  assert.deepEqual(tones, ['breton', 'redguard']);
  const mixed = (tone: number) =>
    composeFrame({ ...figure, gear: [], tone }, 'idle', 0, 0, looks, { ...colours, skins }, {}, read).then(
      (frame) => frame?.pixels[0] ?? -1,
    );
  const [lightest, middle, darkest, deepest] = await Promise.all([mixed(0), mixed(0.33), mixed(0.66), mixed(1)]);
  assert.ok(
    lightest > middle && middle > darkest && darkest > deepest,
    `${lightest} > ${middle} > ${darkest} > ${deepest}`,
  );
});

test('a composed frame is snapped to the palette, its clear texels left alone', async () => {
  const snap = new PaletteSnap([
    [0, 0, 0],
    [250, 0, 0],
    [0, 0, 250],
    [128, 128, 128],
  ]);
  const frame = await composeFrame(
    { ...figure, gear: ['shirt'] },
    'idle',
    0,
    0,
    looks,
    { ...colours, snap },
    { shirt: blue },
    read,
  );
  assert.ok(frame);
  // The dyed blue goes to the palette's blue; the bare body's tan to its nearest, the grey.
  assert.deepEqual([...frame.pixels.subarray(0, 8)], [0, 0, 250, 255, 128, 128, 128, 255]);
});
