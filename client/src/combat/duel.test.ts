import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import course from '../../../content/testground/course.json' with { type: 'json' };
import { LocalRoom } from '../network/localRoom.ts';
import type { Snapshot } from '../network/roomConnection.ts';
import { startCombatRules } from '../rules/combatRules.ts';
import type { MovementRules } from '../rules/movementRules.ts';
import type { GearState } from '../network/gearMessages.ts';
import { Fighting } from './fighting.ts';
import { KIND, wear } from './wornForTests.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const compiled = new WebAssembly.Module(
  await readFile(MODULE).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  }),
);
const TICK = 1 / 60;
const SWORDSMAN = { type: 14, rank: 2 };
/** The room's event numbers (crates/room/src/judging.rs) and its riposte's. */
const EVENT = { parried: 3, perfect: 6, killed: 8 };
const RIPOSTE = 2;
/** How the player answers a blow: not at all, a guard pressed or a dodge aside, a few ticks before it lands. */
type Answer = 'none' | 'guard' | 'dodge';
const ANSWER_BEFORE = 5;

/** A minute of a player with a sword and shield against a swordsman, the player facing it and answering each blow
 *  they see coming, and striking back once one is parried; every event the room told the page, in words. */
function duel(answer: Answer): string[] {
  let fight: Fighting | null = null;
  let gear: GearState | null = null;
  const room = LocalRoom.open(
    compiled,
    course.start,
    course.blocks,
    (snapshot: Snapshot) => fight?.receive(snapshot),
    (message) => {
      gear = message;
    },
  );
  const rules = startCombatRules(compiled);
  rules.setCourse(course.blocks);
  const fighting = new Fighting(rules, room);
  fight = fighting;
  fighting.arms = rules.armsCode('sword_steel', 'shield_kite_steel', true);
  const steps = fighting.steps({ tickSeconds: TICK } as unknown as MovementRules);
  const still = { forward: 0, sideways: 0, yaw: 0, run: false, jump: false, crouch: false, mounted: false };
  const idle = () => {
    fighting.press({ swing: false, shoot: false, guard: false, dodge: false, pitch: 0 });
    steps.step({} as never, still);
    room.pump(TICK);
  };
  // The sword is the starting kit's; the shield is handed out and worn, as the room takes arms from gear alone.
  wear(fighting, () => gear, idle, [KIND.shield]);
  fighting.ask(SWORDSMAN);
  const told: string[] = [];
  let answeredAt = -Infinity;
  let guarding = 0;
  let striking = 0;
  for (let tick = 0; tick < 60 * 60; tick += 1) {
    const own = fighting.own;
    const foe = [...fighting.foes.values()][0]?.view;
    let yaw = 0;
    let dodge = false;
    if (own && foe) {
      yaw = Math.atan2(foe.x - own.x, own.y - foe.y);
      const { action } = foe;
      const landsIn =
        action.kind === 'attack'
          ? action.strike - action.elapsed
          : action.kind === 'telegraph'
            ? action.windup - action.elapsed
            : 0;
      if (answer !== 'none' && landsIn > 0 && landsIn <= ANSWER_BEFORE && tick - answeredAt > ANSWER_BEFORE) {
        answeredAt = tick;
        guarding = answer === 'guard' ? 14 : 0;
        dodge = answer === 'dodge';
      }
    }
    fighting.press({ swing: striking > 0, shoot: false, guard: guarding > 0, dodge, pitch: 0 });
    guarding = Math.max(0, guarding - 1);
    striking = Math.max(0, striking - 1);
    const controls = { forward: 0, sideways: dodge ? 1 : 0, yaw, run: false, jump: false, crouch: false };
    steps.step({} as never, { ...controls, mounted: false });
    room.pump(TICK);
    for (const event of fighting.takeEvents()) {
      const onMe = event.defender === fighting.player;
      if (onMe && (event.kind === EVENT.parried || event.kind === EVENT.perfect)) striking = 20;
      const name = Object.entries(EVENT).find(([, kind]) => kind === event.kind)?.[0];
      if (name) told.push(`${name}${event.how === RIPOSTE ? ' riposte' : ''} ${onMe ? 'on me' : 'by me'}`);
    }
  }
  return told;
}

test('through the page’s own fight, a swordsman kills a player who stands still', () => {
  assert.ok(duel('none').includes('killed on me'));
});

test('a player who guards just as each blow lands parries it, and their riposte kills the swordsman', () => {
  const told = duel('guard');
  assert.ok(told.filter((word) => word === 'parried on me').length >= 2, told.join(', '));
  assert.ok(told.includes('killed riposte by me'), told.join(', '));
  assert.ok(!told.includes('killed on me'), told.join(', '));
});

test('a player who dodges aside just as each blow lands dodges it perfectly', () => {
  const told = duel('dodge');
  assert.ok(told.filter((word) => word === 'perfect on me').length >= 5, told.join(', '));
});
