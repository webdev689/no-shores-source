import assert from 'node:assert/strict';
import { test } from 'node:test';
import arts from '../../../content/arts/arts.json' with { type: 'json' };
import {
  ARTS,
  abilityPictures,
  artOf,
  coreChoices,
  coreOf,
  coresOf,
  fragmentCard,
  gearAskOf,
  keyOf,
  rechargeWords,
  spellCard,
  spellNumbers,
  spellSvg,
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
      assert.equal(card.big?.value, rechargeWords(wanted[place]?.rechargeS ?? 0), 'its recharge leads the card');
      assert.equal(card.big?.label, 'Recharge');
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
    ['R', 'Q', 'G'],
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

test('a recharge reads in seconds under a minute, else in minutes and seconds', () => {
  assert.equal(rechargeWords(38), '38 s');
  assert.equal(rechargeWords(59), '59 s');
  assert.equal(rechargeWords(60), '1:00');
  assert.equal(rechargeWords(91), '1:31');
  assert.equal(rechargeWords(500), '8:20');
});

test('a Core the room has not sent is three empty slots', () => {
  assert.deepEqual(coreOf({}, 2), [null, null, null]);
  assert.deepEqual(coreOf({ 2: [4] }, 2), [4, null, null]);
});

test('the HUD is given each Art’s Anima, its outline, and its Tenets as pictures, and none for no Art', () => {
  for (const art of ARTS) {
    const pictures = abilityPictures(art.id);
    assert.equal(pictures?.anima, spellSvg(art, art.anima), 'the Anima as the Art’s screen shows it');
    assert.match(pictures?.animaOutline ?? '', /viewBox="0 0 24 24"/);
    assert.ok((pictures?.animaOutline.length ?? 0) < (pictures?.anima.length ?? 0), 'its outline alone');
    assert.equal(pictures?.tenets.length, 2);
    for (const tenet of pictures?.tenets ?? []) assert.match(tenet, /viewBox="0 0 12 12"/);
  }
  assert.equal(abilityPictures(0), null);
});

test('the room’s word on the Arts reads as each Art’s Core by its id, and the screen’s asks go as the room numbers them', () => {
  const cores = coresOf({
    art: 3,
    cores: [
      [4, null, null],
      [null, null, null],
      [0, 2, null],
    ],
    anima: 0,
    tenets: [1, 1],
  });
  assert.deepEqual(
    [coreOf(cores, 1), coreOf(cores, 3)],
    [
      [4, null, null],
      [0, 2, null],
    ],
  );
  assert.deepEqual(gearAskOf({ kind: 'wearArt', art: 2 }), { kind: 40, column: 2 });
  assert.deepEqual(gearAskOf({ kind: 'setCore', art: 3, slot: 1, fragment: 5 }), {
    kind: 41,
    column: 3,
    slot: 1,
    node: 5,
  });
});
