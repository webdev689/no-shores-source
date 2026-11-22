import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DRINKS_AT, FIGHTER_FLOATS, chargesOf, fighterView } from './fighters.ts';

const ACTION_AT = 22 + 23;

test('a fighter’s numbers say its drink, its charges and its meter, and nonsense reads as none', () => {
  const fighter = new Float64Array(FIGHTER_FLOATS);
  fighter[ACTION_AT] = 13;
  fighter[ACTION_AT + 1] = 21;
  // Two charges, with the drink's press kept and held above them, and the meter a third of the way.
  fighter[DRINKS_AT] = 2 | (5 << 2) | (1 << 6);
  fighter[DRINKS_AT + 1] = 1 / 3;
  const view = fighterView(fighter);
  assert.deepEqual(view.action, { kind: 'drink', elapsed: 21 });
  assert.deepEqual([view.charges, view.meter], [2, 1 / 3]);
  fighter[DRINKS_AT + 1] = Number.NaN;
  assert.deepEqual(chargesOf(fighter), { charges: 2, meter: 0 });
  fighter[DRINKS_AT + 1] = 7;
  assert.equal(chargesOf(fighter).meter, 1, 'never past a whole charge');
});
