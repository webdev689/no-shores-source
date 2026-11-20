import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FightEvent } from '../network/messages.ts';
import type { Action, FighterView } from '../rules/fighters.ts';
import { EVENT } from './cues.ts';
import { FoeTarget, TARGET_FADE_SECONDS, TARGET_SECONDS, type TargetFoe, THREAT_YIELD_SECONDS } from './foeTarget.ts';

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
  assert.equal(target.foughtShare(5), 0, 'the target, but no blow traded: no plate held by the fight');
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

test('a stroke striking several keeps the target on the lock’s foe among them, else on the first it struck alive', () => {
  const foes = [foe(3), foe(4), foe(5)];
  const locked = new FoeTarget();
  locked.step(frameOf(foes, [], 3), 0);
  const sweep = [struck(PLAYER, 4), struck(PLAYER, 3), struck(PLAYER, 5)];
  assert.equal(locked.step(frameOf(foes, sweep, 3), 0)?.id, 3, 'the lock’s, wherever it stands among them');
  assert.deepEqual(
    [3, 4, 5].map((id) => locked.foughtShare(id)),
    [1, 1, 1],
    'all of them fought',
  );
  const free = new FoeTarget();
  assert.equal(free.step(frameOf(foes, [struck(PLAYER, 4), struck(PLAYER, 5)]), 0)?.id, 4, 'the first struck');
  const slain = [foe(3), foe(4, { action: { kind: 'dead', elapsed: 0 } }), foe(5)];
  const after = new FoeTarget();
  const killing = [struck(PLAYER, 4), struck(PLAYER, 4, EVENT.killed), struck(PLAYER, 5)];
  assert.equal(after.step(frameOf(slain, killing), 0)?.id, 5, 'the first slain, the next struck alive');
});

test('a foe fought, struck or struck by, holds its plate as long as the target plate stands, fading as it fades', () => {
  const target = new FoeTarget();
  const foes = [foe(2), foe(3), foe(4)];
  target.step(frameOf(foes, [struck(PLAYER, 2, EVENT.blocked), struck(3, PLAYER), struck(4, 2)]), 0);
  assert.deepEqual(
    [2, 3, 4].map((id) => target.foughtShare(id)),
    [1, 1, 0],
    'a blow between two foes is no fight of the player’s',
  );
  target.step(frameOf(foes), TARGET_SECONDS - TARGET_FADE_SECONDS);
  assert.equal(target.foughtShare(3), 1, 'whole until the fade');
  target.step(frameOf(foes), TARGET_FADE_SECONDS / 2);
  assert.equal(target.foughtShare(3), 0.5, 'half way through the fade');
  assert.equal(target.foughtShare(2), 0.5, 'the target fades alike');
  target.step(frameOf(foes, [struck(3, PLAYER)]), TARGET_FADE_SECONDS / 4);
  assert.equal(target.foughtShare(3), 1, 'another blow holds it whole again');
  target.step(frameOf(foes), TARGET_SECONDS);
  assert.deepEqual(
    [2, 3].map((id) => target.foughtShare(id)),
    [0, 0],
    'the fight moved on',
  );
});

test('a foe the player asked for, standing up, is neither struck nor fought; nor one feinting at them', () => {
  const target = new FoeTarget();
  const SPAWNED = 11;
  const asked = target.step(frameOf([foe(4)], [struck(PLAYER, 4, SPAWNED), struck(4, PLAYER, EVENT.feinted)]), 0);
  assert.equal(asked, null);
  assert.equal(target.foughtShare(4), 0);
});
