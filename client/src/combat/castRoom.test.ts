import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import course from '../../../content/testground/course.json' with { type: 'json' };
import { SPELLS } from '../network/artMessages.ts';
import { ASKS } from '../network/gearMessages.ts';
import { LocalRoom } from '../network/localRoom.ts';
import type { Snapshot } from '../network/roomConnection.ts';
import { startCombatRules } from '../rules/combatRules.ts';
import type { MovementRules } from '../rules/movementRules.ts';
import { Fighting } from './fighting.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const compiled = new WebAssembly.Module(
  await readFile(MODULE).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  }),
);
const TICK = 1 / 60;

/** The Test Ground's room in the page, the player's fight in it, and a tick of the player standing still. */
function standing() {
  let fight: Fighting | null = null;
  const room = LocalRoom.open(compiled, course.start, course.blocks, (snapshot: Snapshot) => fight?.receive(snapshot));
  const rules = startCombatRules(compiled);
  rules.setCourse(course.blocks);
  const fighting = new Fighting(rules, room);
  fight = fighting;
  const steps = fighting.steps({ tickSeconds: TICK } as unknown as MovementRules);
  const still = { forward: 0, sideways: 0, yaw: 0, run: false, jump: false, crouch: false, mounted: false };
  const tick = (ticks = 1) => {
    for (let count = 0; count < ticks; count++) {
      fighting.press({ swing: false, shoot: false, guard: false, dodge: false, pitch: 0 });
      steps.step({} as never, still);
      room.pump(TICK);
    }
  };
  return { fighting, tick };
}

test('a cast sent from the page is taken by the room, empties its share on the bar, and its spell reaches every player', () => {
  const { fighting, tick } = standing();
  tick(2);
  assert.deepEqual(fighting.arts?.art, 1, 'Storm worn');
  assert.equal(fighting.abilities?.tenets[0], 1, 'Quicken ready in a new room');
  fighting.cast({ spell: SPELLS.quicken, aim: null });
  tick(30);
  const quicken = fighting.abilities?.tenets[0] ?? 1;
  assert.ok(quicken < 0.01, `spent: ${quicken}`);
  assert.ok((fighting.own?.statuses?.haste ?? 0) > 0, 'the caster Hasted');
  // The Test Ground fills the Anima; Shadow worn, Dusk Daggers whirl where they were aimed.
  for (const ask of [{ kind: ASKS.grantArts }, { kind: ASKS.wearArt, column: 3 }]) {
    fighting.askGear(ask);
    tick(15);
  }
  assert.deepEqual([fighting.arts?.art, fighting.abilities?.animaShare], [3, 1]);
  fighting.cast({ spell: SPELLS.duskDaggers, aim: [course.start.x, course.start.y - 6, 0] });
  tick(20);
  const ring = [...fighting.spells.spells.values()].find((spell) => spell.kind === SPELLS.duskDaggers);
  assert.ok(ring, 'the ring is in the snapshot');
  assert.deepEqual([ring.art, ring.radius, ring.at[1]], [3, 4, course.start.y - 6]);
});
