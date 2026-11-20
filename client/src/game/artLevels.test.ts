import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import arts from '../../../content/arts/arts.json' with { type: 'json' };
import type { GearStanding } from '../network/gearMessages.ts';
import {
  GIVES,
  HEALS_A_SECOND,
  LASTING_LIFE,
  LASTING_MORE,
  barWords,
  fragmentWords,
  howHad,
  lastingAt,
  levelOf,
  ownedCount,
  owns,
  powerAt,
  ready,
  scaled,
} from './artLevels.ts';
import { type Art, artOf, coreChoices, fragmentCard, fragmentNumbers, spellCard, spellNumbers } from './artsCards.ts';

const standing = (levels: number[], earned: number[], owned: number[]): GearStanding => ({
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
  assert.match(card.words, /Raise the Art at the Stormcallers' counter, or buy it there from their first rank\.$/);
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
    ['Linked lingers', '2.1 s'],
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
  // With Gale in the Core, Quicken's Haste lasts its seconds more, and Momentum's Crit as long, both by the lasting.
  assert.deepEqual(fragmentNumbers(momentum, 1, [gale]), [['Crit lasts', '5.4 s']]);
  const held = [storm.core.indexOf(momentum), storm.core.indexOf(gale), null];
  assert.deepEqual(fragmentCard(storm, momentum, 0, 1, null, held).rows, [['Crit lasts', '5.4 s']]);
});

/** A spell's card rows at `level` with the fragments named `keys` in its Art's Core. */
const cardRows = (each: Art, spell: string, level: number, keys: readonly string[]) => {
  const found = [each.anima, ...each.tenets].find((one) => one.key === spell);
  assert.ok(found);
  const core = keys.map((key) => each.core.findIndex((fragment) => fragment.key === key));
  return Object.fromEntries(spellCard(each, found, level, core).rows);
};

test('a spell’s card folds in its Core as the room does, agreeing with its fragments’ cards', () => {
  const [storm, divine, shadow] = [art(1), art(2), art(3)];
  const quicken = cardRows(storm, 'quicken', 1, ['gale', 'momentum']);
  assert.deepEqual([quicken['Radius'], quicken['Haste lasts']], ['18 m', '5.4 s']);
  const momentum = storm.core.find((fragment) => fragment.key === 'momentum');
  const gale = storm.core.find((fragment) => fragment.key === 'gale');
  assert.ok(momentum && gale);
  assert.deepEqual(fragmentNumbers(momentum, 1, [gale]), [['Crit lasts', quicken['Haste lasts']]], 'as long as Haste');
  assert.equal(cardRows(storm, 'tempest', 1, ['pursuit'])['Orbs'], '8');
  assert.equal(cardRows(storm, 'arcLash', 1, ['conduction'])['Charges a Minor for'], '1.8 s');
  const sunwell = cardRows(divine, 'sunwell', 1, ['radiance']);
  assert.deepEqual([sunwell['Radius'], sunwell['Lasts']], ['13 m', '9.6 s']);
  const daggers = cardRows(shadow, 'duskDaggers', 1, ['blades']);
  assert.deepEqual([daggers['Radius'], daggers['Lasts']], ['5.5 m', '4.2 s']);
  assert.equal(cardRows(shadow, 'vanish', 1, ['night'])['Veil lasts'], '3.6 s');
  assert.equal(cardRows(shadow, 'duskraven', 5, ['hunger'])['Heals you'], '100% of its damage');
  assert.deepEqual(cardRows(storm, 'quicken', 5, []), Object.fromEntries(spellNumbers(storm.tenets[0] ?? storm.anima)));
});

test('a fragment’s words name the seconds it adds at the level worn, as written at the highest', () => {
  const fragments = arts.arts.flatMap((each) => each.core as readonly { key: string; text: string; moreS?: number }[]);
  const gale = fragments.find((fragment) => fragment.key === 'gale');
  assert.ok(gale);
  assert.equal(fragmentWords(gale, 1), 'Quicken lasts 1.8 s longer and reaches 18 m.');
  for (const fragment of fragments.filter((each) => LASTING_MORE.has(each.key))) {
    assert.equal(fragmentWords(fragment, 5), fragment.text, `${fragment.key} at the highest level`);
    assert.notEqual(fragmentWords(fragment, 1), fragment.text, `${fragment.key}'s words name its seconds`);
  }
  const shadow = art(3);
  const dread = shadow.core.find((fragment) => fragment.key === 'dread');
  assert.ok(dread);
  assert.match(
    fragmentCard(shadow, dread, null, 1).words,
    /^Each Cosmic kill on an Exposed enemy keeps the Duskraven 1\.2 s longer\./,
  );
});

/** What the room measured an Art doing at its first level (crates/room/src/standing_tests.rs writes it). */
interface Measured {
  readonly life: Readonly<Record<string, number>>;
  readonly more: Readonly<Record<string, number>>;
  readonly gives: Readonly<Record<string, number>>;
  readonly healsASecond: Readonly<Record<string, number>>;
  readonly power: number;
}

const measured = async (): Promise<Measured> =>
  JSON.parse(
    await readFile(new URL('../../../target/protocol/art_levels.json', import.meta.url), 'utf8').catch(() => {
      throw new Error('art_levels.json is not written: run `cargo test -p room`');
    }),
  ) as Measured;

const tenth = (value: number) => Math.round(value * 10) / 10;

test('at its first level the screen shows what the room does: the same shares, lives, buffs and healing', async () => {
  const room = await measured();
  assert.equal(tenth(powerAt(1)), tenth(room.power), 'the share of harm and healing');
  const spells = arts.arts.flatMap(
    (each) => [each.anima, ...each.tenets] as readonly { key: string; lifeS?: number }[],
  );
  const fragments = arts.arts.flatMap((each) => each.core as readonly { key: string; moreS?: number }[]);
  assert.deepEqual([...LASTING_LIFE].sort(), Object.keys(room.life).sort(), 'the spells whose life is weighed');
  for (const [key, seconds] of Object.entries(room.life)) {
    const spell = spells.find((each) => each.key === key);
    assert.equal(scaled(key, 'lifeS', spell?.lifeS ?? 0, 1), tenth(seconds), `${key}'s life`);
  }
  assert.deepEqual([...LASTING_MORE].sort(), Object.keys(room.more).sort(), 'the fragments whose seconds are weighed');
  for (const [key, seconds] of Object.entries(room.more)) {
    const fragment = fragments.find((each) => each.key === key);
    assert.equal(scaled(key, 'moreS', fragment?.moreS ?? 0, 1), tenth(seconds), `${key}'s seconds more`);
  }
  assert.deepEqual(Object.keys(GIVES).sort(), Object.keys(room.gives).sort(), 'what spells and fragments give');
  for (const [key, seconds] of Object.entries(room.gives)) {
    assert.equal(tenth((GIVES[key]?.[1] ?? 0) * lastingAt(1)), tenth(seconds), `what ${key} gives`);
  }
  assert.equal(tenth((HEALS_A_SECOND['sunwell'] ?? 0) * powerAt(1)), tenth(room.healsASecond['sunwell'] ?? 0));
});
