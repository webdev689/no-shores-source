import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MEADOW_SPRITES } from './meadowArt.ts';
import { MEADOW_CELL, MEADOW_SLOTS, meadowAtlas, meadowLevels, slotCoverage, spriteBox } from './meadowAtlas.ts';
import {
  BOXES,
  BREEZE_MS,
  BUSH,
  cardReach,
  CLUSTER_M,
  DRY,
  FLOWERS,
  GALE,
  GREEN,
  GUST,
  HEIGHT_M,
  LEAN_PER_PUSH,
  LUMA,
  pick,
  SHORT,
  STANDING_LEAN,
  TALL,
  texelOver,
  TONE,
  VARIANTS,
} from './meadowLaw.ts';
import { MEADOW_SHADER } from './meadowShader.ts';

const pixelOf = (slot: number, column: number, row: number): number[] => {
  const atlas = meadowAtlas();
  const texel = (row * atlas.width + slot * MEADOW_CELL + column) * 4;
  return [...atlas.data.slice(texel, texel + 4)];
};

test("the owner's five are written whole: square, each pixel a colour of its own or air", () => {
  assert.deepEqual(
    MEADOW_SPRITES.map(({ name }) => name),
    ['tall', 'short', 'flowers', 'dry', 'bush'],
  );
  for (const { name, picture } of MEADOW_SPRITES) {
    const side = name === 'bush' ? 64 : 32;
    assert.equal(picture.rows.length, side, name);
    for (const row of picture.rows) {
      assert.equal(row.length, side, name);
      for (const letter of row)
        assert.ok(letter === '.' || letter.charCodeAt(0) - 97 < picture.colours.length, `${name}: ${letter}`);
    }
    assert.ok(
      picture.colours.every((colour) => /^#[0-9a-f]{6}$/.test(colour)),
      name,
    );
  }
});

test('the atlas lays a tuft at two texels a pixel and the bush at one, each foot on its cell bottom, the rest air', () => {
  const atlas = meadowAtlas();
  assert.deepEqual([atlas.width, atlas.height], [MEADOW_SLOTS * MEADOW_CELL, MEADOW_CELL]);
  const tall = MEADOW_SPRITES[TALL]?.picture;
  assert.ok(tall);
  const rgb = (hex: string) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  for (let row = 0; row < 32; row++)
    for (let column = 0; column < 32; column++) {
      const letter = tall.rows[row]?.[column] ?? '.';
      const want = letter === '.' ? [0, 0, 0, 0] : [...rgb(tall.colours[letter.charCodeAt(0) - 97] ?? ''), 255];
      for (const [stepX, stepY] of [
        [0, 0],
        [1, 1],
      ])
        assert.deepEqual(pixelOf(TALL, column * 2 + stepX, row * 2 + stepY), want, `${column},${row}`);
    }
  assert.ok([...Array(MEADOW_CELL).keys()].some((column) => pixelOf(BUSH, column, MEADOW_CELL - 1)[3] === 255));
  for (let slot = 5; slot < MEADOW_SLOTS; slot++) assert.equal(slotCoverage(atlas)[slot], 0, `slot ${slot} is air`);
});

test("the chain halves to a texel, its second level is the owner's tufts, and each keeps its share drawn", () => {
  const levels = meadowLevels();
  assert.equal(levels.length, 10);
  assert.deepEqual([levels.at(-1)?.width, levels.at(-1)?.height], [1, 1]);
  const [atlas, second] = levels;
  assert.ok(atlas && second);
  for (let row = 0; row < 32; row++)
    for (let column = 0; column < 32; column++) {
      const from = (row * 2 * atlas.width + column * 2) * 4;
      const to = (row * second.width + column) * 4;
      assert.deepEqual([...second.data.slice(to, to + 4)], [...atlas.data.slice(from, from + 4)], `${column},${row}`);
    }
  const base = slotCoverage(atlas);
  for (const level of levels.slice(1)) {
    const across = level.width / MEADOW_SLOTS;
    if (across < 1) break;
    const drawn = slotCoverage(level);
    for (let slot = 0; slot < 5; slot++) {
      const cells = across * level.height;
      const want = Math.max(1, Math.round((base[slot] ?? 0) * cells)) / cells;
      assert.ok(Math.abs((drawn[slot] ?? 0) - want) < 1e-9, `level ${level.width}, slot ${slot}: ${drawn[slot]}`);
    }
  }
});

test('a kept block is the mean of its drawn texels, so air never darkens an edge', () => {
  const [atlas, second] = meadowLevels();
  assert.ok(atlas && second);
  for (let row = 0; row < second.height; row++)
    for (let column = 0; column < second.width; column++) {
      const texel = (row * second.width + column) * 4;
      if (!second.data[texel + 3]) continue;
      const drawn = [0, 1].flatMap((stepY) =>
        [0, 1].map((stepX) => ((row * 2 + stepY) * atlas.width + column * 2 + stepX) * 4),
      );
      const kept = drawn.filter((from) => atlas.data[from + 3]);
      for (const channel of [0, 1, 2]) {
        const mean = kept.reduce((sum, from) => sum + (atlas.data[from + channel] ?? 0), 0) / kept.length;
        assert.equal(second.data[texel + channel], Math.round(mean));
      }
    }
});

test("each sprite's card is cut to its drawn box, as DFO measured them", () => {
  const box = (picture: (typeof MEADOW_SPRITES)[number]['picture']) => {
    const { u0, u1, v0, v1 } = spriteBox(picture);
    return [u0, u1, v0, v1];
  };
  assert.deepEqual(
    MEADOW_SPRITES.map(({ picture }) => box(picture)),
    [
      [0.09375, 0.90625, 0, 0.75],
      [0.09375, 0.90625, 0, 0.5625],
      [0.03125, 0.96875, 0, 0.65625],
      [0.03125, 0.96875, 0, 0.65625],
      [0.03125, 0.984375, 0, 0.8125],
    ],
  );
  assert.deepEqual(box({ rows: ['..', '..'], colours: [] }), [0.5, 0.5, 0, 0]);
  assert.equal(BOXES.length, 5);
});

test('a poor patch grows short and dry grass, a lush one tall grass and flowers, a bush now and then', () => {
  const counts = { poor: [0, 0, 0, 0, 0], lush: [0, 0, 0, 0, 0] };
  for (let step = 0; step < 256; step++) {
    const draw = step / 255;
    const poor = pick(draw, 0).variant;
    const lush = pick(draw, 1).variant;
    counts.poor[poor] = (counts.poor[poor] ?? 0) + 1;
    counts.lush[lush] = (counts.lush[lush] ?? 0) + 1;
  }
  // [tall, short, flowers, dry, bush], as DFO's meadow pinned them.
  assert.deepEqual(counts.poor, [72, 118, 2, 61, 3]);
  assert.deepEqual(counts.lush, [147, 63, 35, 5, 6]);
  assert.equal(pick(0, 0.5).variant, BUSH);
  assert.ok([TALL, SHORT, FLOWERS, DRY].includes(pick(0.5, 0.5).variant));
  assert.ok(pick(0.9, 1).scale > pick(0.9, 0).scale, 'a lush patch stands taller');
  assert.ok(pick(0, 1).scale / pick(0.9, 1).scale > 1.6, 'a bush stands over the grass');
});

test("the owner's green takes its ground's hue, a shade lighter; petals and dry stalks take only its light", () => {
  const meadow = [0.29, 0.42, 0.22];
  const lifted = texelOver(GREEN, meadow);
  lifted.forEach((value, channel) =>
    assert.ok(Math.abs(value - (meadow[channel] ?? 0) * (TONE[channel] ?? 1)) < 1e-9, `${channel}: ${value}`),
  );
  const petal = [0.8, 0.3, 0.6];
  const tinted = texelOver(petal, meadow);
  const ratios = tinted.map((value, channel) => value / (petal[channel] ?? 1));
  assert.ok(Math.abs((ratios[0] ?? 0) - (ratios[2] ?? 0)) < 1e-9, 'a petal keeps its hue');
  const strange = texelOver(GREEN, [5, 0, 0]);
  assert.ok(Math.abs((strange[0] ?? 0) / (GREEN[0] ?? 1) - 1.6) < 1e-9, 'a ground far off grass only tints it');
});

test("the shader draws with the law's numbers, and three cards near", () => {
  for (const { u0, u1, v0, v1 } of BOXES)
    assert.ok(MEADOW_SHADER.includes(`vec4f(${[u0, u1, v0, v1].map((value) => value.toFixed(6)).join(', ')})`));
  assert.ok(MEADOW_SHADER.includes('fn meadow_near') && MEADOW_SHADER.includes('fn meadow_far'));
  // The pick's sprites, its lean and its colour come from the law, never copied by hand.
  for (const [rung, variant] of [
    ['x', BUSH],
    ['y', FLOWERS],
    ['z', DRY],
  ] as const)
    assert.ok(MEADOW_SHADER.includes(`shares.${rung}`) && MEADOW_SHADER.includes(`variant = ${variant}u;`));
  assert.ok(MEADOW_SHADER.includes(`variant = ${SHORT}u;`));
  assert.ok(MEADOW_SHADER.includes(`MEADOW_BREEZE_MS = ${BREEZE_MS.toFixed(1)};`));
  assert.ok(MEADOW_SHADER.includes(`MEADOW_LEAN_PER_PUSH = ${LEAN_PER_PUSH};`));
  assert.ok(MEADOW_SHADER.includes(`MEADOW_CLUSTER_M = ${CLUSTER_M};`));
  assert.ok(
    MEADOW_SHADER.includes(`MEADOW_LUMA_WEIGHTS = vec3f(${LUMA.map((value) => value.toFixed(6)).join(', ')});`),
  );
});

test("a cell's cull box grown by the cards' reach holds every corner of every tuft, in a gale, on the steepest grass", () => {
  const { tallest, widest } = cardReach();
  for (let step = 0; step <= 64; step++)
    for (const tint of [0, 0.5, 1]) {
      const { variant, scale } = pick(step / 64, tint);
      const box = BOXES[variant];
      const { sway, stiff } = VARIANTS[variant] ?? { sway: 1, stiff: 1 };
      assert.ok(box);
      const side = (HEIGHT_M[0] + HEIGHT_M[1]) * scale;
      const gale = GALE * BREEZE_MS * (GUST[0] + GUST[1]) * LEAN_PER_PUSH;
      const lean = (Math.hypot(STANDING_LEAN, STANDING_LEAN) * stiff + gale * sway) * box.v1 * box.v1 * side;
      const across = Math.max(0.5 - box.u0, box.u1 - 0.5) * side + lean + CLUSTER_M;
      assert.ok(across <= widest + 1e-9, `${variant}: reaches ${across}`);
      assert.ok(box.v1 * side + across * 0.45 <= tallest + 1e-9, `${variant}: stands ${box.v1 * side}`);
    }
});
