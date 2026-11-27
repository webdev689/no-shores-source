import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { checkSizes, PAGE_SIZES, roomWasmAt, startCombatRules } from './combatRules.ts';
import { DRINKS_AT, FIGHTER_FLOATS, GLANCE_FLOATS, INTENT_FLOATS, fighterView } from './fighters.ts';
import { PROTOCOL } from '../../../generated/messages/ts/version.ts';
import { BODY_FLOATS } from './movementRules.ts';
import { pinned } from '../../../server/pinnedForTests.ts';

/** The combat crate's agreement test holds the same fingerprint, course and script (crates/combat/tests/agree.rs). */
const FIGHT_HASH = pinned('combat.fight');

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const compiled = new WebAssembly.Module(
  await readFile(MODULE).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  }),
);
const COURSE = [{ minX: -3, minY: -8, maxX: 3, maxY: -7, top: 1.2, bottom: 0 }];
/** The arms codes of a sword with a shield and of a bow, as the combat crate packs them. */
const SWORD_AND_SHIELD = 2 | (1 << 16);
const BOW = 1 << 8;
/** Ticks, then forward, sideways, yaw, the stroke held, guard, dodge, shoot, aim, whether the bow is held, and a drink
 *  asked on the phase's first tick. */
type Phase = readonly [number, number, number, number, number, boolean, boolean, boolean, boolean, boolean, boolean];
const SCRIPT: readonly Phase[] = [
  [40, 1, 0, 0.1, 0, false, false, false, false, false, false],
  [70, 0, 0, 0.1, 6, false, false, false, false, false, false],
  [80, -1, 0, 0, 0, true, false, false, false, false, false],
  [1, 0, 1, 0, 0, false, true, false, false, false, false],
  [40, 0, 0, 0, 0, false, false, false, false, false, false],
  [50, 0, 0, -0.2, 0, false, false, false, true, true, false],
  [1, 0, 0, -0.2, 0, false, false, true, true, true, false],
  [40, 0, 0, -0.2, 0, false, false, false, false, true, false],
  [1, 0, 0, -0.2, 0, false, false, true, false, true, false],
  [40, 0, 0, -0.2, 0, false, false, false, false, true, false],
  [70, -1, 0, -0.2, 0, false, false, false, false, true, true],
];

/** A fighter's numbers in the combat crate's order: a player standing at (0, 2) facing south with a sword and shield,
 *  wounded to 60 of 100 health, with all three healing charges. */
