import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PassageSeenState } from '../../network/passageMessages.ts';
import type { PassageZone } from '../../rules/passageRules.ts';
import { answerHeard, haulOf, passageWordOf, progressOf } from './passageHeard.ts';

const zone = (extra: Partial<PassageZone> = {}): PassageZone => ({
  number: 4,
  depth: 3,
  lane: 0,
  at: [0, 0],
  ground: { kind: 'under', style: 'chalk' },
  size: 'small',
  deal: 'kindle',
  currents: [],
  name: 'A chalk cut',
  onward: [7, 8],
  lamp: null,
  ...extra,
});
const seen = (extra: Partial<PassageSeenState> = {}): PassageSeenState => ({
  deal: 'kindle',
  done: false,
  lit: 0,
  broken: 0,
  held: 0,
  left: 0,
  wave: 0,
  open: false,
  lampLit: false,
  holding: null,
  ...extra,
});

test('a deal’s progress counts what it asks: dead lamps lit, posts down, waves beaten, a clock left', () => {
  assert.equal(progressOf(zone(), seen({ lit: 0b101 })).count, 2);
  assert.equal(progressOf(zone({ deal: 'sever' }), seen({ broken: 0b111 })).count, 3);
  assert.equal(progressOf(zone({ deal: 'ambush' }), seen({ wave: 2 })).count, 1, 'the second wave still stands');
  assert.equal(progressOf(zone({ deal: 'ambush' }), seen({ wave: 3, done: true })).count, 3);
  assert.equal(progressOf(zone({ deal: 'hold' }), seen({ left: 40 })).seconds, 40);
  assert.deepEqual(progressOf(zone({ deal: 'gauntlet' }), seen({ left: 0 })), {
    done: false,
    count: null,
    seconds: null,
    late: true,
  });
  assert.equal(progressOf(zone({ deal: 'skirmish' }), seen({ done: true })).done, true);
});

test('the room’s word opens every onward mouth together and says the lamp only in a lamp’s zone', () => {
  assert.equal(passageWordOf(zone(), null, null), null, 'none until the room says it');
  const word = passageWordOf(zone(), null, seen({ open: true }));
  assert.deepEqual(word?.openMouths, [0, 1]);
  assert.equal(word?.lampLit, null);
  assert.equal(passageWordOf(zone({ deal: 'lamp', lamp: 2 }), null, seen({ lampLit: true }))?.lampLit, true);
});

test('the haul is said by name: stocks and resources counted, Vestiges counted, the lantern carried', () => {
  const haul = haulOf({
    vestiges: [{ rarity: 3, slot: 0, level: 9 }],
    items: [],
    stocks: [2, 0, 0, 1],
    resources: [0, 3],
    lantern: 'lanternfall',
  });
  assert.equal(haul.vestiges, 1);
  assert.equal(haul.lantern, true);
  assert.deepEqual(
    haul.materials.map((material) => material.count),
    [2, 1, 3],
  );
  assert.equal(haul.materials[0]?.name, 'Weapon Fragments');
  assert.deepEqual(haulOf(undefined), { items: [], vestiges: 0, materials: [], lantern: false });
});

test('an ask of the passages is answered yes by its dive changed, whatever other asks were answered first', () => {
  const asked = { answered: 4, dive: null };
  assert.equal(answerHeard(asked, { answered: 5, answer: 0, dive: null }, false), null, 'another ask’s done');
  assert.equal(
    answerHeard(asked, { answered: 6, answer: 0, dive: { island: 'continent-1', week: 9, zone: 3 } }, false),
    'yes',
  );
  assert.deepEqual(answerHeard(asked, { answered: 5, answer: 177, dive: null }, false), { refused: 177 });
  assert.deepEqual(answerHeard(asked, { answered: 5, answer: 179, dive: null }, false), { refused: 179 }, 'shifted');
  assert.deepEqual(answerHeard(asked, { answered: 5, answer: 181, dive: null }, false), { refused: 181 }, 'fallen');
  assert.equal(answerHeard(asked, { answered: 5, answer: 9, dive: null }, false), null, 'another ask refused');
  assert.equal(answerHeard(asked, { answered: 4, answer: 0, dive: null }, true), 'unanswered');
  const diving = { answered: 4, dive: { island: 'continent-1', week: 9, zone: 3 } };
  const found = { answered: 5, answer: 0, dive: { island: 'continent-1', week: 9, zone: 3 } };
  assert.equal(answerHeard(diving, found, false), null, 'a find in the haul is no way on');
  assert.equal(answerHeard(diving, found, false), null, 'another ask answered done is no Home');
  const homeward = { ...found, dive: { ...found.dive, homeward: true } };
  assert.equal(answerHeard(diving, homeward, false), 'yes', 'a Home turns the dive homeward');
});
