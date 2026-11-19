import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import course from '../../../content/testground/course.json' with { type: 'json' };
import { LocalRoom } from '../network/localRoom.ts';
import type { Snapshot } from '../network/roomConnection.ts';
import type { Cards } from '../player/cards.ts';
import { plainDress } from '../player/dressing.ts';
import type { Action, InputFrame } from '../player/input.ts';
import { newPlayer } from '../player/player.ts';
import { Walker } from '../player/walker.ts';
import { startCombatRules } from '../rules/combatRules.ts';
import { startMovementRules } from '../rules/movementRules.ts';
import { Fighting } from './fighting.ts';
import { PlayerFight } from './playerFight.ts';

const built = (name: string) =>
  readFile(new URL(`../../../target/wasm32-unknown-unknown/release/${name}.wasm`, import.meta.url)).catch(() => {
    throw new Error(`${name}.wasm is not built: run \`npm run wasm\` first`);
  });
const compiled = new WebAssembly.Module(await built('room_wasm'));
const movement = await startMovementRules(await built('movement_wasm'));
movement.setCourse(course.blocks);
const TICK = movement.tickSeconds;

/** A frame with these actions held, and those pressed this frame, the pointer held. */
function controls(held: Action[] = [], pressed: Action[] = []): InputFrame {
  return {
    held: (action) => held.includes(action) || pressed.includes(action),
    pressed: (action) => pressed.includes(action),
    released: () => false,
    lookX: 0,
    lookY: 0,
    wheel: 0,
    locked: true,
  };
}

/** The player with a sword drawn in a fight in a room in the page, the first person's hands standing in: each frame's
 *  button and pose are kept. */
function fightingPlayer() {
  const shown: { attackPressed: boolean; pose: unknown; pace: unknown }[] = [];
  const hands = {
    swing: null,
    muzzle: null,
    cancel: () => undefined,
    update: (_seconds: number, button: { attackPressed: boolean }, state: { pose?: unknown; pace?: unknown }) => {
      shown.push({ attackPressed: button.attackPressed, pose: state.pose ?? null, pace: state.pace ?? null });
    },
  } as unknown as ConstructorParameters<typeof Walker>[2];
  const forge = {
    frames: () => 4,
    draws: () => true,
    warm: () => undefined,
    walking: () => null,
    pump: () => undefined,
    card: () => null,
  } as unknown as Cards;
  const dress = plainDress('human', 0.3);
  const you = { id: 1, x: 0, y: 0, z: 0, facing: 0, dress, anim: 'idle', frame: null, spin: false };
  you.dress = { ...dress, outfit: { ...dress.outfit, drawn: true } };
  const walker = new Walker(newPlayer(movement, course.start.x, course.start.y), you, hands, forge);
  let fight: Fighting | null = null;
  const room = LocalRoom.open(compiled, course.start, course.blocks, (snapshot: Snapshot) => fight?.receive(snapshot));
  const rules = startCombatRules(compiled);
  rules.setCourse(course.blocks);
  const fighting = new Fighting(rules, room);
  fight = fighting;
  room.pump(TICK);
  const player = new PlayerFight(fighting, rules, walker);
  const steps = fighting.steps(movement);
  let clock = 0;
  const frame = (input: InputFrame) => {
    clock += TICK;
    return player.frame(input, steps, TICK, clock, { running: true, hands: true, markOf: () => null, zoomOf: () => 1 });
  };
  return { fighting, walker, shown, frame };
}

test('a swing pressed reaches the fight, and the first person swings as the rules begin it, the arms told to the room', () => {
  const { fighting, walker, shown, frame } = fightingPlayer();
  frame(controls());
  assert.equal(fighting.arms, startCombatRules(compiled).armsCode('sword_iron', null, true), 'the sword drawn');
  const pressed = frame(controls(['swing'], ['swing']));
  assert.equal(pressed.pressed, true);
  frame(controls(['swing']));
  assert.equal(fighting.own?.action.kind, 'attack');
  const begun = shown.find((each) => each.attackPressed);
  assert.ok(begun, 'swung in the first person once the rules began it');
  // The hands are paced by the rules' own swing: a sword's blow lands at 18 ticks of 45.
  const action = fighting.own?.action;
  assert.ok(action?.kind === 'attack');
  assert.deepEqual(begun.pace, { strike: action.strike * TICK, end: action.end * TICK, at: 0 });
  assert.deepEqual([action.strike, action.end], [18, 45]);
  assert.deepEqual(fighting.look, walker.look, 'the room is told what the figure shows');
  assert.equal(fighting.dress, walker.lookDress);
});

test('the guard held stands the first person in its pose, and the figure faces where its arms point', () => {
  const { fighting, walker, shown, frame } = fightingPlayer();
  frame(controls());
  frame(controls(['guard'], ['guard']));
  frame(controls(['guard']));
  assert.ok(fighting.own?.action.kind === 'parry' || fighting.own?.action.kind === 'guard');
  assert.notEqual(shown.at(-1)?.pose, null, 'posed');
  assert.equal(walker.you.facing, fighting.own?.aim);
});

test('locked on, a dodge is drawn rolling the way it goes, while the rules keep the fighter facing its foe', () => {
  const { fighting, walker, frame } = fightingPlayer();
  fighting.ask({ type: 14, rank: 2 });
  for (let tick = 0; tick < 20; tick += 1) frame(controls());
  frame(controls(['swing'], ['swing']));
  for (let tick = 0; tick < 50; tick += 1) frame(controls());
  assert.notEqual(fighting.own?.target ?? null, null, 'locked on a foe');
  frame(controls(['dodge', 'right'], ['dodge']));
  frame(controls(['right']));
  const own = fighting.own;
  assert.equal(own?.action.kind, 'dodge');
  const east = Math.PI / 2;
  assert.ok(Math.abs((own?.aim ?? east) - east) > 0.5, `the rules face the foe: ${own?.aim}`);
  assert.ok(Math.abs(walker.you.facing - east) < 1e-9, `the figure rolls east: ${walker.you.facing}`);
  assert.equal(walker.look.facing, walker.you.facing, 'the room is told it so');
});
