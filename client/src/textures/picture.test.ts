import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { catalogArchives, catalogRecords } from './catalog.ts';
import {
  PALETTE_RGB,
  climateArchive,
  paintPicture,
  pictureSize,
  pictureUses,
  summerOf,
  type Picture,
} from './picture.ts';
import { TERRAIN_ARCHIVES } from './recipes/ground.ts';

const table = <Table>(name: string): Table =>
  JSON.parse(readFileSync(new URL(`../../../content/forged/${name}.json`, import.meta.url), 'utf8')) as Table;
const uses = pictureUses({ buildings: table('buildings'), props: table('props'), roomkit: table('roomkit') });

function paint(archive: number, record: number, frame = 0): Picture {
  const picture = paintPicture(archive, record, frame, uses);
  assert.ok(picture, `${archive}.${record} is painted`);
  return picture;
}

const colourAt = (bytes: Uint8Array, offset: number): number =>
  (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
/** The palette's colours but index 0, a record's clear texel. */
const drawable = new Set(Array.from({ length: 255 }, (_index, k) => colourAt(PALETTE_RGB, (k + 1) * 3)));

/** The share of texels two pictures differ at, and how much lighter the second is there on average. */
function changed(from: Picture, to: Picture): { share: number; lift: number } {
  let n = 0;
  let lift = 0;
  for (let offset = 0; offset < from.rgba.length; offset += 4)
    if (colourAt(from.rgba, offset) !== colourAt(to.rgba, offset)) {
      n++;
      const sum = (bytes: Uint8Array): number => bytes[offset] + bytes[offset + 1] + bytes[offset + 2];
      lift += (sum(to.rgba) - sum(from.rgba)) / 3;
    }
  return { share: n / (from.rgba.length / 4), lift: n ? lift / n : 0 };
}

test("the catalog holds Daggerfall's 6,713 records and the dressing's 24, each with its size and frames", () => {
  let records = 0;
  for (const archive of catalogArchives()) records += catalogRecords(archive)?.length ?? 0;
  assert.equal(records, 6713 + 24);
  assert.deepEqual(pictureSize(302, 0), { width: 64, height: 64, frames: 1 });
  assert.deepEqual(pictureSize(87, 0), { width: 64, height: 40, frames: 4 });
  assert.equal(pictureSize(99999, 0), null);
  assert.equal(pictureSize(302, 56), null);
});

test('every ground set paints its records 64 x 64, opaque, in the palette, the same each time', () => {
  const records = [0, 5, 13, 46, 54, 3, 20, 33, 47, 55, 11, 29];
  TERRAIN_ARCHIVES.forEach((archive, k) => {
    const picture = paint(archive, records[k]);
    assert.deepEqual([picture.width, picture.height, picture.glass], [64, 64, null]);
    for (let offset = 0; offset < picture.rgba.length; offset += 4) {
      assert.equal(picture.rgba[offset + 3], 255);
      assert.ok(drawable.has(colourAt(picture.rgba, offset)), `${archive}.${records[k]} keeps to the palette`);
    }
  });
  assert.deepEqual(paint(302, 7).rgba, paint(302, 7).rgba);
});

test('a plain ground set tiles: its edges meet no rougher than its middle does', () => {
  for (const record of [0, 1, 2, 3]) {
    const picture = paint(302, record);
    const lum = (x: number, y: number): number => {
      const offset = (y * 64 + x) * 4;
      return 0.3 * picture.rgba[offset] + 0.59 * picture.rgba[offset + 1] + 0.11 * picture.rgba[offset + 2];
    };
    let seam = 0;
    let inner = 0;
    for (let y = 0; y < 64; y++) {
      seam += Math.abs(lum(63, y) - lum(0, y));
      inner += Math.abs(lum(31, y) - lum(32, y));
    }
    assert.ok(seam < inner * 1.6 + 64, `302.${record}: the wrap seam (${seam}) against the middle (${inner})`);
  }
});

test('a solid colour is its palette index: archive 0 from index 0, archive 1 from index 128', () => {
  const solid = paint(1, 5);
  assert.deepEqual([...solid.rgba.slice(0, 4)], [...PALETTE_RGB.slice(133 * 3, 133 * 3 + 3), 255]);
  assert.deepEqual([...paint(0, 77).rgba.slice(-4, -1)], [...PALETTE_RGB.slice(77 * 3, 77 * 3 + 3)]);
});

test('a winter set is its summer one with snow on part of it, lighter where it lies', () => {
  assert.equal(summerOf(312), null);
  assert.equal(summerOf(81), null, 'the books are no winter set');
  assert.equal(summerOf(303), null, 'the ground paints its own winter');
  for (const [winter, summer, record] of [
    [313, 312, 1],
    [80, 79, 0],
    [83, 82, 1],
  ]) {
    assert.equal(summerOf(winter), summer, `${winter} is ${summer} snowed`);
    const { share, lift } = changed(paint(summer, record), paint(winter, record));
    assert.ok(share > 0.02 && share < 0.6, `${winter}.${record}: snow on part of it (${share.toFixed(3)})`);
    assert.ok(lift > 20, `${winter}.${record}: lighter where it changed (${lift.toFixed(1)})`);
  }
});

test('an animated hearth moves only where its fire burns', () => {
  const hearth = [0, 1, 2, 3].map((frame) => paint(87, 0, frame));
  const { width, height } = hearth[0];
  for (const frame of [1, 2, 3]) {
    let moved = 0;
    let still = 0;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        const differs = colourAt(hearth[0].rgba, offset) !== colourAt(hearth[frame].rgba, offset);
        const fire = y > height * 0.35 && Math.abs(x - width / 2) < width * 0.3;
        if (differs && fire) moved++;
        if (differs && !fire) still++;
      }
    assert.ok(moved > 0, `the fire moves in frame ${frame}`);
    assert.ok(still < width * height * 0.03, `frame ${frame}: the stone round the fire stays (${still} texels)`);
  }
});

