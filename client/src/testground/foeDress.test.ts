import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { CLOTHING_DYES } from '../forge/dyes.ts';
import { factionsOf, rankChoices, rosterOf } from '../rules/roster.ts';
import { foeDress } from './foeDress.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const roster = rosterOf(
  new WebAssembly.Module(
    await readFile(MODULE).catch(() => {
      throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
    }),
  ),
);

test("every type in the rules' roster is dressed, holding the roster's own weapons drawn, in the forge's dyes", () => {
  assert.equal(roster.length, 18);
  for (const type of roster) {
    const dress = foeDress(type);
    assert.ok(dress, `${type.name} is dressed`);
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
    [2, 'Pirates'],
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
