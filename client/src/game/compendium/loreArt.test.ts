import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COVER, coverGrid, coverPixels, slotPixels } from './loreArt.ts';

/** The colour of a pixel of RGBA `pixels` on `grid`, `#rrggbb`, or null where it is clear. */
const toneAt = (pixels: Uint8Array, [width]: readonly [number, number], x: number, y: number): string | null => {
  const start = (y * width + x) * 4;
  if ((pixels[start + 3] ?? 0) === 0) return null;
  return `#${[...pixels.slice(start, start + 3)].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
};

test('a cover stands square at every size it is drawn: a pixel a CSS pixel under 96, two from there', () => {
  assert.deepEqual([48, 96, 144, 192].map(coverGrid), [COVER, [48, 60], [72, 90], [96, 120]]);
});

test("a cover is its cloth, its motif raised in brass in the disc's middle, its corners round and its pages under it", () => {
  for (const grid of [coverGrid(48), coverGrid(192)]) {
    const [width, height] = grid;
    const bolt = coverPixels(grid, '#447cc0', 'bolt', false);
    const blank = coverPixels(grid, '#447cc0', 'none drawn', false);
    assert.equal(bolt.length, width * height * 4);
    assert.equal(toneAt(bolt, grid, 0, 0), null, 'a round corner');
    assert.equal(toneAt(bolt, grid, width / 2, height - 2), '#e9dfc4', "the pages' edge");
    const changed: [number, number][] = [];
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) if (toneAt(bolt, grid, x, y) !== toneAt(blank, grid, x, y)) changed.push([x, y]);
    assert.ok(changed.length > 30, 'the bolt shows');
    const middle = [width / 2, height * 0.42] as const;
    assert.ok(
      changed.every(([x, y]) => Math.hypot(x - middle[0], y - middle[1]) < width * 0.36),
      'only in the disc',
    );
  }
});

test('a book complete turns down a gold corner; one not found is an empty slot outlined in dots', () => {
  const grid = coverGrid(192);
  const [width, height] = grid;
  const corner = [width - 3, height - 6] as const;
  assert.equal(toneAt(coverPixels(grid, '#447cc0', 'bolt', true), grid, ...corner), '#f3cf86');
  assert.notEqual(toneAt(coverPixels(grid, '#447cc0', 'bolt', false), grid, ...corner), '#f3cf86');
  const slot = slotPixels(grid);
  const rim = Array.from({ length: width }, (unused, x) => toneAt(slot, grid, x, 0));
  assert.ok(rim.includes(null) && rim.includes('#7a7260'), 'dots and gaps along its edge');
  assert.equal(slot[(60 * width + 48) * 4 + 3], 70, 'a faint dark inside');
});
