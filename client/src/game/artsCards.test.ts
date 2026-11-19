import assert from 'node:assert/strict';
import { test } from 'node:test';
import arts from '../../../content/arts/arts.json' with { type: 'json' };
import {
  ARTS,
  abilityPictures,
  artOf,
  coreChoices,
  coreOf,
  fragmentCard,
  keyOf,
  spellCard,
  spellNumbers,
} from './artsCards.ts';

const storm = () => {
  const found = artOf(1);
  assert.ok(found);
  return found;
};

test('each Art has its three spells and six fragments, named and worded as the Arts’ file says', () => {
  assert.deepEqual(
    ARTS.map((art) => art.name),
    ['Storm', 'Divine', 'Shadow'],
  );
  for (const [index, art] of ARTS.entries()) {
    const file = arts.arts[index];
    assert.ok(file);
    const spells = [art.anima, ...art.tenets];
    assert.equal(spells.length, 3);
    const wanted = [file.anima, ...file.tenets];
    for (const [place, spell] of spells.entries()) {
      const card = spellCard(art, spell);
      assert.equal(card.name, wanted[place]?.name);
      assert.equal(card.words, wanted[place]?.text);
      assert.equal(card.element, file.element);
      assert.equal(card.big?.value, wanted[place]?.rechargeS, 'its recharge leads the card');
      assert.equal(card.kind, place === 0 ? 'Anima' : 'Tenet');
    }
    assert.equal(art.core.length, 6);
    for (const [place, fragment] of art.core.entries()) {
      const card = fragmentCard(art, fragment);
      assert.equal(card.name, file.core[place]?.name);
      assert.equal(card.words, file.core[place]?.text);
    }
  }
});

test('a spell’s card lists its numbers with their units, and each spell its key', () => {
  const art = storm();
  assert.deepEqual(spellNumbers(art.anima), [
    ['Damage', '18'],
    ['Orbs', '6'],
    ['Reach', '30 m'],
    ['Speed', '14 m/s'],
    ['Lasts', '4 s'],
  ]);
  const raven = artOf(3)?.anima;
  assert.ok(raven);
  assert.ok(spellNumbers(raven).some(([label, value]) => label === 'Heals you' && value === '50% of its damage'));
  assert.deepEqual(
    [art.anima, ...art.tenets].map((spell) => keyOf(art, spell)),
    ['F', 'Q', 'C'],
  );
});

test('the Core’s flyout refuses a fragment already set in another slot', () => {
  const art = storm();
  const core = coreOf({ 1: [2, null, 5] }, 1);
  assert.deepEqual(core, [2, null, 5]);
  const choices = coreChoices(art, core, 1);
  assert.equal(choices.length, 6);
  const momentum = choices[2];
  assert.equal(momentum?.setIn, 0);
  assert.equal(momentum?.ask, null, 'set in slot 1, it cannot go in slot 2 as well');
  assert.equal(choices[5]?.ask, null);
  assert.deepEqual(choices[0]?.ask, { kind: 'setCore', art: 1, slot: 1, fragment: 0 });
  assert.ok(momentum);
  assert.match(fragmentCard(art, momentum.fragment, momentum.setIn).words, /Set in Core slot 1\.$/);
  // The fragment already in the slot asks nothing again.
  assert.equal(coreChoices(art, core, 0)[2]?.ask, null);
});

test('a Core the room has not sent is three empty slots', () => {
  assert.deepEqual(coreOf({}, 2), [null, null, null]);
  assert.deepEqual(coreOf({ 2: [4] }, 2), [4, null, null]);
});

test('the HUD is given each Art’s diamond and Tenets as pictures, and none for no Art', () => {
  for (const art of ARTS) {
    const pictures = abilityPictures(art.id);
    assert.match(pictures?.diamond ?? '', /viewBox="0 0 24 24"/);
    assert.equal(pictures?.tenets.length, 2);
    for (const tenet of pictures?.tenets ?? []) assert.match(tenet, /viewBox="0 0 12 12"/);
  }
  assert.equal(abilityPictures(0), null);
});
