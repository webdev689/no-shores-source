import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PictureUse } from '../textures/picture.ts';
import { levelCount, levelsOf, plainLevels, resampled } from './layerImage.ts';
import {
  COLOUR_LAYERS,
  LAYER_SIZE,
  PICTURE_LAYERS,
  pictureBook,
  type PictureWant,
  terrainArchive,
} from './pictures.ts';

const TEMPERATE = { climate: 'temperate', season: 'summer' } as const;
const want = (archive: number, record: number, weight: number, uses: PictureUse[] = ['wall']): PictureWant => ({
  archive,
  record,
  weight,
  uses: new Set(uses),
});
const noUses = (): PictureUse[] => [];

test("the ground's tiles and the solids' pictures take the first layers, then the most worn pictures", () => {
  const book = pictureBook(TEMPERATE, [want(338, 1, 5), want(312, 3, 50)], [1, 2], noUses);
  const keys = book.pictures.map((picture) => `${picture.archive}.${picture.record}`);
  assert.deepEqual(keys.slice(0, 2), ['302.1', '302.2']);
  assert.ok(keys.indexOf('312.3') < keys.indexOf('338.1'), keys.join(' '));
  assert.equal(book.layerOf(312, 3), keys.indexOf('312.3'));
  assert.equal(book.ground[1], 0);
  assert.equal(book.ground[2], 1);
});

test("a model's picture is turned to the city's climate: a temperate wall in the desert wears the desert set", () => {
  const desert = pictureBook({ climate: 'desert', season: 'summer' }, [want(338, 1, 5)], [2], noUses);
  const layer = desert.layerOf(338, 1);
  assert.equal(desert.pictures[layer].archive, 38);
  assert.equal(terrainArchive({ climate: 'desert', season: 'summer' }), 2);
});

test("a winter city wears each set's snowed turn, its solids' roofs too", () => {
  const winter = { climate: 'mountain', season: 'winter' } as const;
  const book = pictureBook(winter, [want(369, 0, 5, ['roof'])], [2], noUses);
  assert.equal(book.pictures[book.layerOf(369, 0)].archive, 170);
  assert.equal(book.pictures[book.materials.roof].archive % 100, 70, "the solids' slate under snow");
  assert.equal(terrainArchive(winter), 103);
});

test('gold, iron, bone and the glow are plain colours above the pictures', () => {
  const book = pictureBook(TEMPERATE, [], [2], noUses);
  assert.equal(book.materials.gold, COLOUR_LAYERS.gold);
  assert.equal(book.materials.glow, COLOUR_LAYERS.glow);
  assert.ok(book.materials.stone < PICTURE_LAYERS && book.materials.paving < PICTURE_LAYERS);
  assert.ok(Object.values(COLOUR_LAYERS).every((layer) => layer >= PICTURE_LAYERS));
});

test('a city wanting more pictures than the array holds loses only its rarest, which fall back to the first', () => {
  const wants: PictureWant[] = [];
  for (let archive = 500; archive <= 511; archive++)
    for (let record = 0; record < 32; record++) wants.push(want(archive, record, 10_000 - wants.length, ['prop']));
  const book = pictureBook(TEMPERATE, wants, [2], noUses);
  assert.equal(book.pictures.length, PICTURE_LAYERS);
  assert.equal(
    new Set(book.pictures.map((picture) => `${picture.archive}.${picture.record}.${picture.tint}`)).size,
    PICTURE_LAYERS,
  );
  assert.equal(book.pictures[book.layerOf(506, 0)].archive, 506, 'the most worn is kept');
  assert.equal(book.layerOf(511, 31), 0, 'the rarest falls back');
});

test('a picture until painted is its guessed colour at every level', () => {
  const book = pictureBook(TEMPERATE, [want(369, 2, 5, ['roof'])], [0, 1, 2, 3], noUses);
  const roof = book.pictures[book.layerOf(369, 2)];
  assert.ok(roof.guess[0] > roof.guess[2], 'a roof is guessed warm');
  const levels = plainLevels(roof.guess);
  assert.equal(levels.length, levelCount());
  assert.equal(levels[levels.length - 1].length, 4);
});

test('a picture is resampled square texel for texel and halved down to one texel, each level the mean below it', () => {
  // a 2 x 4 picture: its top half white, its bottom half black
  const rgba = new Uint8Array(2 * 4 * 4);
  for (let texel = 0; texel < 4; texel++) rgba.set([255, 255, 255, 255], texel * 4);
  for (let texel = 4; texel < 8; texel++) rgba.set([0, 0, 0, 255], texel * 4);
  const square = resampled(rgba, 2, 4, 8);
  assert.equal(square[0], 255, 'the top row stays at the top');
  assert.equal(square[(7 * 8 + 7) * 4], 0);
  const levels = levelsOf(square, 8);
  assert.deepEqual(
    levels.map((level) => Math.sqrt(level.length / 4)),
    [8, 4, 2, 1],
  );
  assert.equal(levels[3][0], 128, "the last level is the whole picture's mean");
  assert.equal(levelCount(LAYER_SIZE), Math.log2(LAYER_SIZE) + 1);
});

test('a chalk picture is in the book only for a city that plans chalk solids', () => {
  const stoneLayers = (book: ReturnType<typeof pictureBook>) =>
    book.pictures.filter((picture) => picture.archive === 302 && picture.record === 3).length;
  const without = pictureBook(TEMPERATE, [], [2], noUses);
  const chalky = pictureBook(TEMPERATE, [], [2], noUses, true);
  assert.equal(stoneLayers(chalky), stoneLayers(without) + 1);
  assert.equal(without.materials.chalk, without.materials.rubble, 'with none planned it falls back to rubble');
  assert.notEqual(chalky.materials.chalk, chalky.materials.rubble);
});
