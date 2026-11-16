import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import course from '../../../content/testground/course.json' with { type: 'json' };
import { LocalRoom } from '../network/localRoom.ts';
import type { Snapshot } from '../network/roomConnection.ts';
import { startFightRules } from '../rules/fightRules.ts';
import type { Body, Controls, MovementRules } from '../rules/movementRules.ts';
import { type FightButtons, Fighting } from './fighting.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const compiled = new WebAssembly.Module(
  await readFile(MODULE).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  }),
);
const TICK = 1 / 60;

/** The movement rules as the fight wraps them: only its step is asked here. */
const movement = { tickSeconds: TICK } as unknown as MovementRules;

/** Ticks, the controls held, and the fight's buttons held through them: walk, swing a sword, walk on guarding, dodge
 *  aside, stand still. */
const SCRIPT: readonly [number, Partial<Controls>, Partial<FightButtons>][] = [
  [30, { forward: 1, yaw: 0.2 }, {}],
  [70, { yaw: 0.2 }, { swing: true }],
  [40, { forward: 1, yaw: -0.4 }, { guard: true }],
  [1, { sideways: 1, yaw: -0.4 }, { dodge: true }],
  [40, { yaw: -0.4 }, {}],
];

test('the page predicts its own fighter exactly as its room steps it, through swings, guards and dodges', () => {
  let fight: Fighting | null = null;
  const room = LocalRoom.open(compiled, course.start, course.blocks, (snapshot: Snapshot) => fight?.receive(snapshot));
  const rules = startFightRules(compiled);
  rules.setCourse(course.blocks);
  const fighting = new Fighting(rules, room);
  fight = fighting;
  fighting.arms = rules.armsCode('sword_iron', null, true);
  room.pump(TICK);
  const steps = fighting.steps(movement);
  let body = {} as Body;
  let ticks = 0;
  let swings = 0;
  for (const [count, controls, buttons] of SCRIPT) {
    for (let tick = 0; tick < count; tick += 1) {
      const held = { forward: 0, sideways: 0, yaw: 0, run: false, jump: false, crouch: false, mounted: false };
      fighting.press({ swing: false, shoot: false, guard: false, dodge: false, pitch: 0, ...buttons });
      body = steps.step(body, { ...held, ...controls });
      const predicted = JSON.stringify(fighting.own);
      swings += fighting.swingsBegun;
      fighting.swingsBegun = 0;
      room.pump(TICK);
      // The room has taken this input: its word is the fighter the page predicted, to the bit.
      assert.equal(JSON.stringify(fighting.own), predicted, `tick ${ticks}`);
      ticks += 1;
    }
  }
  assert.equal(swings, 2, 'holding the button for 70 ticks swings twice');
  assert.ok(body.x !== 0 && Number.isFinite(body.y));
});

test('every foe asked for comes, one with each input, even two asked for within one tick', () => {
  let fight: Fighting | null = null;
  const room = LocalRoom.open(compiled, course.start, course.blocks, (snapshot: Snapshot) => fight?.receive(snapshot));
  const rules = startFightRules(compiled);
  rules.setCourse(course.blocks);
  const fighting = new Fighting(rules, room);
  fight = fighting;
  const steps = fighting.steps(movement);
  const held = { forward: 0, sideways: 0, yaw: 0, run: false, jump: false, crouch: false, mounted: false };
  fighting.ask(1);
  fighting.ask(3);
  for (let tick = 0; tick < 4; tick += 1) {
    steps.step({} as Body, held);
    room.pump(TICK);
  }
  assert.deepEqual([...fighting.foes.values()].map((foe) => foe.kind).sort(), [1, 3]);
});
