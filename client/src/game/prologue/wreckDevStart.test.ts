import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AbilityState } from '../../combat/abilityBar.ts';
import type { FighterView } from '../../rules/fighters.ts';
import { teachable } from './stormTeaching.ts';
import { devStart, lashBoarder } from './wreckDevStart.ts';

const READY: AbilityState = { art: 1, animaShare: 1, tenets: [1, 1], earned: 0b111, recharge: 1 };
const view = (fields: Partial<FighterView>): FighterView =>
  ({
    x: 0,
    y: 0,
    z: 0,
    aim: 0,
    side: 'players',
    health: 100,
    healthMax: 100,
    mode: 'ground',
    action: { kind: 'idle' },
    ...fields,
  }) as FighterView;

test('a page under development begins the wreck at the wisp, the bow or the Storm as its address asks', () => {
  assert.deepEqual(devStart('?prologue=wreck&wisp=1'), { stage: 'wisp', wispInto: 0 });
  assert.deepEqual(devStart('?prologue=wreck&wisp=9'), { stage: 'wisp', wispInto: 8 });
  assert.deepEqual(devStart('?prologue=wreck&bow=1'), { stage: 'bow', wispInto: 0 });
  assert.deepEqual(devStart('?prologue=wreck&lash=1'), { stage: 'storm', wispInto: 0 });
  assert.equal(devStart('?prologue=wreck'), null);
  assert.equal(devStart('?prologue=wreck&wisp=0'), null);
});

test('a start at the Storm stands the boarder in Arc Lash’s reach and cone, facing the player', () => {
  const player = view({ x: 2, y: 3, aim: 0.6 });
  const { at, facing } = lashBoarder(2, 3, 0.6);
  const boarder = view({ x: at[0], y: at[1], side: 'foes', facing });
  assert.ok(teachable('arcLash', player, [boarder], READY));
  assert.ok(Math.abs(Math.cos(facing - Math.atan2(2 - at[0], -(3 - at[1])))) > 0.99, 'facing them');
});
