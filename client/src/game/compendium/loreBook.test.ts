import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MOTIFS } from '../emblemMotifs.ts';
import { LORE, chapterAt, chaptersOf, paragraphsOf, shelfOf } from './loreBook.ts';
import { SAMPLE_LORE } from './loreForTests.ts';

test("the lore's file holds what the page shows: names, covers in a cloth and a motif drawn, titles and words", () => {
  const keys = (object: object) => Object.keys(object).sort();
  for (const category of LORE.categories) {
    assert.deepEqual(keys(category), ['id', 'motif', 'name'], `${category.id}'s keys`);
    assert.ok(category.name.trim() && MOTIFS[category.motif], `${category.id}: a name and a motif drawn`);
  }
  for (const book of LORE.books) {
    assert.deepEqual(keys(book), ['category', 'chapters', 'cover', 'id', 'name'], `${book.id}'s keys`);
    assert.ok(book.name.trim(), `${book.id} is named`);
    assert.match(book.cover.colour, /^#[0-9a-f]{6}$/i, `${book.id}'s cloth`);
    assert.ok(MOTIFS[book.cover.motif], `${book.id}'s motif is drawn`);
    for (const chapter of book.chapters) {
      assert.deepEqual(keys(chapter), ['found', 'id', 'text', 'title'], `${book.id}/${chapter.id}'s keys`);
      assert.ok(chapter.title.trim() && paragraphsOf(chapter.text).length > 0, `${book.id}/${chapter.id} has words`);
      assert.ok(
        ['story', 'quest', 'place'].includes(chapter.found.kind),
        `${book.id}/${chapter.id} is found somewhere`,
      );
    }
  }
});

test('chapters are numbered book by book in the file’s order, as the wire numbers them', () => {
  assert.deepEqual(
    chaptersOf(SAMPLE_LORE).map(({ book, chapter }) => `${book.id}/${chapter.id}`),
    ['bell/first', 'bell/second', 'bell/third', 'keeper/door', 'lamp/lit', 'lamp/out'],
  );
  assert.equal(chapterAt(3, SAMPLE_LORE)?.chapter.title, 'The Door');
  assert.equal(chapterAt(6, SAMPLE_LORE), null, 'past the last');
});

test('the shelf counts what is found of each book and category, and what found waits unread', () => {
  const read = new Set(['bell/first']);
  const [drowned, lamps] = shelfOf([0, 2, 4], (key) => read.has(key), SAMPLE_LORE);
  assert.deepEqual([drowned?.found, drowned?.total, drowned?.unread], [2, 4, true], 'the third chapter is unread');
  assert.deepEqual([lamps?.found, lamps?.total, lamps?.unread], [1, 2, true]);
  const [bell, keeper] = drowned?.books ?? [];
  assert.deepEqual(
    bell?.chapters.map((chapter) => [chapter.found, chapter.read]),
    [
      [true, true],
      [false, false],
      [true, false],
    ],
  );
  assert.deepEqual([keeper?.found, keeper?.unread], [0, false], 'nothing of it found');
  const allRead = shelfOf([0], () => true, SAMPLE_LORE);
  assert.equal(allRead[0]?.unread, false);
  assert.deepEqual(
    shelfOf([99], () => false, SAMPLE_LORE).map((category) => category.found),
    [0, 0],
    'a number the file does not hold is none',
  );
});

test("a chapter's words are its paragraphs, apart at each blank line, each paragraph's lines run together", () => {
  assert.deepEqual(paragraphsOf('The bell rang once.\n\nThen the sea came in,\nslow and grey.\n\n\n'), [
    'The bell rang once.',
    'Then the sea came in, slow and grey.',
  ]);
});
