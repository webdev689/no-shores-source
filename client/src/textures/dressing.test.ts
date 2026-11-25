import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { CLIMATE_BASE, CLIMATES, DRESSING_ARCHIVE, SEASONS } from './climate.ts';
import { PALETTE_RGB } from './palette.ts';
import { climateArchive, paintPicture, pictureSize, type Picture } from './picture.ts';

/** The dressing is painted by its archive alone: no use chooses within it. */
const NO_USES = new Map();
const RECORDS = 6;
const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex').slice(0, 16);
const archives = CLIMATES.map((climate) => climateArchive(DRESSING_ARCHIVE, 0, climate, 'summer'));

function paint(archive: number, record: number): Picture {
  const picture = paintPicture(archive, record, 0, NO_USES);
  assert.ok(picture, `${archive}.${record} is painted`);
  return picture;
}

const colourAt = (bytes: Uint8Array, offset: number): number =>
  (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
/** The palette's colours but index 0, a record's clear texel. */
const drawable = new Set(Array.from({ length: 255 }, (_index, k) => colourAt(PALETTE_RGB, (k + 1) * 3)));

/** [archive, record, the first 16 hex digits of the SHA-256 of the picture's RGBA]: the dressing's bones, carving,
 *  cloth, rope, ore and brass in every climate, as the painter gives them in Node. */
// prettier-ignore
const DRESSING_PICTURES: readonly (readonly [number, number, string])[] = [
  [1021, 0, '8930efdf75ee01a6'], [1021, 1, 'dd56c5f25b266b18'], [1021, 2, 'ded273cee393d90c'],
  [1021, 3, '16d56b9c4a68f8b0'], [1021, 4, '4332b9633179ef95'], [1021, 5, 'b10d3d289bf499e3'],
  [1121, 0, '31e31551a616977c'], [1121, 1, '7dd65b0996e29328'], [1121, 2, 'ae2d7a18c44b1c7a'],
  [1121, 3, '0853ef9631c0f811'], [1121, 4, 'f020cf705be6d605'], [1121, 5, 'a1aee677b9ad3d67'],
  [1321, 0, 'd1857cb9c5b4a0c8'], [1321, 1, '152487af10470251'], [1321, 2, 'a8733fecdf4bc5fa'],
  [1321, 3, 'dc5d5712e8d3c59d'], [1321, 4, '19eef7f91f2bb39f'], [1321, 5, 'c4aa78a7de09c552'],
  [1421, 0, '585f4c965d213505'], [1421, 1, '402770ca0a13d43e'], [1421, 2, 'd528ab05c1122fc8'],
  [1421, 3, '9c89c2cf6b0dc5dc'], [1421, 4, 'ebd478e8c147af17'], [1421, 5, '5297918a06aeea7b'],
];

test("the dressing turns to each climate as the dungeon's sets do, past every archive Daggerfall files", () => {
  assert.deepEqual(archives, [1021, 1121, 1321, 1421]);
  for (const climate of CLIMATES)
    for (const season of SEASONS)
      for (const from of archives) {
        const turn = climateArchive(from, 3, climate, season);
        assert.equal(turn - 1000, CLIMATE_BASE[climate] + 21, `${from} in ${climate} ${season}`);
        assert.equal(turn - 1000 - 21, climateArchive(19, 3, climate, season) - 19, 'as the mines turn');
        assert.equal(turn - 1000 - 21, climateArchive(120, 3, climate, season) - 20, 'as the caverns turn');
      }
  assert.equal(climateArchive(121, 0, 'temperate', 'summer'), 121, "Daggerfall's own 121 keeps its number");
  assert.equal(climateArchive(321, 2, 'mountain', 'winter'), 321, 'and its 321');
});

test('the catalog knows the dressing: six records 64 x 64 in every climate, and none past them', () => {
  for (const archive of archives) {
    for (let record = 0; record < RECORDS; record++)
      assert.deepEqual(pictureSize(archive, record), { width: 64, height: 64, frames: 1 }, `${archive}.${record}`);
    assert.equal(pictureSize(archive, RECORDS), null);
    assert.equal(paintPicture(archive, RECORDS, 0, NO_USES), null);
  }
});

test('the dressing paints every record in every climate at its size, opaque, in the palette', () => {
  for (const archive of archives)
    for (let record = 0; record < RECORDS; record++) {
      const picture = paint(archive, record);
      assert.deepEqual([picture.width, picture.height, picture.glass], [64, 64, null], `${archive}.${record}`);
      for (let offset = 0; offset < picture.rgba.length; offset += 4) {
        assert.equal(picture.rgba[offset + 3], 255);
        assert.ok(drawable.has(colourAt(picture.rgba, offset)), `${archive}.${record} keeps to the palette`);
      }
    }
});

test('every dressing picture is the same bytes each time it is painted', () => {
  assert.equal(DRESSING_PICTURES.length, archives.length * RECORDS);
  for (const [archive, record, rgba] of DRESSING_PICTURES) assert.equal(digest(paint(archive, record).rgba), rgba);
  assert.deepEqual(paint(1321, 0).rgba, paint(1321, 0).rgba);
});

test('a dressing picture tiles: its edges meet no rougher than its own roughest seam inside', () => {
  const lum = (picture: Picture, x: number, y: number): number => {
    const offset = (y * picture.width + x) * 4;
    return 0.3 * picture.rgba[offset] + 0.59 * picture.rgba[offset + 1] + 0.11 * picture.rgba[offset + 2];
  };
  for (const [archive, record] of DRESSING_PICTURES) {
    const picture = paint(archive, record);
    const { width, height } = picture;
    const columns = (a: number, b: number): number => {
      let sum = 0;
      for (let y = 0; y < height; y++) sum += Math.abs(lum(picture, a, y) - lum(picture, b, y));
      return sum;
    };
    const rows = (a: number, b: number): number => {
      let sum = 0;
      for (let x = 0; x < width; x++) sum += Math.abs(lum(picture, x, a) - lum(picture, x, b));
      return sum;
    };
    let insideX = 0;
    let insideY = 0;
    for (let x = 0; x + 1 < width; x++) insideX = Math.max(insideX, columns(x, x + 1));
    for (let y = 0; y + 1 < height; y++) insideY = Math.max(insideY, rows(y, y + 1));
    assert.ok(columns(width - 1, 0) <= insideX * 1.5, `${archive}.${record}: the side seam`);
    assert.ok(rows(height - 1, 0) <= insideY * 1.5, `${archive}.${record}: the top seam`);
  }
});

test('each climate carves its own stone, dyes its own cloth and holds its own ore', () => {
  const mean = (picture: Picture): number[] => {
    const sum = [0, 0, 0];
    for (let offset = 0; offset < picture.rgba.length; offset += 4)
      for (let channel = 0; channel < 3; channel++) sum[channel] += picture.rgba[offset + channel];
    return sum.map((value) => value / (picture.rgba.length / 4));
  };
  for (const record of [1, 2, 4]) {
    const means = archives.map((archive) => mean(paint(archive, record)));
    for (let a = 0; a < means.length; a++)
      for (let b = a + 1; b < means.length; b++) {
        const apart = Math.hypot(...means[a].map((value, channel) => value - means[b][channel]));
        assert.ok(apart > 8, `record ${record}: climates ${a} and ${b} are ${apart.toFixed(1)} apart`);
      }
  }
});
