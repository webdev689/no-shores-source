import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import course from '../../../content/testground/course.json' with { type: 'json' };
import { LocalRoom } from '../network/localRoom.ts';
import type { Snapshot } from '../network/roomConnection.ts';
import { startCombatRules } from '../rules/combatRules.ts';
import type { MovementRules } from '../rules/movementRules.ts';
import type { GearState } from '../network/gearMessages.ts';
import type { FighterView } from '../rules/fighters.ts';
import { parryCue } from './cues.ts';
import { Fighting } from './fighting.ts';
import { KIND, wear } from './wornForTests.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const compiled = new WebAssembly.Module(
  await readFile(MODULE).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  }),
);
const TICK = 1 / 60;
const SWORDSMAN = { type: 2, rank: 2 };
/** The room's event numbers (crates/room/src/judging.rs) and its riposte's. */
const EVENT = { blocked: 2, parried: 3, perfect: 6, killed: 8 };
const RIPOSTE = 2;
/** How the player answers a blow: not at all, a guard pressed or a dodge aside, a few ticks before it lands; or a
 *  guard pressed as the parry ring turns gold, or the tick before. */
type Answer = 'none' | 'guard' | 'dodge' | 'gold' | 'early';
const ANSWER_BEFORE = 5;

/** Whether the parry ring over a foe is gold for `player`: a press now would parry its blow. */
function gold(view: FighterView, player: number, open: boolean): boolean {
  const cue = parryCue(view, player, open);
  return cue !== null && cue !== 'iron' && cue.now;
}

/** A foe's view a tick on, its blow a tick nearer landing. */
const later = (view: FighterView): FighterView =>
  'elapsed' in view.action ? { ...view, action: { ...view.action, elapsed: view.action.elapsed + 1 } } : view;

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
  // A Sword & Shield is handed out and worn in place of the starting sword, as the room takes arms from gear alone.
  wear(fighting, () => gear, idle, [KIND.swordAndShield]);
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
      const ring = (view: FighterView) => gold(view, fighting.player, fighting.parryOpen);
      const asked = answer === 'gold' ? ring(foe) : answer === 'early' && !ring(foe) && ring(later(foe));
      const cued =
        answer === 'gold' || answer === 'early'
          ? asked && tick - answeredAt > 20
          : answer !== 'none' && landsIn > 0 && landsIn <= ANSWER_BEFORE && tick - answeredAt > ANSWER_BEFORE;
      if (cued) {
        answeredAt = tick;
        guarding = answer === 'dodge' ? 0 : 14;
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

// The ring reads the player's own window: a foe's guard opens a shorter one, which the ring never times.
test('the parry ring turns gold on the first tick a press parries the blow, and a press the tick before blocks it', () => {
  const onGold = duel('gold');
  assert.ok(onGold.filter((word) => word === 'parried on me').length >= 2, onGold.join(', '));
  assert.ok(!onGold.includes('blocked on me'), onGold.join(', '));
  const early = duel('early');
  assert.ok(early.filter((word) => word === 'blocked on me').length >= 2, early.join(', '));
  assert.ok(!early.includes('parried on me'), early.join(', '));
});
