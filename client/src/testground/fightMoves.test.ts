import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Action, FighterView } from '../rules/fighters.ts';
import { fightOf, foeDoing } from './fightMoves.ts';
import { FOE_KINDS } from './foeKinds.ts';
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
const lunge = (elapsed: number, iron: boolean): TelegraphMark => ({
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
  const dress = FOE_KINDS.find((kind) => kind.name === 'Swordsman')?.dress;
  assert.ok(dress);
  const shown = (action: Action) => shownMove(foeDoing(doing(action), null, dress, 1 / 60), frames, draws);
  assert.deepEqual(shown({ kind: 'dead', elapsed: 24 }), { anim: 'death', frame: 3, frameSeconds: 0 });
  assert.equal(shown({ kind: 'dead', elapsed: 90 }).anim, 'fallen');
  assert.equal(shown({ kind: 'staggered', left: 20, cause: 'parried' }).anim, 'hurt');
  assert.deepEqual(shown({ kind: 'dodge', elapsed: 2, toward: [1, 0] }), { anim: 'jump', frame: 0, frameSeconds: 0 });
  assert.equal(shown({ kind: 'dodge', elapsed: 12, toward: [1, 0] }).frame, 1);
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
  assert.deepEqual(swinging.blow, { direction: 'up', second: true, progress: 0.5 });
});
