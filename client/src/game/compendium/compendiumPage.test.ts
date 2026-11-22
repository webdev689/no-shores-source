import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GearState } from '../../network/gearMessages.ts';
import type { Node } from '../../ui/node.ts';
import type { UiEvent } from '../../ui/ui.ts';
import { byId, fakeInterface, nodesOf, wordsIn } from '../../ui/uiForTests.ts';
import { sizesOf } from '../gearNodes.ts';
import { Compendium, LORE_BACK, NO_LORE, UNFOUND_CHAPTER, bookId, categoryId, chapterId } from './compendiumPage.ts';
import { Lore } from './lore.ts';
import type { LoreFile } from './loreBook.ts';
import { SAMPLE_LORE, storage } from './loreForTests.ts';

/** The Compendium drawn frame by frame in the menu's window, the player having found `found`: the last tree built, a
 *  step of frames hearing `events`, and a click on what an id names. */
function compendiumOf(found: readonly number[], lore: LoreFile = SAMPLE_LORE, width = 1280) {
  const { ui, step } = fakeInterface(width, 900);
  const kept = { lore: found } as unknown as GearState;
  const read = new Lore(
    storage(),
    () => 'arlo-fan',
    () => 0,
    lore,
  );
  const compendium = new Compendium({ kept: () => kept }, read);
  const sizes = sizesOf(width, 900, 1);
  let built: Node = {};
  const page = () => compendium.page({ ui, sizes, room: { width: width - 120, height: 700 }, holds: null as never });
  const tree = (): Node => ({
    width: 'grow',
    height: 'grow',
    children: [{ role: 'window', solid: true, width, height: 900, float: { to: 'screen', z: 20 }, children: [page()] }],
  });
  const frame = (events: UiEvent[] = []) => step(() => (built = tree()), events);
  const click = (id: string) => {
    const box = ui.boxOf(id);
    assert.ok(box, `${id} is laid`);
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
    frame([
      { kind: 'pointer', x, y },
      { kind: 'down', x, y, button: 0 },
      { kind: 'up', x, y, button: 0 },
    ]);
    frame();
  };
  frame();
  frame();
  return { ui, compendium, read, frame, click, tree: () => built };
}

const pressable = (tree: Node, id: string) => {
  const node = byId(tree, id);
  return node?.press === true && node.disabled !== true;
};

test('with no lore in the game the Compendium says so plainly, under LORE', () => {
  const { tree, ui } = compendiumOf([], { categories: [], books: [] });
  const said = wordsIn(tree());
  assert.ok(said.includes('LORE'));
  assert.ok(said.includes(NO_LORE));
  assert.equal(ui.boxOf(categoryId('drowned')), null, 'no tile');
});

test("its front is a tile for each category, with its name, how much of it is found, and Destiny's diamond while one waits unread", () => {
  const { tree } = compendiumOf([0, 2, 4]);
  const said = wordsIn(tree());
  for (const words of ['LORE', '3/6', 'The Drowned Coast', '2/4', 'The Lamps', '1/2'])
    assert.ok(said.includes(words), words);
  const tile = byId(tree(), categoryId('drowned'));
  assert.match(tile?.label ?? '', /2 of 4 found, new$/);
  assert.ok(
    nodesOf(tile).some((node) => node.picture?.key === 'lore new'),
    'its diamond',
  );
});

test('a category opens at its first book with a chapter unread, at that chapter, read as it shows', () => {
  const { tree, click, read, frame } = compendiumOf([0, 2, 4]);
  click(categoryId('drowned'));
  const said = wordsIn(tree());
  for (const words of ['THE DROWNED COAST', 'The Drowned Bell', '2/3', 'It Rang Once', 'The bell rang once.'])
    assert.ok(said.includes(words), words);
  assert.ok(said.includes('Then the sea came in,\nslow and grey.'), 'its second paragraph, its lines kept');
  assert.ok(pressable(tree(), bookId('bell')), 'a book found is pressed');
  assert.ok(!pressable(tree(), bookId('keeper')), 'one not found is not');
  assert.ok(read.isRead('bell/first'), 'read as it shows');
  frame();
  assert.ok(
    !nodesOf(byId(tree(), chapterId(0))).some((node) => node.picture?.key === 'lore new'),
    'its diamond gone once read',
  );
  assert.ok(
    pressable(tree(), chapterId(2)) && !pressable(tree(), chapterId(1)),
    'chapters found pressed, the rest dim',
  );
});

test("a chapter's number shows it; one not found shows nothing of it; Escape steps back to the front", () => {
  const { tree, click, compendium, frame, ui } = compendiumOf([0, 2, 4]);
  click(categoryId('drowned'));
  click(chapterId(2));
  assert.ok(wordsIn(tree()).includes('The Diver'));
  assert.ok(wordsIn(tree()).includes('No one dives for it.'));
  assert.ok(!wordsIn(tree()).includes('Under the Water'), 'a chapter not found keeps its title');
  assert.ok(compendium.back(), 'it stepped');
  frame();
  frame();
  assert.ok(wordsIn(tree()).includes('The Lamps'), 'the front again');
  assert.equal(ui.boxOf(LORE_BACK), null);
  assert.equal(compendium.back(), false, 'the front takes no step');
});

test('a category of books none found shows them as stone, and says its chapter is not found', () => {
  const { tree, click } = compendiumOf([4]);
  click(categoryId('drowned'));
  const said = wordsIn(tree());
  assert.ok(said.includes('0/4'));
  assert.ok(said.includes('Undiscovered'), 'the book chosen, not found');
  assert.ok(!said.includes('The Drowned Bell') && !said.includes(UNFOUND_CHAPTER));
  click(LORE_BACK);
  assert.ok(wordsIn(tree()).includes('The Lamps'), 'back by its press');
});

test('on a narrow menu the book chosen is named over its chapter rather than drawn large, so all stays in view', () => {
  const { tree, click, ui } = compendiumOf([0, 2, 4], SAMPLE_LORE, 760);
  assert.ok(ui.boxOf(categoryId('lamps')));
  click(categoryId('drowned'));
  const [books, reading, numbers] = [ui.boxOf('lore-books'), ui.boxOf('lore-reading'), ui.boxOf('lore-chapters')];
  assert.ok(books && reading && numbers);
  assert.ok(
    reading.x >= books.x + books.width && reading.x + reading.width <= 760,
    'beside the books, within the view',
  );
  assert.ok(numbers.y + numbers.height <= 900, 'its chapters’ numbers in view');
  const said = wordsIn(tree());
  assert.ok(said.includes('The Drowned Bell') && said.includes('It Rang Once'));
  const covers = nodesOf(tree()).filter((node) => node.picture?.key === 'lore cover bell true');
  assert.equal(covers.length, 1, 'its cover in the list alone');
});

test('a category with nothing found gives the focus to the way back; a chapter shown reads whole to a screen reader', () => {
  const bare = compendiumOf([4]);
  bare.click(categoryId('drowned'));
  assert.ok(bare.ui.focused(LORE_BACK), 'not a stone cover, which takes no press');
  const { tree, click } = compendiumOf([0, 2, 4]);
  click(categoryId('drowned'));
  const reading = byId(tree(), 'lore-reading');
  assert.equal(reading?.focusable, true);
  assert.equal(reading?.label, 'It Rang Once. The bell rang once. Then the sea came in, slow and grey.');
});
