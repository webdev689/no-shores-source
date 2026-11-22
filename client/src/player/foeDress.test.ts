import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { CLOTHING_DYES } from '../forge/dyes.ts';
import { factionsOf, rankChoices, rosterOf, shownType } from '../rules/roster.ts';
import { foeDress, officerDress } from './foeDress.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const roster = rosterOf(
  new WebAssembly.Module(
    await readFile(MODULE).catch(() => {
      throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
    }),
  ),
);

test("every type in the rules' roster is dressed, holding the roster's own weapons drawn, in the forge's dyes", () => {
  assert.equal(roster.length, 45);
  for (const type of roster) {
    const dress = foeDress(type);
    assert.ok(dress, `${type.name} is dressed`);
    // The Lattice (faction 3) wear their own crystal layers in place of the roster's weapons (lattice.test.ts).
    if (type.faction === 3) continue;
    assert.deepEqual([dress.outfit.right, dress.outfit.left, dress.outfit.drawn], [type.right, type.left, true]);
    assert.deepEqual(
      Object.keys(dress.outfit.dyes),
      [...dress.outfit.garments],
      `${type.name}: a dye for each garment`,
    );
    for (const dye of Object.values(dress.outfit.dyes))
      assert.ok(
        CLOTHING_DYES.some((known) => known === dye),
        dye,
      );
  }
});

test('the Grey Tithe wear grey cloth', () => {
  for (const type of roster.filter((each) => each.factionName === 'The Grey Tithe'))
    assert.ok(Object.values(foeDress(type)?.outfit.dyes ?? {}).includes('Grey'), type.name);
});

test('the panel offers a faction, then only the ranks its chosen type comes in', () => {
  assert.deepEqual(factionsOf(roster), [
    [1, 'The Grey Tithe'],
    [3, 'The Lattice'],
  ]);
  const ranksOf = (name: string) => {
    const type = roster.find((each) => each.name === name);
    assert.ok(type, name);
    return rankChoices(type);
  };
  assert.deepEqual(ranksOf('Collector'), [
    ['1', 'Minor'],
    ['2', 'Major'],
  ]);
  assert.deepEqual(ranksOf('Enforcer'), [
    ['2', 'Major'],
    ['3', 'Elite'],
  ]);
  assert.deepEqual(ranksOf('Marksman'), [['3', 'Elite']]);
  assert.deepEqual(ranksOf('Captain Brannoc Thule'), [['5', 'Boss']]);
  assert.deepEqual(ranksOf('High Assessor Corvane'), [['5', 'Boss']]);
});

test('a foe from an older room, sent with no type, is shown as the crew’s type in its role', () => {
  assert.deepEqual(
    [1, 3, 5].map((kind) => shownType(roster, { type: 0, kind })?.type),
    [13, 15, 17],
    'the crew’s Skirmisher, Brute and Captain',
  );
  assert.equal(shownType(roster, { type: 4, kind: 3 })?.name, 'Enforcer', 'a type sent is its own');
  assert.equal(shownType(roster, { type: 0, kind: 0 }), undefined);
});

test('each post ashore wears its own clothes, so a Gunner and a Lookout fighting as one type never look alike', () => {
  const archer = roster.find((type) => type.name === 'Archer');
  assert.ok(archer);
  const posts = [0, 1, 2, 3, 4].map((post) => officerDress(archer, post));
  const looks = posts.map((dress, post) => {
    assert.ok(dress, `post ${post} is dressed`);
    assert.deepEqual([dress.outfit.right, dress.outfit.left, dress.outfit.drawn], [archer.right, archer.left, true]);
    assert.deepEqual(
      Object.keys(dress.outfit.dyes),
      [...dress.outfit.garments],
      `post ${post}: a dye for each garment`,
    );
    for (const dye of Object.values(dress.outfit.dyes))
      assert.ok(
        CLOTHING_DYES.some((known) => known === dye),
        dye,
      );
    assert.ok(Object.values(dress.outfit.dyes).includes('Blue'), `post ${post} wears the crew's blue`);
    return JSON.stringify([dress.body, dress.tone, dress.outfit.armour, dress.outfit.dyes, dress.outfit.hair]);
  });
  assert.equal(new Set(looks).size, 5, 'no two posts alike');
  assert.notEqual(looks[1], looks[4], 'the Gunner and the Lookout apart');
  assert.equal(officerDress(archer, 5), null, 'no post past the Lookout');
});
