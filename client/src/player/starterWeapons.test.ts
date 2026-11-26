import assert from 'node:assert/strict';
import { test } from 'node:test';
import female from '../../../tools/forge/tools/sprite-forge/fitted/female.json' with { type: 'json' };
import male from '../../../tools/forge/tools/sprite-forge/fitted/male.json' with { type: 'json' };
import { holdingOf } from '../firstperson/handsLaw.ts';
import { item, state } from '../network/gearForTests.ts';
import { wardrobeOf } from './dressing.ts';
import { KINDS, MELEE, RANGED_SLOT, WORN, gearHands, slotOf } from './gear.ts';

/** Every layer of a fitted body, as the page loads a body's layers. */
function layersOfBody(fitted: object): Record<string, string[]> {
  const found: Record<string, string[]> = {};
  for (const [move, heads] of Object.entries(fitted))
    for (const names of Object.values(heads as Record<string, string[]>))
      for (const name of names) (found[name] ??= []).includes(move) || found[name].push(move);
  return found;
}

/** The loadouts the Weaponsmith's starter stock offers: every Melee and every Ranged kind (`Vendor::starter_kinds`). */
const LOADOUTS = KINDS.map((kind, number) => ({ kind, number })).filter(
  ({ kind, number }) => kind !== '' && (slotOf(number) === MELEE || slotOf(number) === RANGED_SLOT),
);

test('the starter stock offers thirteen Melee kinds and five Ranged', () => {
  assert.equal(LOADOUTS.filter(({ number }) => slotOf(number) === MELEE).length, 13);
  assert.equal(LOADOUTS.filter(({ number }) => slotOf(number) === RANGED_SLOT).length, 5);
});

test('every kind the Weaponsmith gives is drawn on the figure and in first person, Normal at every level', () => {
  for (const [body, fitted] of Object.entries({ male, female })) {
    const layers = layersOfBody(fitted);
    const wardrobe = wardrobeOf(body as 'male' | 'female', layers);
    for (const { kind, number } of LOADOUTS)
      for (let level = 1; level <= 20; level += 1)
        for (const id of [1, 2, 3]) {
          const slot = slotOf(number);
          const worn = state({ items: [item({ kind: number, rarity: 0, level, id, at: WORN + slot })] });
          const hands = gearHands(worn, wardrobe, slot);
          const where = `${body} ${kind} level ${level} number ${id}`;
          assert.ok(hands.right && hands.right in layers, `${where}: its weapon is drawn on the figure`);
          if (hands.left !== null) assert.ok(hands.left in layers, `${where}: its left hand's ${hands.left} is drawn`);
          const held = holdingOf(hands.right);
          assert.ok(held?.kind === 'weapon' || held?.kind === 'shooter', `${where}: ${hands.right} in first person`);
        }
  }
});
