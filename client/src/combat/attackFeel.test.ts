import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CombatRules } from '../rules/combatRules.ts';
import type { FightEvent } from '../network/messages.ts';
import type { FighterView } from '../rules/fighters.ts';
import { AttackFeel } from './attackFeel.ts';

const swinging: FighterView = {
  x: 0,
  y: 0,
  z: 0,
  facing: 0,
  mode: 'ground',
  crouched: false,
  aim: 0,
  side: 'players',
  arms: 2,
  health: 100,
  healthMax: 100,
  stamina: 100,
  poise: 0,
  poiseMax: 35,
  target: null,
  action: { kind: 'attack', stroke: 1, elapsed: 20, strike: 24, end: 60, swing: 'plain', leftHand: false },
};

test('a player swings with a player’s reach, and a crewman on their side with a foe’s', () => {
  const asked: boolean[] = [];
  const rules = {
    strokeReach: (_arms: number, _stroke: number, player: boolean) => (asked.push(player), 2),
    strokeArc: () => 0.5,
  } as unknown as CombatRules;
  const feel = new AttackFeel(rules, 1 / 60);
  const drawn = new Map([
    [1, { feet: [0, 0, 0] as const, anim: 'idle', flip: false }],
    [7, { feet: [3, 0, 0] as const, anim: 'idle', flip: false }],
  ]);
  const strikers = [
    { id: 1, player: true, view: swinging, right: 'sword_iron', left: null },
    { id: 7, view: { ...swinging, x: 3 }, right: 'sword_iron', left: null },
  ];
  feel.arcsMesh(0, strikers, drawn, [0, 0, 1.6], false);
  assert.deepEqual(asked, [true, false]);
});

test("the player's own hit foreseen holds as it lands, and the room's word on it holds nothing more", () => {
  const feel = new AttackFeel({} as CombatRules, 1 / 60);
  const hit: FightEvent = { tick: 1n, kind: 1, how: 1, striker: 1, defender: 7, amount: 10, stroke: 3 };
  feel.frame([], null, 1, 1 / 60, new Set(), [hit]);
  feel.frame([], null, 1, 0.02, new Set());
  assert.equal(feel.shownSeconds(7, 0.02), 0, 'the foe held still as the blow landed');
  for (let frame = 0; frame < 30; frame += 1) feel.frame([], null, 1, 1 / 60, new Set());
  feel.frame([{ ...hit, felt: true }], null, 1, 1 / 60, new Set());
  feel.frame([], null, 1, 0.02, new Set());
  assert.ok(feel.shownSeconds(7, 0.02) > 0, "the room's word holds it no more");
});
