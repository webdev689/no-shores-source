import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FighterView } from '../rules/fighters.ts';
import { LOSS_DRAIN, LOSS_HOLD, LOSS_HOLD_MOST, type Loss, stepLoss } from './meter.ts';
import { onFakePage } from './page.test.ts';
import { calmFor, healthLow, LOW_HEALTH, REST_SECONDS, Vitals, vitalOf, vitalsOf, vitalsWhole } from './vitals.ts';

const fighter: FighterView = {
  x: 0,
  y: 0,
  z: 0,
  facing: 0,
  mode: 'ground',
  crouched: false,
  aim: 0,
  side: 'players',
  arms: 0,
  health: 150,
  healthMax: 200,
  stamina: 42,
  poise: 7,
  poiseMax: 35,
  target: null,
  action: { kind: 'idle' },
};

test('the panel writes each vital as a percentage of its whole: health of its most, stamina of 100, poise taken', () => {
  assert.deepEqual(vitalsOf(fighter), {
    health: { share: 0.75, text: '75%' },
    stamina: { share: 0.42, text: '42%' },
    poise: { share: 0.2, text: '20%' },
  });
  assert.deepEqual(
    vitalsOf(null),
    {
      health: { share: 1, text: '100%' },
      stamina: { share: 1, text: '100%' },
      poise: { share: 0, text: '0%' },
    },
    'before the fighter comes: full, and no poise taken',
  );
});

test('a percentage is never 0% while anything is left, and never over 100%', () => {
  assert.equal(vitalOf(0.2, 200).text, '1%');
  assert.equal(vitalOf(0, 200).text, '0%');
  assert.equal(vitalOf(-3, 200).text, '0%');
  assert.deepEqual(vitalOf(260, 200), { share: 1, text: '100%' });
  assert.equal(vitalOf(99.6, 100).text, '100%');
});

test('the health warns once it is a quarter or less, but not at none', () => {
  assert.equal(LOW_HEALTH, 0.25);
  assert.equal(healthLow({ ...fighter, health: 50 }), true);
  assert.equal(healthLow({ ...fighter, health: 51 }), false);
  assert.equal(healthLow({ ...fighter, health: 0 }), false);
  assert.equal(healthLow(null), false);
});

test('the lost strip holds where the bar stood after a loss, then drains to it', () => {
  const full = stepLoss(null, 1, 0);
  const struck = stepLoss(full, 0.6, 1 / 60);
  assert.deepEqual([struck.at, struck.share], [1, 0.6], 'it holds at the bar’s old place');
  let strip: Loss = struck;
  for (let elapsed = 0; elapsed < LOSS_HOLD - 0.05; elapsed += 0.05) strip = stepLoss(strip, 0.6, 0.05);
  assert.equal(strip.at, 1, 'still held within the hold');
  strip = stepLoss(stepLoss(strip, 0.6, 0.1), 0.6, 0.1);
  assert.ok(strip.at < 1 && strip.at >= 1 - LOSS_DRAIN * 0.1 - 1e-9, `draining: ${strip.at}`);
  for (let frame = 0; frame < 120; frame++) strip = stepLoss(strip, 0.6, 1 / 60);
  assert.equal(strip.at, 0.6, 'drained down to the bar');
  assert.equal(stepLoss(strip, 0.9, 1 / 60).at, 0.9, 'a gain sets it on the bar');
});

test('losses coming every frame still let the strip drain once it has stood its longest', () => {
  let strip = stepLoss(null, 1, 0);
  let share = 1;
  for (let elapsed = 0; elapsed < LOSS_HOLD_MOST + 0.5; elapsed += 1 / 60) {
    share -= 0.001;
    strip = stepLoss(strip, share, 1 / 60);
  }
  assert.ok(strip.at < 1, `drains under a trickle of harm: ${strip.at}`);
});

test('the vitals rest once whole and untouched for four seconds with no foe on the target plate, back at the first loss', () => {
  assert.equal(REST_SECONDS, 4);
  const whole = { ...fighter, health: 200, stamina: 100, poise: 0 };
  assert.equal(vitalsWhole(whole), true);
  assert.equal(vitalsWhole({ ...whole, health: 199.5 }), true, 'short of no whole point');
  assert.equal(vitalsWhole({ ...whole, health: 199 }), false);
  assert.equal(vitalsWhole({ ...whole, stamina: 98 }), false, 'a swing spent');
  assert.equal(vitalsWhole({ ...whole, poise: 2 }), false, 'poise taken');
  assert.equal(calmFor(3, true, false, 0.5), 3.5);
  assert.equal(calmFor(3, true, true, 0.5), 0, 'a foe on the target plate');
  assert.equal(calmFor(3, false, false, 0.5), 0);
  onFakePage((root) => {
    const vitals = new Vitals(root);
    for (let frame = 0; frame < 9; frame++) vitals.update(whole, 0.5, false, false);
    assert.equal(vitals.root.classList.contains('rest'), true, 'at rest');
    vitals.update({ ...whole, health: 150 }, 1 / 60, false, false);
    assert.equal(vitals.root.classList.contains('rest'), false, 'back at once');
  });
});
