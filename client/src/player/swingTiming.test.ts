import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { type WeaponKind, swingFrameSeconds } from '../firstperson/weaponMachine.ts';
import { startCombatRules } from '../rules/combatRules.ts';
import { FIGHTER_FLOATS, fighterView } from '../rules/fighters.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const compiled = new WebAssembly.Module(
  await readFile(MODULE).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  }),
);

/** A player at rest holding `arms`, in the combat crate's order (as the rules' own agreement test lays one). */
function holding(arms: number): Float64Array {
  const fighter = new Float64Array(FIGHTER_FLOATS);
  fighter.set([0, 2, 0, 0, 0, 0, Math.PI, 0, 0, 0, 1]);
  fighter.set([0, arms, 1, 100, 100, 100, 0, 0, 40, 0, 0, Math.PI, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0], 22);
  return fighter;
}

// The first person draws a swing by its own copy of the swing law, so it is held here to the rules' own ticks.
test('the first person’s strike frames land and end each swing on the ticks the rules do', () => {
  const rules = startCombatRules(compiled);
  const kinds: readonly WeaponKind[] = ['dagger', 'sword', 'mace', 'flail', 'axe', 'warhammer', 'staff'];
  for (const kind of kinds) {
    const arms = rules.armsCode(`${kind}_iron`, null, true);
    assert.notEqual(arms, 0, `${kind}: a weapon the rules know`);
    const intent = new Float64Array([0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0.1, 0, Number.NaN, Number.NaN, Number.NaN]);
    const { action } = fighterView(rules.predict(holding(arms), intent, 1, arms, []).fighter);
    assert.equal(action.kind, 'attack', `${kind}: swinging`);
    if (action.kind !== 'attack') continue;
    const frame = swingFrameSeconds(kind);
    assert.deepEqual([Math.round(frame * 2 * 60), Math.round(frame * 5 * 60)], [action.strike, action.end], kind);
  }
});
