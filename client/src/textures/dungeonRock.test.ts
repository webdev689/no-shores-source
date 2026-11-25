import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { PALETTE_RGB } from './palette.ts';
import { paintPicture, pictureSize, type Picture } from './picture.ts';

/** The rock sets are painted by their archive alone: no use chooses within them. */
const NO_USES = new Map();
const CLIMATE_BASES = [0, 100, 300, 400];
const ROCK_SETS = [19, 20];
const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex').slice(0, 16);

function paint(archive: number, record: number): Picture {
  const picture = paintPicture(archive, record, 0, NO_USES);
  assert.ok(picture, `${archive}.${record} is painted`);
  return picture;
}

const colourAt = (bytes: Uint8Array, offset: number): number =>
  (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
/** The palette's colours but index 0, a record's clear texel. */
const drawable = new Set(Array.from({ length: 255 }, (_index, k) => colourAt(PALETTE_RGB, (k + 1) * 3)));

/** [archive, record, the first 16 hex digits of the SHA-256 of the picture's RGBA]: the mines (19) and the caverns
 *  (20), every record in every climate, as the painter gives them in Node. */
// prettier-ignore
const ROCK_PICTURES: readonly (readonly [number, number, string])[] = [
  [19, 0, '21a82b08623eff11'], [19, 1, '21e50b82b7c11090'], [19, 2, '9fd53db7df5bd765'],
  [19, 3, '0434612f2f15e3df'], [19, 4, '282ada859e0699a3'],
  [20, 0, 'b1c9f9bc68c1185f'], [20, 1, 'af88a61a728e1cd9'], [20, 2, '8a07c3995db39ce1'],
  [20, 3, '5a9391aba5a7cecd'], [20, 4, '98e67fd6b4950983'],
  [119, 0, '212aae092f1c4032'], [119, 1, 'ce350a020a409738'], [119, 2, '1f8f5a634f659235'],
  [119, 3, '6b76ff4747592f82'], [119, 4, '8d45a450b0946167'],
  [120, 0, '37442dc99e8d1e69'], [120, 1, 'b61d93481b7761aa'], [120, 2, 'd1cd6c0b7c69d649'],
  [120, 3, '5706c172d6fd336d'], [120, 4, '4a426342d8d8c028'],
  [319, 0, '0af2522f78ad2698'], [319, 1, 'bdcf530a4d500efe'], [319, 2, '4f6c877ba0b9dddb'],
  [319, 3, 'e63e1c990fe469e7'], [319, 4, '719d48a509b94386'],
  [320, 0, '7006ce0df3ab9a96'], [320, 1, '9005f7dd65c959cd'], [320, 2, '1b2ee3780ee50b19'],
  [320, 3, '7fe834fcb3ea2478'], [320, 4, '98ae29f3bca95618'],
  [419, 0, 'feab9205ee261ff3'], [419, 1, 'cbc01b3561954eab'], [419, 2, 'aebaa2725701df64'],
  [419, 3, '29e76f27a82a97aa'], [419, 4, 'adf9ce3360f6ca7e'],
  [420, 0, '27bc7dbe5d9d4a8a'], [420, 1, '920d8eaf79386d30'], [420, 2, 'a0d5977ef4f3a36f'],
  [420, 3, 'af22bb4ddfab11ba'], [420, 4, 'fc76de945801fa35'],
];

test('the mines and the caverns paint every record in every climate at its size, opaque, in the palette', () => {
  for (const base of CLIMATE_BASES)
    for (const set of ROCK_SETS)
      for (let record = 0; record < 5; record++) {
        const archive = base + set;
        const picture = paint(archive, record);
        const size = pictureSize(archive, record);
        assert.deepEqual([picture.width, picture.height], [size?.width, size?.height], `${archive}.${record}`);
        assert.equal(picture.glass, null, `${archive}.${record} keeps no glass`);
        for (let offset = 0; offset < picture.rgba.length; offset += 4) {
          assert.equal(picture.rgba[offset + 3], 255);
          assert.ok(drawable.has(colourAt(picture.rgba, offset)), `${archive}.${record} keeps to the palette`);
        }
      }
});

test('every rock picture is the same bytes each time it is painted', () => {
  for (const [archive, record, rgba] of ROCK_PICTURES) assert.equal(digest(paint(archive, record).rgba), rgba);
  assert.deepEqual(paint(120, 3).rgba, paint(120, 3).rgba);
});

test('a rock picture tiles: its edges meet no rougher than its own roughest seam inside', () => {
  const lum = (picture: Picture, x: number, y: number): number => {
    const offset = (y * picture.width + x) * 4;
    return 0.3 * picture.rgba[offset] + 0.59 * picture.rgba[offset + 1] + 0.11 * picture.rgba[offset + 2];
  };
  for (const [archive, record] of ROCK_PICTURES) {
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

test("each climate paints its own rock: a record's four turns differ in colour", () => {
  const mean = (picture: Picture): number[] => {
    const sum = [0, 0, 0];
    for (let offset = 0; offset < picture.rgba.length; offset += 4)
      for (let channel = 0; channel < 3; channel++) sum[channel] += picture.rgba[offset + channel];
    return sum.map((value) => value / (picture.rgba.length / 4));
  };
  for (const set of ROCK_SETS)
    for (let record = 0; record < 5; record++) {
      const means = CLIMATE_BASES.map((base) => mean(paint(base + set, record)));
      for (let a = 0; a < means.length; a++)
        for (let b = a + 1; b < means.length; b++) {
          const apart = Math.hypot(...means[a].map((value, channel) => value - means[b][channel]));
          assert.ok(apart > 8, `set ${set} record ${record}: climates ${a} and ${b} are ${apart.toFixed(1)} apart`);
        }
    }
});
