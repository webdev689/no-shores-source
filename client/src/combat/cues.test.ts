import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FightEvent } from '../network/messages.ts';
import type { Action, FighterView } from '../rules/fighters.ts';
import { EVENT, edgeArrow, parryCue, threatens, wordOf } from './cues.ts';

const PLAYER = 1;
const FOE = 40;
const OTHER = 2;
const RIPOSTE = 2;
const COUNTER = 3;
const event = (kind: number, striker: number, defender: number, how = 1, amount = 0): FightEvent => ({
  tick: 0n,
  kind,
  how,
  striker,
  defender,
  amount,
  stroke: 0,
});
const said = (told: FightEvent) => wordOf(told, PLAYER);

test('a word’s tone is whether it is good or bad for the player, whoever struck', () => {
  assert.deepEqual(said(event(EVENT.hit, FOE, PLAYER, RIPOSTE, 30)), { text: 'Riposte 30', tone: 'taken' });
  assert.deepEqual(said(event(EVENT.hit, FOE, PLAYER, COUNTER, 21)), { text: 'Counter 21', tone: 'taken' });
  assert.deepEqual(said(event(EVENT.hit, PLAYER, FOE, RIPOSTE, 30)), { text: 'Riposte 30', tone: 'great' });
  assert.deepEqual(said(event(EVENT.hit, PLAYER, FOE, 1, 14)), { text: '14', tone: 'dealt' });
  assert.deepEqual(said(event(EVENT.hit, FOE, PLAYER, 1, 14)), { text: '14', tone: 'taken' });
  assert.deepEqual(said(event(EVENT.perfect, PLAYER, FOE)), { text: 'Perfect dodge!', tone: 'taken' });
  assert.deepEqual(said(event(EVENT.perfect, FOE, PLAYER)), { text: 'Perfect dodge!', tone: 'great' });
  assert.deepEqual(said(event(EVENT.killed, FOE, PLAYER)), { text: 'Slain', tone: 'taken' });
  assert.deepEqual(said(event(EVENT.killed, PLAYER, FOE)), { text: 'Slain', tone: 'great' });
  assert.deepEqual(said(event(EVENT.guardBroken, PLAYER, FOE)), { text: 'Guard broken', tone: 'great' });
  assert.deepEqual(said(event(EVENT.guardBroken, FOE, PLAYER)), { text: 'Guard broken', tone: 'taken' });
  assert.deepEqual(said(event(EVENT.parried, FOE, PLAYER)), { text: 'Parry!', tone: 'great' });
  assert.deepEqual(said(event(EVENT.parried, PLAYER, FOE)), { text: 'Parried', tone: 'taken' });
  assert.deepEqual(said(event(EVENT.blocked, FOE, PLAYER)), { text: 'Blocked', tone: 'good' });
  assert.deepEqual(said(event(EVENT.staggered, PLAYER, FOE)), { text: 'Staggered', tone: 'great' });
  assert.deepEqual(said(event(EVENT.killed, FOE, OTHER)), { text: 'Slain', tone: 'plain' });
  assert.equal(said(event(99, FOE, PLAYER)), null);
});

const foe = (action: Action, target: number | null): FighterView => ({
  x: 0,
  y: 0,
  z: 0,
  facing: 0,
  mode: 'ground',
  crouched: false,
  aim: 0,
  side: 'foes',
  arms: 0,
  health: 70,
  healthMax: 70,
  stamina: 100,
  poise: 0,
  poiseMax: 35,
  target,
  action,
});

test("a parry ring closes as a foe's blow at the player comes down, iron and shots show none to time", () => {
  const swing: Action = { kind: 'attack', stroke: 1, elapsed: 6, strike: 24, end: 60, swing: 'plain', leftHand: false };
  assert.deepEqual(parryCue(foe(swing, PLAYER), PLAYER), { share: 0.75, now: false });
  assert.deepEqual(parryCue(foe({ ...swing, elapsed: 13 }, PLAYER), PLAYER), { share: 11 / 24, now: true });
  assert.deepEqual(
    parryCue(foe({ ...swing, elapsed: 13 }, PLAYER), PLAYER, false),
    { share: 11 / 24, now: false },
    'a guard that could open no window is never told a press now would parry',
  );
  assert.equal(parryCue(foe({ ...swing, elapsed: 24 }, PLAYER), PLAYER), null, 'landed');
  assert.equal(parryCue(foe(swing, OTHER), PLAYER), null, 'at another');
  const windup = {
    kind: 'telegraph',
    shape: 'sweep',
    elapsed: 30,
    windup: 60,
    origin: [0, 0, 0],
    bearing: 0,
    ahead: 0,
    iron: false,
    feintAt: null,
  } as const;
  assert.deepEqual(parryCue(foe(windup, PLAYER), PLAYER), { share: 0.5, now: false });
  assert.equal(parryCue(foe({ ...windup, iron: true }, PLAYER), PLAYER), 'iron');
  assert.equal(parryCue(foe({ ...windup, shape: 'aimed' }, PLAYER), PLAYER), null, 'a shot is never parried');
});

test('a foe threatens the player while it swings, winds up or draws with the player its target', () => {
  const swing: Action = { kind: 'attack', stroke: 1, elapsed: 3, strike: 24, end: 60, swing: 'plain', leftHand: false };
  assert.equal(threatens(foe(swing, PLAYER), PLAYER), true);
  assert.equal(threatens(foe({ kind: 'draw', elapsed: 4 }, PLAYER), PLAYER), true);
  assert.equal(threatens(foe(swing, OTHER), PLAYER), false);
  assert.equal(threatens(foe({ kind: 'idle' }, PLAYER), PLAYER), false);
});

test('an arrow to a point off the screen stands at the edge it lies beyond, pointing at it; none for one on it', () => {
  assert.equal(edgeArrow([0.2, 0.1, 1], 800, 600, 20), null);
  const right = edgeArrow([3, 0, 1], 800, 600, 20);
  assert.deepEqual([right?.x, right?.y, Math.abs(right?.angle ?? 1)], [780, 300, 0]);
  const above = edgeArrow([0, 4, 1], 800, 600, 20);
  assert.deepEqual([above?.x, above?.y, above?.angle], [400, 20, -Math.PI / 2]);
  // Behind the camera and to its left: still the left edge.
  const behind = edgeArrow([-2, 0, -1], 800, 600, 20);
  assert.deepEqual([behind?.x, behind?.y], [20, 300]);
  const straightBehind = edgeArrow([0, 0, -1], 800, 600, 20);
  assert.deepEqual([straightBehind?.x, straightBehind?.y], [400, 580]);
});

test('a shield’s share of a blow is told in its own tone; a blow it held whole numbers no health', () => {
  assert.deepEqual(said(event(EVENT.shielded, PLAYER, FOE, 1, 42.4)), { text: '42', tone: 'shield' });
  assert.equal(said(event(EVENT.hit, PLAYER, FOE, 1, 0)), null);
  assert.deepEqual(said(event(EVENT.shieldBroken, PLAYER, FOE)), { text: 'Shield broken', tone: 'great' });
});
