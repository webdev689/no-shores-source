import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Action, FighterView } from '../rules/fighters.ts';
import { FIGHT_TICKS, fightOf, foeDoing, struckProgress } from './fightMoves.ts';
import { foeDress } from './foeDress.ts';
import type { FoeType } from '../rules/roster.ts';
import { shownMove } from './playerMoves.ts';

const standing: FighterView = {
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
  target: null,
  action: { kind: 'idle' },
};
const doing = (action: Action) => ({ ...standing, action });
/** The pirates' swordsman, with a sword and a kite shield, as the rules' roster has it. */
const swordsman: FoeType = {
  type: 14,
  name: 'Swordsman',
  faction: 2,
  factionName: 'Pirates',
  domain: 'deck',
  role: 2,
  ranks: [1, 2],
  right: 'sword_steel',
  left: 'shield_kite_steel',
};
const lunge = (elapsed: number, iron: boolean): Action => ({
  kind: 'telegraph',
  shape: 'lunge',
  elapsed,
  windup: 42,
  origin: [1, 2, 0.5],
  bearing: Math.PI / 2,
  ahead: 0,
  iron,
  feintAt: null,
});

test('a fighter’s action holds its figure to the forge’s own moves', () => {
  const draws = () => true;
  const frames = (anim: string) => ({ death: 6, jump: 3, parry: 3, thrust: 6 })[anim] ?? 1;
  const dress = foeDress(swordsman);
  assert.ok(dress);
  const shown = (action: Action) => shownMove(foeDoing(doing(action), null, dress, 1 / 60), frames, draws);
  assert.deepEqual(shown({ kind: 'dead', elapsed: 24 }), { anim: 'death', frame: 3, frameSeconds: 0 });
  assert.equal(shown({ kind: 'dead', elapsed: 90 }).anim, 'fallen');
  assert.equal(shown({ kind: 'staggered', left: 20, cause: 'parried' }).anim, 'hurt');
  assert.equal(shown({ kind: 'guard', elapsed: 5, window: 12 }).anim, 'block', 'a shield in the left hand blocks');
  assert.equal(shown({ kind: 'parry', elapsed: 9 }).anim, 'block');
  const windup = lunge(10, false);
  assert.deepEqual(shown(windup), { anim: 'thrust', frame: 0, frameSeconds: 0 });
  assert.equal(fightOf(doing({ kind: 'idle' })), null);
  const swinging = foeDoing(
    doing({ kind: 'attack', stroke: 6, elapsed: 30, strike: 24, end: 60, swing: 'plain', leftHand: false }),
    null,
    dress,
    1 / 60,
  );
  assert.deepEqual(swinging.blow, { direction: 'up', second: true, progress: 0.5, lands: 0.4 });
});

test("a foe's dodge rolls through its span where the forge draws the roll; else the jump shows only in the air", () => {
  const dress = foeDress(swordsman);
  assert.ok(dress);
  const frames = (anim: string) => ({ jump: 3, roll: 6 })[anim] ?? 1;
  const hop = (elapsed: number, z: number, zBefore: number, mode: FighterView['mode'], roll = false) => {
    const dodging = { ...standing, mode, z, action: { kind: 'dodge', elapsed, toward: [1, 0] } as Action };
    const draws = (anim: string) => roll || anim !== 'roll';
    return shownMove(foeDoing(dodging, { ...dodging, z: zBefore }, dress, 1 / 60), frames, draws);
  };
  assert.deepEqual(hop(9, 0.4, 0.4, 'air', true), { anim: 'roll', frame: 2, frameSeconds: 0 });
  assert.equal(hop(20, 0, 0, 'ground', true).anim, 'roll', 'its last ticks on the ground roll on');
  assert.deepEqual(hop(2, 0.1, 0.05, 'air'), { anim: 'jump', frame: 0, frameSeconds: 0 });
  assert.equal(hop(9, 0.4, 0.4, 'air').frame, 1);
  assert.equal(hop(16, 0.1, 0.15, 'air').frame, 2);
  const resting = shownMove(foeDoing(standing, standing, dress, 1 / 60), frames, () => true);
  assert.deepEqual(hop(20, 0, 0, 'ground'), resting, 'with no roll, its last ticks are on the ground');
});

test('a foe that moved over a snapshot of several ticks walks at its own pace, not their sum', () => {
  const dress = foeDress(swordsman);
  assert.ok(dress);
  // Walking at 3 m/s: 0.15 m over the three ticks between two snapshots.
  const walked = foeDoing({ ...standing, x: 0.15 }, standing, dress, 3 / 60);
  assert.deepEqual([walked.moving, walked.running, Math.round(walked.speed * 100) / 100], [true, false, 3]);
});

test('a flinch plays its hurt frames once; a stagger reels through them forth and back; a Charge holds still', () => {
  assert.equal(struckProgress('flinch', FIGHT_TICKS.flinch), 0);
  assert.ok(struckProgress('flinch', 5) > struckProgress('flinch', 10));
  assert.equal(struckProgress('flinch', 0), 1);
  const reel = Array.from({ length: 25 }, (_unused, tick) => struckProgress('staggered', 72 - tick));
  assert.ok(Math.max(...reel) > 0.9 && Math.min(...reel) < 0.1, 'it reaches both ends');
  assert.ok(reel.every((share) => share >= 0 && share < 1));
  assert.equal(struckProgress('staggered', 40, true), 0);
  const frames = (anim: string) => (anim === 'hurt' ? 3 : 1);
  const dress = foeDress(swordsman);
  assert.ok(dress);
  const hurtFrames = new Set(
    Array.from({ length: 24 }, (_unused, tick) => {
      const action = { kind: 'staggered', left: 60 - tick, cause: 'poise' } as const;
      return shownMove(foeDoing(doing(action), null, dress, 1 / 60), frames, () => true).frame;
    }),
  );
  assert.deepEqual([...hurtFrames].sort(), [0, 1, 2], 'a staggered figure moves');
});