function startingPlayer(): Float64Array {
  const fighter = new Float64Array(FIGHTER_FLOATS);
  fighter.set([0, 2, 0, 0, 0, 0, Math.PI, 0, 0, 0, 1]);
  fighter.set(
    [0, SWORD_AND_SHIELD, 1, 60, 100, 100, 0, 0, 40, 0, 0, Math.PI, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
    BODY_FLOATS,
  );
  fighter[DRINKS_AT] = 3;
  return fighter;
}

/** A glance at the still foe 3 m north of the player's start. */
function foeGlance(): Float64Array {
  const glance = new Float64Array(GLANCE_FLOATS);
  glance.set([0, -3, 0, Math.PI, 0, 0, Math.PI, 1, 2, 1, 70, 70, 100, 0, 35, 0, 0]);
  return glance;
}

/** FNV-1a over each fighter's numbers' little-endian bits, fighter after fighter, as the crate takes it. */
function fingerprint(fighters: readonly Float64Array[]): string {
  const bytes = new DataView(new ArrayBuffer(8));
  let hash = 0xcbf2_9ce4_8422_2325n;
  for (const value of fighters.flatMap((fighter) => Array.from(fighter))) {
    bytes.setFloat64(0, value, true);
    for (let index = 0; index < 8; index++)
      hash = ((hash ^ BigInt(bytes.getUint8(index))) * 0x0100_0000_01b3n) & 0xffff_ffff_ffff_ffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

test('the scripted fight through WebAssembly moves to the same fingerprint as the crate run natively', () => {
  const rules = startCombatRules(compiled);
  rules.setCourse(COURSE);
  assert.deepEqual(rules.sizes, { fighter: FIGHTER_FLOATS, intent: INTENT_FLOATS, glance: GLANCE_FLOATS });
  assert.equal(INTENT_FLOATS, 18);
  const view = [{ id: 2, glance: foeGlance() }];
  let fighter = startingPlayer();
  const fighters: Float64Array[] = [];
  for (const [ticks, forward, sideways, yaw, stroke, guard, dodge, shoot, aim, bow, heal] of SCRIPT) {
    for (let tick = 0; tick < ticks; tick += 1) {
      fighter = fighter.slice();
      fighter[BODY_FLOATS + 1] = bow ? BOW : SWORD_AND_SHIELD;
      const intent = new Float64Array([
        forward,
        sideways,
        yaw,
        0,
        0,
        0,
        0,
        0,
        stroke,
        +guard,
        +(dodge && tick === 0),
        +shoot,
        0.1,
        +aim,
        Number.NaN,
        Number.NaN,
        Number.NaN,
        +(heal && tick === 0),
      ]);
      fighter = rules.predict(fighter, intent, 1, fighter[BODY_FLOATS + 1] ?? 0, view).fighter;
      fighters.push(fighter);
    }
  }
  assert.equal(fingerprint(fighters), FIGHT_HASH);
  const last = fighterView(fighters.at(-1) ?? []);
  assert.equal(last.target, 2, 'its lock took the foe');
  assert.deepEqual([last.health, last.charges], [100, 2], 'the drink healed 40 and spent a charge');
  assert.ok(
    fighters.some((each) => fighterView(each).action.kind === 'drink'),
    'the page reads the drink',
  );
});

test('the arms of a forge layer pair read as the combat crate reads them', () => {
  const rules = startCombatRules(compiled);
  assert.equal(rules.armsCode('sword_iron', 'shield_kite_steel', true), SWORD_AND_SHIELD);
  assert.equal(rules.armsCode('bow_short_iron', null, true), BOW);
  assert.equal(rules.armsCode('sword_iron', 'shield_kite_steel', false), 0, 'put away, bare hands');
});

test('a stroke reaches as far as the combat crate says: a sword’s thrust farthest, its sweeps least', () => {
  const rules = startCombatRules(compiled);
  assert.ok(Math.abs(rules.strokeReach(SWORD_AND_SHIELD, 6, false) - (1.8 + 0.5 + 0.35)) < 1e-12);
  assert.ok(Math.abs(rules.strokeReach(SWORD_AND_SHIELD, 3, false) - (1.8 - 0.1 + 0.35)) < 1e-12);
  assert.ok(Math.abs(rules.strokeReach(SWORD_AND_SHIELD, 6, true) - (1.8 * 1.1 + 0.5 + 0.35)) < 1e-12, 'a player’s');
  assert.equal(rules.strokeReach(SWORD_AND_SHIELD, 0, true), 0, 'no stroke');
  const degrees = (stroke: number) => Math.round((rules.strokeArc(stroke) * 180) / Math.PI);
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6].map(degrees),
    [35, 50, 70, 70, 50, 20],
    'the chop, the slants, the sweeps, the thrust',
  );
  assert.equal(rules.strokeArc(0), 0, 'no stroke');
});

test('the parry window a press opens is the combat crate’s: a quarter of a second for a player, nine ticks for a foe', () => {
  const rules = startCombatRules(compiled);
  assert.deepEqual([rules.parryWindow(true), rules.parryWindow(false)], [15, 9]);
});

test("an item's fight numbers come from the room's stats; none for no kind, unknown traits counting nothing", () => {
  const rules = startCombatRules(compiled);
  const sword = rules.itemStats(2, []);
  assert.equal(sword.length, 15, "the room's stats, as the page reads them");
  assert.equal(sword[0], 1, 'a sword fights as a Melee loadout');
  assert.ok((rules.itemStats(2, ['light_grip'])[6] ?? 0) < (sword[6] ?? 0), 'Light Grip: a swing costs less');
  assert.deepEqual([...rules.itemStats(2, ['no_such_trait', ''])], [...sword], 'an unknown trait counts nothing');
  assert.equal(rules.itemStats(0, []).length, 0);
  assert.equal(rules.itemStats(99, []).length, 0);
});

test('rules that lay a fighter, an intent or a glance out otherwise than the page are refused, and their address names the protocol', () => {
  assert.doesNotThrow(() => checkSizes(PAGE_SIZES));
  for (const wrong of [{ fighter: FIGHTER_FLOATS - 2 }, { intent: INTENT_FLOATS - 1 }, { glance: GLANCE_FLOATS + 1 }])
    assert.throws(() => checkSizes({ ...PAGE_SIZES, ...wrong }), /Reload the page/, JSON.stringify(wrong));
  assert.equal(roomWasmAt('/game/'), `/game/room.wasm?v=${PROTOCOL}`);
});

test('a passage zone’s ask stands the prediction on its own ground, under ground and above it, and anything else is refused', () => {
  const rules = startCombatRules(compiled);
  // Saltmere's week 2900: zone 0 is under ground and zone 1 a hollow (crates/room-wasm passage_room_door_tests.rs).
  for (const zone of [0, 1]) {
    const ask = JSON.stringify({ island: 'continent-1', week: 2900, zone, route: 'public', minute: 29_230_000 });
    assert.equal(rules.setPassage(ask), true, `zone ${zone}`);
  }
  assert.equal(rules.setPassage('not an ask'), false);
  assert.equal(rules.setPassage(JSON.stringify({ island: 'continent-1', week: 2900, zone: 9999 })), false);
});
