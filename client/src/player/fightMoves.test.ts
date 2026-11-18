import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Action, FighterView } from '../rules/fighters.ts';
import { fightButtons, fightHands, fightOf, foeDoing, guardPose } from './fightMoves.ts';
import { FOE_KINDS } from './foeKinds.ts';
import type { Action as Control, InputFrame } from './input.ts';
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
  const dress = FOE_KINDS.find((kind) => kind.name === 'Swordsman')?.dress;
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
  const dress = FOE_KINDS.find((kind) => kind.name === 'Swordsman')?.dress;
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
  const dress = FOE_KINDS.find((kind) => kind.name === 'Swordsman')?.dress;
  assert.ok(dress);
  // Walking at 3 m/s: 0.15 m over the three ticks between two snapshots.
  const walked = foeDoing({ ...standing, x: 0.15 }, standing, dress, 3 / 60);
  assert.deepEqual([walked.moving, walked.running, Math.round(walked.speed * 100) / 100], [true, false, 3]);
});

/** A frame with these controls held, and those pressed this frame, the pointer held or not. */
const controls = (held: Control[], pressed: Control[] = [], locked = true): InputFrame => ({
  held: (action) => held.includes(action) || pressed.includes(action),
  pressed: (action) => pressed.includes(action),
  released: () => false,
  lookX: 0,
  lookY: 0,
  wheel: 0,
  locked,
});
const onFoot = { body: { mode: 'ground' }, mounted: false };

test('a sword drawn swings on the right button, guards on the left and dodges; put away, it only guards and dodges', () => {
  const pressing = controls(['guard'], ['swing', 'dodge']);
  const drawn = fightHands(pressing, onFoot, true, 'sword_iron');
  const buttons = fightButtons(pressing, drawn, 0.2, null);
  assert.deepEqual(
    [buttons.swing, buttons.swingPressed, buttons.guard, buttons.shoot, buttons.dodge, buttons.pitch, buttons.aim],
    [true, true, true, false, true, -0.2, false],
  );
  const away = fightButtons(pressing, fightHands(pressing, onFoot, false, 'sword_iron'), 0, null);
  assert.deepEqual(
    [away.swing, away.guard, away.dodge],
    [false, true, true],
    'the click that readies it does not swing',
  );
  const riding = fightHands(pressing, { ...onFoot, mounted: true }, true, 'sword_iron');
  assert.deepEqual([riding.armed, riding.guards], [false, false], 'in the saddle, no swing and no guard');
  const free = fightButtons(controls(['guard'], ['swing'], false), drawn, 0, null);
  assert.deepEqual([free.guard, free.dodge], [true, false], 'the hands as given: no dodge with the pointer free');
});

test('a bow drawn aims on the right button and fires on the left, with no guard behind it', () => {
  const pressing = controls(['swing'], ['guard']);
  const hands = fightHands(pressing, onFoot, true, 'bow_long');
  assert.deepEqual([hands.shooter, hands.ranged, hands.aiming, hands.guards], [true, true, true, false]);
  const mark = [1, 2, 3] as const;
  const buttons = fightButtons(pressing, hands, 0, mark);
  assert.deepEqual(
    [buttons.swing, buttons.shoot, buttons.shootPressed, buttons.guard, buttons.aim, buttons.mark],
    [false, true, true, false, true, mark],
  );
});

test('the first person holds a guard, and plays a parry through its deflect', () => {
  assert.deepEqual(guardPose({ kind: 'guard', elapsed: 4, window: 0 }), { record: 3, frame: 2 });
  assert.equal(guardPose({ kind: 'parry', elapsed: 0 })?.frame, 1);
  assert.equal(guardPose({ kind: 'parry', elapsed: 17 })?.frame, 3);
  assert.equal(guardPose({ kind: 'idle' }), null);
});
