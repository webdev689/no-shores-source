import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PALETTE_RGB } from './palette.ts';
import { paintPicture, pictureArchives, pictureSize, pictureUses } from './picture.ts';

const table = <Table>(name: string): Table =>
  JSON.parse(readFileSync(new URL(`../../../content/forged/${name}.json`, import.meta.url), 'utf8')) as Table;
const uses = pictureUses({ buildings: table('buildings'), props: table('props'), roomkit: table('roomkit') });

const colourAt = (bytes: Uint8Array, offset: number): number =>
  (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
/** The palette's colours but index 0, a record's clear texel. */
const drawable = new Set(Array.from({ length: 255 }, (_index, k) => colourAt(PALETTE_RGB, (k + 1) * 3)));

test('every archive the forged world wears paints its first record at its size, opaque, in the palette', () => {
  const archives = pictureArchives(uses);
  assert.ok(archives.length >= 190, `the forged world wears ${archives.length} archives`);
  for (const archive of archives) {
    const size = pictureSize(archive, 0);
    const picture = paintPicture(archive, 0, 0, uses);
    assert.ok(size && picture, `${archive}.0 is painted`);
    assert.deepEqual([picture.width, picture.height], [size.width, size.height], `${archive}.0 keeps its size`);
    for (let offset = 0; offset < picture.rgba.length; offset += 4 * 7) {
      assert.equal(picture.rgba[offset + 3], 255, `${archive}.0 is opaque`);
      assert.ok(drawable.has(colourAt(picture.rgba, offset)), `${archive}.0 keeps to the palette`);
    }
  }
});
