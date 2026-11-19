import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import course from '../../../content/testground/course.json' with { type: 'json' };
import { Fighting } from '../combat/fighting.ts';
import { ASKS, type GearState } from '../network/gearMessages.ts';
import { LocalRoom } from '../network/localRoom.ts';
import type { Snapshot } from '../network/roomConnection.ts';
import { startCombatRules } from '../rules/combatRules.ts';
import type { MovementRules } from '../rules/movementRules.ts';
import { ANSWER_TICKS_MOST, PanelAsks } from './panelAsks.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const compiled = new WebAssembly.Module(
  await readFile(MODULE).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  }),
);
const TICK = 1 / 60;

/** The Test Ground alone with the pointer free: the room in the page ticked only by `tick`, the player standing still,
 *  as the page carries a panel's ask; `ticks` counts them. */
function paused() {
  let fight: Fighting | null = null;
  let gear: GearState | null = null;
  const room = LocalRoom.open(
    compiled,
    course.start,
    course.blocks,
    (snapshot: Snapshot) => fight?.receive(snapshot),
    (message) => (gear = message),
    { stall: course.stall, nodes: course.resources },
  );
  const rules = startCombatRules(compiled);
  rules.setCourse(course.blocks);
  const fighting = new Fighting(rules, room);
  fight = fighting;
  room.pump(TICK);
  const steps = fighting.steps({ tickSeconds: TICK } as unknown as MovementRules);
  const still = { forward: 0, sideways: 0, yaw: 0, run: false, jump: false, crouch: false, mounted: false };
  const counted = { ticks: 0 };
  const tick = () => {
    steps.step({} as never, still);
    room.pump(TICK);
    counted.ticks += 1;
  };
  return { fighting, gear: () => gear, tick, counted };
}

test('with the pointer free, each panel ask is answered in the frame after its press, and none is lost', () => {
  const { fighting, gear, tick, counted } = paused();
  const asks = new PanelAsks();
  const grants = [0, 1, 2, 3, 4, 0].map((rarity) => ({ kind: ASKS.grantVestige, rarity, slot: 0, level: 1 }));
  for (const [index, ask] of grants.entries()) {
    asks.ask(fighting, ask);
    counted.ticks = 0;
    asks.carry(fighting, () => gear()?.answered ?? 0, tick);
    assert.equal(gear()?.answered, index + 1, `ask ${index + 1} answered at once`);
    assert.equal(gear()?.vestiges.length, index + 1, `the Vestige of ask ${index + 1} is in the gear`);
    assert.ok(counted.ticks <= 13, `a fifth of a second of the room's time, not ${counted.ticks} ticks`);
  }
  // A refusal is answered as quickly, with the room's word for it: no Ammo crate to use.
  asks.ask(fighting, { kind: ASKS.useCrate });
  asks.carry(fighting, () => gear()?.answered ?? 0, tick);
  assert.deepEqual([gear()?.answered, gear()?.answer], [7, 22]);
});

test('asks the room let go hold it on for a second at most, and the next ask is answered at once again', () => {
  const { fighting, gear, tick, counted } = paused();
  const asks = new PanelAsks();
  // Six asks in one frame: the room answers one, holds four and lets the sixth go.
  for (let nth = 0; nth < 6; nth += 1) asks.ask(fighting, { kind: ASKS.grantXp, count: 10 });
  asks.carry(fighting, () => gear()?.answered ?? 0, tick);
  assert.equal(counted.ticks, ANSWER_TICKS_MOST);
  assert.equal(gear()?.answered, 5);
  asks.ask(fighting, { kind: ASKS.grantXp, count: 10 });
  counted.ticks = 0;
  asks.carry(fighting, () => gear()?.answered ?? 0, tick);
  assert.equal(gear()?.answered, 6);
  assert.ok(counted.ticks <= 13, `${counted.ticks} ticks`);
});
