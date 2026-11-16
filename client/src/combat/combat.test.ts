import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shownMove } from '../testground/playerMoves.ts';
import type { Action, FighterView } from './fighter.ts';
import { fightOf, foeDoing } from './fightMoves.ts';
import { FOE_KINDS } from './foeKinds.ts';
import { project } from './hud.ts';
import { MARK_FLOATS, type TelegraphMark, marksMesh } from './marks.ts';

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

test('a telegraphed blow is marked on the ground where its shape lies, filling as it winds up, red when iron', () => {
  const early = marksMesh([lunge(4, false)], []);
  const late = marksMesh([lunge(40, true)], []);
  assert.equal(early.length % MARK_FLOATS, 0);
  const vertices = (mesh: Float32Array) =>
    Array.from({ length: mesh.length / MARK_FLOATS }, (unused, index) =>
      mesh.subarray(index * MARK_FLOATS, (index + 1) * MARK_FLOATS),
    );
  for (const vertex of vertices(late)) {
    assert.ok(Math.abs((vertex[2] ?? 0) - 0.53) < 1e-6, 'a little over the ground it stands on');
    assert.ok((vertex[0] ?? 0) >= 1 - 0.3 - 1e-6 && (vertex[0] ?? 0) <= 1 + 4.5 + 1e-6, 'along its lane, east');
    assert.ok(Math.abs((vertex[1] ?? 0) - 2) <= 0.6 + 1e-6);
  }
  const reach = (mesh: Float32Array) => Math.max(...vertices(mesh).map((vertex) => vertex[0] ?? 0));
  assert.ok(reach(late) >= 5.4, 'its edge marks the whole lane from the start');
  const red = vertices(late).every((vertex) => (vertex[3] ?? 0) > 0.9 && (vertex[4] ?? 0) < 0.2);
  assert.ok(red, 'iron is red');
  assert.ok((vertices(late)[0]?.[6] ?? 0) > (vertices(early)[0]?.[6] ?? 0), 'brighter in its last stretch');
  const arrow = marksMesh([], [{ owner: 3, ranged: 1, at: [0, 0, 1], velocity: [45, 0, 0] }]);
  assert.equal(arrow.length, 12 * MARK_FLOATS, 'an arrow is two crossed strips');
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

test('a point projects through the camera onto the canvas, and nothing behind it does', () => {
  const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  assert.deepEqual(project(identity, [0, 0, 0.5], 800, 600), { x: 400, y: 300 });
  assert.deepEqual(project(identity, [1, 1, 0.5], 800, 600), { x: 800, y: 0 });
  const behind = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1]);
  assert.equal(project(behind, [0, 0, 0], 800, 600), null);
});
