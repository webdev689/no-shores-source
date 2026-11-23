import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AbilityState } from '../../combat/abilityBar.ts';
import type { FighterView } from '../../rules/fighters.ts';
import { teachable } from './stormTeaching.ts';
import { slotOf } from '../../player/gear.ts';
import { Arming, beginAt, devStart, lashBoarder } from './wreckDevStart.ts';
import { BOW, SWORD_AND_SHIELD } from './wreckTeaching.ts';

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

test('a start at the bow lays it before the player on their own deck, where they see it', async () => {
  const { readWreck, topAt, courseOf } = await import('./wreckLayout.ts');
  const layout = readWreck();
  const [x, y] = layout.wake.at;
  const dropped: (readonly number[])[] = [];
  const run = { storyArms: { dropBow: (fell: readonly number[]) => dropped.push(fell) } } as never;
  beginAt({ stage: 'bow', wispInto: 0 }, run, layout, { x, y, facing: layout.wake.facing });
  const [fell = []] = dropped;
  const deck = topAt(courseOf(layout), x, y);
  assert.ok(Math.abs((fell[2] ?? 0) - deck) < 0.3, `on their deck: ${fell[2]} against ${deck}`);
  const apart = Math.hypot((fell[0] ?? 0) - x, (fell[1] ?? 0) - y);
  assert.ok(apart >= 2 && apart <= 3, `${apart.toFixed(1)} m before them`);
});

test('a start armed takes up the sword and shield and the bow and wears each as it comes, asking once', () => {
  assert.deepEqual(devStart('?prologue=wreck&armed=1'), { stage: 'bow', wispInto: 0, armed: true });
  const taken: number[] = [];
  const worn: { item?: number; slot?: number }[] = [];
  const run = {
    gear: null as { items: { id: number; kind: number; at: number }[] } | null,
    openRoom: { story: (ask: { kind: number }) => (taken.push(ask.kind), Promise.resolve(1)) },
    fight: { askGear: (ask: { item?: number; slot?: number }) => worn.push(ask) },
  };
  const arming = new Arming();
  arming.step(run as never);
  arming.step(run as never);
  assert.deepEqual(taken, [SWORD_AND_SHIELD, BOW], 'each taken up once');
  run.gear = {
    items: [
      { id: 7, kind: SWORD_AND_SHIELD, at: 0 },
      { id: 8, kind: BOW, at: 0 },
    ],
  };
  arming.step(run as never);
  arming.step(run as never);
  assert.deepEqual(
    worn.map((ask) => [ask.item, ask.slot]),
    [
      [7, slotOf(SWORD_AND_SHIELD)],
      [8, slotOf(BOW)],
    ],
    'each worn once, in its own slot',
  );
  assert.equal(taken.length, 2);
});
