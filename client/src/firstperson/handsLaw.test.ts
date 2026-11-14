import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  BARE_HANDS,
  FLURRY_WINDOW,
  fistGuard,
  guardStep,
  handsPlan,
  holdingOf,
  mirrorStrike,
  strikeHandOf,
  strikePicture,
} from './handsLaw.ts';
import { RECORD_OF } from './weaponMachine.ts';

test('a layer is read as what the hand holds: a gun, a crossbow, a shield, a light or a weapon', () => {
  assert.deepEqual(holdingOf('pistolet_gilded_l'), {
    kind: 'shooter',
    shooter: { kind: 'pistolet', metal: null, gilded: true },
  });
  assert.deepEqual(holdingOf('crossbow_elven'), {
    kind: 'shooter',
    shooter: { kind: 'crossbow', metal: 'Elven', gilded: false },
  });
  assert.deepEqual(holdingOf('shield_kite_daedric'), { kind: 'shield', archive: 112362, metal: 'Daedric' });
  assert.deepEqual(holdingOf('shield_buckler_plain'), { kind: 'shield', archive: 112360, metal: null });
  assert.deepEqual(holdingOf('torch_l'), { kind: 'light', light: 'torch' });
  assert.deepEqual(holdingOf('lantern'), { kind: 'light', light: 'lantern' });
  assert.equal(holdingOf('sword_iron_l')?.kind, 'weapon');
  assert.equal(holdingOf('quiver'), null);
});

test('two one-handed weapons are a pair, two guns of a kind a volley, empty hands both fists', () => {
  const pair = handsPlan('sword_iron', 'dagger_ebony_l');
  assert.deepEqual([pair.pair, pair.volley, pair.right?.kind, pair.left?.kind], [true, false, 'weapon', 'weapon']);
  const brace = handsPlan('pistolet', 'pistolet_gilded_l');
  assert.deepEqual([brace.pair, brace.volley], [true, true]);
  const mixed = handsPlan('mace_steel', 'pistolet_l');
  assert.deepEqual([mixed.pair, mixed.volley], [true, false]);
  assert.deepEqual(handsPlan(null, null), {
    right: BARE_HANDS,
    left: BARE_HANDS,
    pair: true,
    volley: false,
    held: null,
  });
});

test('a two-hander, or a gun beside a crossbow, leaves the right hand alone at it', () => {
  for (const [right, left] of [
    ['bow_long_iron', 'sword_iron_l'],
    ['thunderlock', 'pistolet_l'],
    ['axe_iron', 'shield_kite_iron'],
    ['pistolet', 'crossbow_iron'],
  ] as const) {
    const plan = handsPlan(right, left);
    assert.deepEqual([plan.pair, plan.left, plan.held], [false, null, null], `${right} and ${left}`);
  }
});

test('a shield or a light is held in the left beside a one-handed weapon or a fist', () => {
  const shielded = handsPlan('sword_iron', 'shield_round_iron');
  assert.deepEqual([shielded.right?.kind, shielded.held?.kind, shielded.pair], ['weapon', 'shield', false]);
  const lit = handsPlan(null, 'torch_l');
  assert.deepEqual([lit.right, lit.held?.kind], [BARE_HANDS, 'light']);
  const alone = handsPlan(null, 'sword_iron_l');
  assert.deepEqual([alone.right, alone.left?.kind], [null, 'weapon']);
});

test('the lead opens; a blow begun within the flurry of the last is the other hand, after it the lead again', () => {
  assert.deepEqual(strikeHandOf(null, Infinity), { hand: 'right', flurry: false });
  assert.deepEqual(strikeHandOf('right', 0), { hand: 'left', flurry: true });
  assert.deepEqual(strikeHandOf('left', FLURRY_WINDOW), { hand: 'right', flurry: true });
  assert.deepEqual(strikeHandOf('left', FLURRY_WINDOW + 0.01), { hand: 'right', flurry: false });
  assert.deepEqual(strikeHandOf('right', FLURRY_WINDOW + 0.01), { hand: 'right', flurry: false });
});

test("a weapon's left hand draws the mirrored strike's record, mirrored, so it sweeps the way asked", () => {
  assert.equal(mirrorStrike('left'), 'right');
  assert.equal(mirrorStrike('up'), 'up');
  assert.deepEqual(strikePicture('right', 'left', false), { record: RECORD_OF.left, mirror: false });
  assert.deepEqual(strikePicture('left', 'left', false), { record: RECORD_OF.right, mirror: true });
  assert.deepEqual(strikePicture('left', null, false), { record: 0, mirror: true });
});

test("bare hands draw the arm Daggerfall painted on the striking hand's own side", () => {
  // The rest paints the right arm; the strike down (a kick) the left.
  assert.deepEqual(strikePicture('right', null, true), { record: 0, mirror: false });
  assert.deepEqual(strikePicture('left', 'down', true), { record: RECORD_OF.down, mirror: false });
  assert.deepEqual(strikePicture('right', 'down', true), { record: RECORD_OF.down, mirror: true });
  // The strike left paints the left arm, so a right hand throws the strike right's picture instead.
  assert.deepEqual(strikePicture('right', 'left', true), { record: RECORD_OF.right, mirror: false });
});

test('the guard draws in fast and lets go slower; a resting fist bounces only down', () => {
  const inward = guardStep(0, true, 0.05);
  const outward = guardStep(1, false, 0.05);
  assert.ok(inward > 1 - outward);
  for (let tenth = 0; tenth < 20; tenth++) {
    const { dy } = fistGuard(0, 'left', tenth / 10, true);
    assert.ok(dy >= 0 && dy <= 3.2 + 1e-9);
  }
  assert.deepEqual(fistGuard(1, 'right', 0, false), { dx: 10, dy: 9 });
});
