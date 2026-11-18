import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FightEvent } from '../network/messages.ts';
import type { Action, FighterView } from '../rules/fighters.ts';
import { EVENT } from './cues.ts';
import {
  FOUGHT_SECONDS,
  FoeTarget,
  TARGET_FADE_SECONDS,
  TARGET_SECONDS,
  type TargetFoe,
  THREAT_YIELD_SECONDS,
} from './foeTarget.ts';

const PLAYER = 1;
const view: FighterView = {
  x: 0,
  y: 0,
  z: 0,
  facing: 0,
  mode: 'ground',
  crouched: false,
  aim: 0,
  side: 'foes',
  arms: 0,
  health: 40,
  healthMax: 50,
  stamina: 100,
  poise: 0,
  poiseMax: 35,
  target: null,
  action: { kind: 'idle' },
};
const windUp: Action = {
  kind: 'telegraph',
  shape: 'sweep',
  elapsed: 0,
  windup: 40,
  origin: [0, 0, 0],
  bearing: 0,
  ahead: 2,
  iron: false,
  feintAt: null,
};
const foe = (id: number, changes: Partial<FighterView> = {}): TargetFoe => ({ id, view: { ...view, ...changes } });
const struck = (striker: number, defender: number, kind: number = EVENT.hit): FightEvent => ({
  tick: 0n,
  kind,
  how: 1,
  striker,
  defender,
  amount: 5,
  stroke: 1,
});
const frameOf = (foes: TargetFoe[], events: FightEvent[] = [], lock: number | null = null) => ({
  player: PLAYER,
  lock,
  foes,
  events,
});

test('the target is the foe the player’s blow reached, never one another foe struck; it fades, and goes with death', () => {
  const target = new FoeTarget();
  const bear = foe(7);
  assert.equal(target.step(frameOf([bear], [struck(9, 7)]), 0), null, 'a foe striking another is not the target');
  assert.deepEqual(target.step(frameOf([bear], [struck(PLAYER, 7)]), 0), { id: 7, share: 1 });
  const late = target.step(frameOf([bear]), TARGET_SECONDS - 1);
  assert.ok(late && late.id === 7 && late.share < 1, 'still there a second before its time, and fading');
  assert.equal(target.step(frameOf([bear]), 2), null, 'then it goes: a plate that never leaves is furniture');
  target.step(frameOf([bear], [struck(PLAYER, 7)]), 0);
  assert.equal(target.step(frameOf([foe(7, { action: { kind: 'dead', elapsed: 0 } })]), 0), null, 'dead, at once');
  assert.equal(TARGET_FADE_SECONDS, 1.5);
});

test('two foes of one name are two foes: the target follows the one struck', () => {
  const target = new FoeTarget();
  const [first, second] = [foe(3), foe(4)];
  target.step(frameOf([first, second], [struck(PLAYER, 3)]), 0);
  assert.equal(target.step(frameOf([first, second], [struck(PLAYER, 4)]), 0)?.id, 4);
});

test('a foe winding up at the player takes the target unless they struck another in the last 2 s; its own threat refreshes it', () => {
  assert.equal(THREAT_YIELD_SECONDS, 2);
  const target = new FoeTarget();
  const orc = foe(5, { action: windUp, target: PLAYER });
  const rat = foe(6);
  assert.equal(target.step(frameOf([orc, rat]), 0)?.id, 5, 'nothing struck: the threat takes it');
  target.step(frameOf([foe(5), rat], [struck(PLAYER, 6)]), 0);
  assert.equal(target.step(frameOf([orc, rat]), 0)?.id, 6, 'the rat struck this instant keeps it');
  target.step(frameOf([foe(5), rat]), 1.9);
  assert.equal(target.step(frameOf([orc, rat]), 0)?.id, 6, 'and 1.9 s on');
  target.step(frameOf([foe(5), rat]), 0.15);
  assert.equal(target.step(frameOf([orc, rat]), 0)?.id, 5, 'past 2 s the threat takes it');
  target.step(frameOf([foe(5), rat]), TARGET_SECONDS - 1);
  target.step(frameOf([orc, rat]), 0);
  assert.equal(target.step(frameOf([foe(5), rat]), TARGET_SECONDS - 1)?.id, 5, 'a second wind-up keeps it up');
  const ghost = foe(8, { action: { kind: 'dead', elapsed: 0 }, target: PLAYER });
  const quiet = new FoeTarget();
  assert.equal(quiet.step(frameOf([ghost]), 0), null, 'a dead foe takes nothing');
  assert.equal(quiet.step(frameOf([foe(9, { action: windUp, target: 2 })]), 0), null, 'nor a wind-up at another');
});

test('the soft lock taking a foe makes it the target', () => {
  const target = new FoeTarget();
  assert.equal(target.step(frameOf([foe(4)], [], 4), 0)?.id, 4);
});

test('the foes fought in the last minute, struck or struck by, are known; a minute on they are not', () => {
  const target = new FoeTarget();
  const foes = [foe(2), foe(3), foe(4)];
  target.step(frameOf(foes, [struck(PLAYER, 2, EVENT.blocked), struck(3, PLAYER), struck(4, 2)]), 0);
  target.step(frameOf(foes), TARGET_SECONDS + 1);
  assert.deepEqual(
    [2, 3, 4].map((id) => target.foughtWith(id)),
    [true, true, false],
  );
  target.step(frameOf(foes), FOUGHT_SECONDS - TARGET_SECONDS - 2);
  assert.equal(target.foughtWith(3), true);
  target.step(frameOf(foes), 1);
  assert.equal(target.foughtWith(3), false, 'a minute on, no longer fought');
});
