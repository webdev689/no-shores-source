import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import arts from '../../../content/arts/arts.json' with { type: 'json' };
import type { Standing } from '../network/gearMessages.ts';
import {
  GIVES,
  HEALS_A_SECOND,
  LASTING_LIFE,
  LASTING_MORE,
  barWords,
  howHad,
  levelOf,
  ownedCount,
  owns,
  powerAt,
  ready,
} from './artLevels.ts';
import { artOf, coreChoices, fragmentCard, fragmentNumbers, spellNumbers } from './artsCards.ts';

const standing = (levels: number[], earned: number[], owned: number[]): Standing => ({
  pledge: 0,
  reputation: [0, 0, 0],
  packages: [0, 0, 0],
  artLevels: levels,
  artXp: earned,
  artOwned: owned,
});
const art = (id: number) => {
  const found = artOf(id);
  assert.ok(found);
  return found;
};

test('the bar reads empty at level 1, part full, ready to rise at its faction, and at the highest level', () => {
  const empty = levelOf(standing([1, 1, 1], [0, 0, 0], [0, 0, 0]), 1);
  assert.deepEqual(empty, { level: 1, xp: 0, bar: 8000, owned: 0 });
  assert.equal(barWords(empty, 1), '0 of 8,000');
  const part = levelOf(standing([2, 1, 1], [3200, 0, 0], [0, 0, 0]), 1);
  assert.equal(barWords(part, 1), '3,200 of 16,000');
  assert.equal(ready(part), false);
  const full = levelOf(standing([1, 1, 1], [0, 0, 8000], [0, 0, 0]), 3);
  assert.equal(ready(full), true);
  assert.equal(barWords(full, 3), "Ready to rise at the Veiled's counter");
  assert.equal(
    barWords(levelOf(standing([1, 1, 1], [0, 8000, 0], [0, 0, 0]), 2), 2),
    "Ready to rise at the Lamplighters' counter",
  );
  const most = levelOf(standing([5, 1, 1], [0, 0, 0], [0, 0, 0]), 1);
  assert.equal(most.bar, 0);
  assert.equal(ready(most), false);
  assert.equal(barWords(most, 1), 'Highest level');
  assert.equal(powerAt(2), 0.7);
});

test('until the room says, an Art is level 1 and locks no fragment', () => {
  const unknown = levelOf(undefined, 2);
  assert.equal(unknown.level, 1);
  assert.equal(ownedCount(unknown), 6);
});

