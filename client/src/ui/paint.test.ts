import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BAND, FRAME_SIDE, framePixels, OUTSET } from '../plus/frame.ts';
import { TONES } from '../plus/tones.ts';
import { bevelPixels, grown, LOOKS, paint, type Tiles, without } from './paint.ts';
import { colourOf, QUAD_FLOATS, QuadList } from './quads.ts';

/** Tiles laid side by side along one row, each asked for once. */
function fakeTiles(): { tiles: Tiles; asked: string[] } {
  const asked: string[] = [];
  let along = 0;
  const placed = new Map<string, { x: number; y: number; width: number; height: number }>();
  const tiles: Tiles = (key, width, height, pixels) => {
    const known = placed.get(key);
    if (known) return known;
    asked.push(key);
    assert.equal(pixels().length, width * height * 4, `${key}: RGBA for every pixel`);
    const box = { x: along, y: 0, width, height };
    along += width + 1;
    placed.set(key, box);
    return box;
  };
  return { tiles, asked };
}

/** The quads in `list`: each box, colour and atlas rectangle. */
const quadsOf = (list: QuadList) =>
  Array.from({ length: list.count }, (_unused, index) => {
    const quad = list.data.subarray(index * QUAD_FLOATS, (index + 1) * QUAD_FLOATS);
    return { box: [...quad.subarray(0, 4)], texels: [...quad.subarray(4, 8)], colour: [...quad.subarray(8, 12)] };
  });

test('a box less a hole is the bands round the hole, and the whole box when they do not meet', () => {
  const outer = { x: 0, y: 0, width: 10, height: 10 };
  assert.deepEqual(without(outer, { x: 2, y: 2, width: 10, height: 10 }), [
    { x: 0, y: 0, width: 10, height: 2 },
    { x: 0, y: 2, width: 2, height: 8 },
  ]);
  assert.deepEqual(without(outer, { x: 20, y: 0, width: 5, height: 5 }), [outer]);
  assert.deepEqual(grown(outer, 1), { x: -1, y: -1, width: 12, height: 12 });
});

test('a bevel splits each corner on its diagonal, each pixel on it an even mix of its two edges', () => {
  // Each number to two places, so a mix's float rounding does not count.
  const pixels = bevelPixels('#111 #222 #333 #444', 2).map((colour) =>
    colour === null ? null : colour.replace(/\d+\.\d+/g, (number) => String(Math.round(Number(number) * 100) / 100)),
  );
  const row = (y: number) => pixels.slice(y * 5, y * 5 + 5);
  const mix = (one: number, two: number) => {
    const half = ((one + two) / 2) * 17;
    return `rgba(${half}, ${half}, ${half}, 1)`;
  };
  assert.deepEqual(row(0), [mix(1, 4), '#111', '#111', '#111', mix(1, 2)]);
  assert.deepEqual(row(1), ['#444', mix(1, 4), '#111', mix(1, 2), '#222']);
  assert.deepEqual(row(2), ['#444', '#444', null, '#222', '#222']);
  assert.deepEqual(row(3), ['#444', mix(3, 4), '#333', mix(3, 2), '#222']);
  assert.deepEqual(row(4), [mix(3, 4), '#333', '#333', '#333', mix(3, 2)]);
  assert.equal(bevelPixels('rgba(1,2,3,0.5) #fff', 1)[1], 'rgba(1,2,3,0.5)', 'one colour for two edges');
});

test('a chip lays its drop and ring outside its box, its ground, then its bevel cut in nine round a hollow middle', () => {
  const list = new QuadList();
  const { tiles, asked } = fakeTiles();
  const box = { x: 10, y: 20, width: 40, height: 30 };
  paint(list, tiles, 'chip', { box, scale: 2 });
  const quads = quadsOf(list);
  assert.deepEqual(asked, [`bevel ${LOOKS.chip.rest.bevel} 4`], 'its bevel 4 device pixels deep');
  assert.deepEqual(
    quads.slice(0, 2).map((quad) => quad.box),
    [
      [12, 50, 44, 6],
      [50, 22, 6, 28],
    ],
    'the drop: 2 px down and right and a pixel larger, at twice the scale, only where it shows past the box',
  );
  assert.deepEqual(
    quads.slice(2, 6).map((quad) => quad.box),
    [
      [8, 18, 44, 2],
      [8, 50, 44, 2],
      [8, 20, 2, 30],
      [50, 20, 2, 30],
    ],
    'the ring: a pixel round',
  );
  assert.deepEqual(quads[2]?.colour, [...new Float32Array(colourOf(TONES.outline))], "in the outline's tone");
  assert.deepEqual(quads[6]?.box, [10, 20, 40, 30], 'the ground');
  const bevel = quads.slice(7);
  assert.equal(bevel.length, 8, 'eight pieces, no middle');
  assert.deepEqual(bevel[0]?.box, [10, 20, 4, 4], 'a corner: 4 texels, a device pixel each');
  assert.deepEqual(bevel[0]?.texels, [0, 0, 4, 4]);
  assert.deepEqual(bevel[1]?.box, [14, 20, 32, 4], 'the top edge stretched between');
  assert.deepEqual(bevel[1]?.texels, [4, 0, 1, 4]);
});

test('a held press sinks a pixel with its inset shade; a fade dims every quad', () => {
  const list = new QuadList();
  const { tiles } = fakeTiles();
  const { box } = paint(list, tiles, 'button', {
    box: { x: 0, y: 0, width: 20, height: 20 },
    scale: 1,
    state: 'active',
  });
  assert.deepEqual(box, { x: 1, y: 1, width: 20, height: 20 });
  const faded = new QuadList();
  paint(faded, tiles, 'chip', { box: { x: 0, y: 0, width: 20, height: 20 }, scale: 1, fade: 0.5 });
  const drop = quadsOf(faded)[0];
  assert.ok(drop && Math.abs((drop.colour[3] ?? 0) - 0.35 * 0.5) < 1e-6, 'the drop at half its alpha');
});

test('a window wears its grain inside its border and the carved frame round it, reaching out past its box', () => {
  const list = new QuadList();
  const { tiles, asked } = fakeTiles();
  paint(list, tiles, 'window', { box: { x: 100, y: 100, width: 200, height: 100 }, scale: 1 });
  assert.deepEqual(asked, ['grain', 'frame']);
  const quads = quadsOf(list);
  const corner = quads.at(-8);
  assert.deepEqual(corner?.box, [100 - OUTSET, 100 - OUTSET, BAND, BAND]);
  assert.equal(framePixels().length, FRAME_SIDE * FRAME_SIDE);
});
