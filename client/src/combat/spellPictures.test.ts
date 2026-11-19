import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SIGIL_CELLS,
  SIGIL_RELEASED,
  afterimageSprite,
  flameSprite,
  impactSprite,
  reticleSprite,
  sigilSprite,
  sigilState,
} from './spellPictures.ts';
import { BODY, CLEAR, DARK, HOT, LIGHT, type Sprite, orbSprite, stopOf } from './spellPixels.ts';

const count = (picture: Sprite, stop: number) => picture.cells.filter((cell) => cell === stop).length;
const middle = (picture: Sprite) => stopOf(picture, (picture.width - 1) / 2, (picture.height - 1) / 2);

test('an impact is a white-hot star, then a ring of light, then a broken ring of the body, then nothing', () => {
  const [star, ring, broken] = [impactSprite(0), impactSprite(1), impactSprite(2)];
  if (!star || !ring || !broken) throw new Error('three frames');
  assert.equal(middle(star), HOT);
  assert.equal(middle(ring), CLEAR, 'a ring is hollow');
  assert.ok(count(ring, LIGHT) > 0 && count(broken, BODY) > 0);
  assert.ok(count(broken, BODY) < count(ring, LIGHT) * 1.3, 'the last broken into pieces');
  assert.equal(impactSprite(3), null);
  assert.equal(impactSprite(0), star, 'made once');
});

test("a flame's burst burns white-hot at its roots first, then thins and cools", () => {
  assert.ok(count(flameSprite(0), HOT) > 0);
  assert.equal(count(flameSprite(3), HOT), 0);
  const lit = (picture: Sprite) => picture.cells.filter((cell) => cell !== CLEAR).length;
  assert.ok(lit(flameSprite(3)) < lit(flameSprite(1)), 'it thins as it dies');
});

test("a bolt's mark is a diamond broken at its corners, blinking between light and white-hot", () => {
  const [one, two] = [reticleSprite(0), reticleSprite(1)];
  assert.equal(stopOf(one, 5, 0), CLEAR, 'broken at its corners');
  assert.notDeepEqual(one.cells, two.cells);
  assert.equal(reticleSprite(2), one);
});

test("an orb's afterimage is the orb on every other row, no brighter than its body", () => {
  const [orb, after] = [orbSprite(3), afterimageSprite(3)];
  assert.ok(after.cells.every((cell) => cell <= BODY));
  for (let column = 0; column < orb.width; column++) assert.equal(stopOf(after, column, 9), CLEAR);
  assert.ok(count(after, BODY) + count(after, DARK) > 0);
});

test("a sigil's rings light from the outside in as its cast charges, then all of it flares, cools and goes", () => {
  assert.deepEqual(
    [0, 5, 10, 15, 17].map((ticks) => sigilState(ticks, 18, null)),
    [1, 2, 3, 4, 4],
  );
  assert.equal(sigilState(0, 18, 0), SIGIL_RELEASED);
  assert.equal(sigilState(0, 18, 1), SIGIL_RELEASED, 'the release holds two frames');
  assert.ok((sigilState(0, 18, 6) ?? 0) > SIGIL_RELEASED);
  assert.equal(sigilState(0, 18, 40), null, 'gone');
  const edge = (art: number, state: number) => stopOf(sigilSprite(art, state), (SIGIL_CELLS - 1) / 2 + 30, 31);
  assert.equal(edge(1, 1), HOT, 'the outer ring lit first, white-hot');
  assert.equal(edge(1, 2), LIGHT, 'then light as the next lights');
  const inner = (state: number) => stopOf(sigilSprite(2, state), (SIGIL_CELLS - 1) / 2 + 9, 31);
  assert.equal(inner(1), DARK, 'the inner ring waits dark');
  assert.equal(inner(4), HOT);
  assert.equal(edge(3, SIGIL_RELEASED), HOT);
});

test("each Art's sigil holds its own figure", () => {
  const [storm, divine, shadow] = [1, 2, 3].map((art) => sigilSprite(art, 4).cells.join(','));
  assert.notEqual(storm, divine);
  assert.notEqual(divine, shadow);
  assert.equal(stopOf(sigilSprite(2, 4), 31, 31), LIGHT, "Divine's sun at its heart");
  assert.equal(stopOf(sigilSprite(1, 4), 31, 31), CLEAR, "Storm's spokes leave its heart open");
});