test('a window keeps its panes as glass, the dark hole too; nothing else keeps glass', () => {
  for (const [archive, record] of [
    [312, 3],
    [26, 3],
    [64, 3],
    [172, 3],
    [316, 2],
  ]) {
    const picture = paint(archive, record);
    assert.equal(picture.glass?.length, picture.width * picture.height);
    assert.ok(
      picture.glass?.some((pane) => pane === 1),
      `${archive}.${record} has glass`,
    );
  }
  for (const [archive, record] of [
    [48, 0],
    [71, 0],
    [74, 2],
    [81, 0],
    [312, 1],
  ])
    assert.equal(paint(archive, record).glass, null, `${archive}.${record} keeps no glass`);
});

test('the uses carry a record to every climate and season it turns into, the ground aside', () => {
  assert.ok(uses.get('312.3')?.has('window'), 'a building names its window');
  assert.ok(uses.get('313.3')?.has('window'), 'and its winter turn wears it too');
  assert.ok(uses.get('12.3')?.has('window'), 'and its desert turn');
  assert.ok(![...uses.keys()].some((key) => TERRAIN_ARCHIVES.includes(Number(key.split('.')[0]))));
});

test('a set moves to its climate and season as Daggerfall files them', () => {
  assert.equal(climateArchive(312, 0, 'desert', 'summer'), 12);
  assert.equal(climateArchive(12, 0, 'temperate', 'winter'), 313);
  assert.equal(climateArchive(312, 0, 'desert', 'winter'), 12, 'deserts have no winter');
  assert.equal(climateArchive(302, 0, 'swamp', 'rain'), 404);
  assert.equal(climateArchive(374, 3, 'mountain', 'summer'), 374, 'the door-frame tapestry stays');
  assert.equal(climateArchive(341, 0, 'swamp', 'summer'), 341, 'a swamp keeps marble floors');
  assert.equal(climateArchive(509, 0, 'temperate', 'winter'), 509, 'a nature set without winter stays');
  assert.equal(climateArchive(504, 0, 'temperate', 'winter'), 505);
});

test('a record or frame no recipe knows, or the catalog does not hold, paints nothing', () => {
  assert.equal(paintPicture(175, 0, 0, uses), null);
  assert.equal(paintPicture(302, 56, 0, uses), null);
  assert.equal(paintPicture(99999, 0, 0, uses), null);
  assert.equal(paintPicture(87, 0, 4, uses), null, 'the hearth has four frames');
  assert.equal(paintPicture(312, 0, 1, uses), null, 'a still wall has one');
});