test('the Core counts and locks the fragments not owned, and refuses them before any ask', () => {
  const stand = levelOf(standing([1, 1, 1], [0, 0, 0], [0b000101, 0, 0]), 1);
  assert.equal(ownedCount(stand), 2);
  assert.deepEqual(
    [0, 1, 2].map((fragment) => owns(stand, fragment)),
    [true, false, true],
  );
  const choices = coreChoices(art(1), [null, null, null], 0, (fragment) => owns(stand, fragment));
  assert.deepEqual(
    choices.map((choice) => [choice.owned, choice.ask !== null]),
    [
      [true, true],
      [false, false],
      [true, true],
      [false, false],
      [false, false],
      [false, false],
    ],
  );
  const conduction = art(1).core[1];
  assert.ok(conduction);
  const card = fragmentCard(art(1), conduction, null, 1, howHad(1));
  assert.equal(card.kind, 'Storm fragment, not owned');
  assert.match(card.words, /Rise the Art at the Stormcallers' counter, or buy it there from their first rank\.$/);
});

test('a spell’s numbers at each level are scaled as the room scales them, the rest as written', () => {
  const storm = art(1);
  assert.deepEqual(spellNumbers(storm.anima, 1), [
    ['Damage', '10.8'],
    ['Orbs', '6'],
    ['Reach', '30 m'],
    ['Speed', '14 m/s'],
    ['Lasts', '4 s'],
  ]);
  const [quicken] = storm.tenets;
  assert.ok(quicken);
  assert.deepEqual(spellNumbers(quicken, 3), [
    ['Radius', '12 m'],
    ['Haste lasts', '4.8 s'],
  ]);
  const divine = art(2);
  assert.deepEqual(spellNumbers(divine.anima, 2), [
    ['Radius', '10 m'],
    ['Lasts', '8.4 s'],
    ['Heals a second', '3.5'],
  ]);
  assert.deepEqual(spellNumbers(divine.tenets[0] ?? divine.anima, 4), [['Heals', '36']]);
  const shadow = art(3);
  const raven = spellNumbers(shadow.anima, 1);
  assert.ok(raven.some(([label, value]) => label === 'Damage' && value === '4.2'));
  assert.ok(raven.some(([label, value]) => label === 'Lasts' && value === '7.2 s'));
  assert.ok(raven.some(([label, value]) => label === 'Heals you' && value === '50% of its damage'));
  assert.deepEqual(spellNumbers(shadow.tenets[1] ?? shadow.anima, 1), [
    ['Roll', '3 m'],
    ['Veil lasts', '2.4 s'],
  ]);
  for (const each of [storm, divine, shadow])
    for (const spell of [each.anima, ...each.tenets]) assert.deepEqual(spellNumbers(spell, 5), spellNumbers(spell));
  const gale = storm.core.find((fragment) => fragment.key === 'gale');
  assert.ok(gale);
  assert.deepEqual(fragmentNumbers(gale, 1), [['Longer by', '1.8 s']]);
  assert.deepEqual(fragmentNumbers(gale, 5), []);
  const momentum = storm.core.find((fragment) => fragment.key === 'momentum');
  assert.ok(momentum);
  assert.deepEqual(fragmentNumbers(momentum, 1), [['Crit lasts', '3.6 s']]);
});

/** One spell's arm of the room's casting, from its key to the next. */
function armOf(source: string, key: string): string {
  const start = source.indexOf(`"${key}" =>`);
  assert.ok(start >= 0, `the room casts ${key}`);
  const next = source.slice(start + key.length + 4).search(/\n\s+"\w+" =>|\n\s+_ =>/);
  return source.slice(start, start + key.length + 4 + next);
}

test('the screen scales exactly what the room scales, and the buffs last what combat gives them', () => {
  const spells = readFileSync(new URL('../../../crates/room/src/spells.rs', import.meta.url), 'utf8');
  for (const each of arts.arts)
    for (const spell of [each.anima, ...each.tenets]) {
      const arm = armOf(spells, spell.key);
      assert.equal(/last\(ticks\(def\.life_s/.test(arm), LASTING_LIFE.has(spell.key), `${spell.key}'s life`);
    }
  // A fragment's seconds more are scaled when they are added inside the lasting's `last(...)`; Dread's are not.
  for (const key of [...LASTING_MORE, 'dread'])
    assert.equal(new RegExp(`last\\([^;]*\\b${key}\\b`).test(spells), LASTING_MORE.has(key), `${key}'s seconds`);
  assert.match(armOf(spells, 'quicken'), /last\(Status::Haste\.ticks\(\)/);
  assert.match(armOf(spells, 'mend'), /last\(Status::Crit\.ticks\(\)\)/);
  assert.match(armOf(spells, 'vanish'), /last\(Status::Veiled\.ticks\(\)/);
  assert.match(armOf(spells, 'mend'), /def\.heal \* power/);
  assert.match(spells, /let damage = damage \* found\.character\.spell_shares\(\)\.0/);
  const status = readFileSync(new URL('../../../crates/combat/src/status.rs', import.meta.url), 'utf8');
  const seconds = (name: string) => Number(new RegExp(`${name}_TICKS: u32 = (\\d+)`).exec(status)?.[1]) / 60;
  assert.equal(GIVES['quicken']?.[1], seconds('HASTE'));
  assert.equal(GIVES['momentum']?.[1], seconds('HASTE'), 'Momentum’s Crit lasts as long as Quicken’s Haste');
  assert.equal(GIVES['resolve']?.[1], seconds('CRIT'));
  assert.equal(GIVES['vanish']?.[1], seconds('VEILED'));
  assert.equal(HEALS_A_SECOND['sunwell'], Number(/LINKED_HEAL: f64 = ([\d.]+)/.exec(status)?.[1]));
});
