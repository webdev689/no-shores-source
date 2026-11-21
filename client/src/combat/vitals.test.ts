import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FighterView } from '../rules/fighters.ts';
import { LOSS_DRAIN, LOSS_HOLD, LOSS_HOLD_MOST, type Loss, stepLoss } from '../plus/barLoss.ts';
import { findAll, onFakePage } from './page.test.ts';
import {
  calmFor,
  CHARGE_FLASH_SECONDS,
  chargesShown,
  healthLow,
  LOW_HEALTH,
  REST_SECONDS,
  Vitals,
  vitalOf,
  vitalsOf,
  vitalsWhole,
} from './vitals.ts';

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

test('the vitals rest once whole and untouched for four seconds, every charge held and no foe on the target plate, back at the first loss', () => {
  assert.equal(REST_SECONDS, 4);
  const whole = { ...fighter, health: 200, stamina: 100, poise: 0 };
  assert.equal(vitalsWhole(whole), true);
  assert.equal(vitalsWhole({ ...whole, health: 199.5 }), true, 'short of no whole point');
  assert.equal(vitalsWhole({ ...whole, health: 199 }), false);
  assert.equal(vitalsWhole({ ...whole, stamina: 98 }), false, 'a swing spent');
  assert.equal(vitalsWhole({ ...whole, poise: 2 }), false, 'poise taken');
  assert.equal(vitalsWhole({ ...whole, charges: 2, meter: 0.9 }), false, 'a charge missing: they stay shown');
  assert.equal(vitalsWhole({ ...whole, charges: 3 }), true);
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

test('each bar is as long as what it holds, and tells a screen reader its name and how much of its most is left', () => {
  onFakePage((root) => {
    const vitals = new Vitals(root);
    vitals.lay(300, false);
    vitals.update(
      { ...fighter, health: 150, healthMax: 200, stamina: 42, poise: 7, poiseMax: 40 },
      1 / 60,
      false,
      false,
    );
    const [health, stamina, poise] = ['health', 'stamina', 'poise'].map((name) => findAll(root, 'vital', name)[0]);
    assert.deepEqual(
      [health?.style['width'], stamina?.style['width'], poise?.style['width']],
      ['300px', '150px', '60px'],
      'health 200 at the length, stamina 100 half of it, poise 40 a fifth',
    );
    const said = (bar: unknown) => {
      const { role, ariaLabel, ariaValueNow, ariaValueMax } = bar as Record<string, string>;
      return [role, ariaLabel, ariaValueNow, ariaValueMax];
    };
    assert.deepEqual(said(health), ['meter', 'Health', '150', '200']);
    assert.deepEqual(said(stamina), ['meter', 'Stamina', '42', '100']);
    assert.deepEqual(said(poise), ['meter', 'Poise', '7', '40']);
  });
});

test('poise says what holds the player beside its bar: filling says nothing, a stagger or an opening is named', () => {
  onFakePage((root) => {
    const vitals = new Vitals(root);
    const poise = findAll(root, 'vital', 'poise')[0];
    const word = () => findAll(root, 'poise-word')[0]?.textContent;
    vitals.update({ ...fighter, poise: 7 }, 1 / 60, false, false);
    assert.equal(poise?.classList.contains('poise-filling'), true);
    assert.equal(word(), '');
    vitals.update({ ...fighter, action: { kind: 'staggered', left: 30, cause: 'poise' } }, 1 / 60, false, false);
    assert.deepEqual(
      [poise?.classList.contains('poise-staggered'), poise?.classList.contains('poise-flash')],
      [true, true],
    );
    assert.equal(word(), 'Staggered');
    assert.equal((poise as unknown as Record<string, string>)['ariaValueText'], 'Staggered');
    vitals.update({ ...fighter, action: { kind: 'staggered', left: 20, cause: 'charged' } }, 1 / 60, false, false);
    assert.equal(word(), 'Charged');
    vitals.update({ ...fighter, action: { kind: 'overreach', left: 20 } }, 1 / 60, false, false);
    assert.deepEqual([poise?.classList.contains('poise-open'), word()], [true, 'Open']);
  });
});

test('health low marks its bar to flash blood, and a press with no stamina marks stamina’s to flash white', () => {
  onFakePage((root) => {
    const vitals = new Vitals(root);
    vitals.update({ ...fighter, health: 40 }, 1 / 60, true, false);
    assert.equal(findAll(root, 'vital', 'health', 'low').length, 1);
    assert.equal(findAll(root, 'vital', 'stamina', 'flash').length, 1);
    vitals.update(fighter, 1 / 60, false, false);
    assert.equal(findAll(root, 'low').length + findAll(root, 'flash').length, 0);
  });
});

test('the healing charges show as three diamonds, each held whole and the next filling by whole pixel rows, read as a meter', () => {
  assert.deepEqual(chargesShown({ ...fighter, charges: 1, meter: 0.4 }), {
    fills: [1, 0.4, 0],
    held: 1,
    text: '1 of 3, the next 40% filled',
  });
  assert.equal(chargesShown({ ...fighter, charges: 1, meter: 0.666 }).text, '1 of 3, the next 67% filled', 'rounded');
  assert.equal(chargesShown({ ...fighter, charges: 2, meter: 0.004 }).text, '2 of 3', 'none filled yet: not said');
  assert.deepEqual(chargesShown({ ...fighter, charges: 3, meter: 0.7 }), { fills: [1, 1, 1], held: 3, text: '3 of 3' });
  assert.deepEqual(chargesShown(null).fills, [1, 1, 1], 'before the fighter comes: all three');
  onFakePage((root) => {
    const vitals = new Vitals(root);
    vitals.update({ ...fighter, charges: 2, meter: 0.25 }, 1 / 60, false, false);
    const pips = findAll(root, 'drink');
    // A 12 px diamond holds 8 rows inside its frame: a quarter is 2 of them.
    assert.deepEqual(
      pips.map((pip) => [pip.classList.contains('full'), pip.style['--fill']]),
      [
        [true, '8px'],
        [true, '8px'],
        [false, '2px'],
      ],
    );
    vitals.lay(200, true);
    vitals.update({ ...fighter, charges: 2, meter: 0.25 }, 1 / 60, false, false);
    assert.equal(pips[2]?.style['--fill'], '3px', 'at the larger step, 12 rows');
    const { role, ariaLabel, ariaValueNow, ariaValueMax, ariaValueText } = findAll(
      root,
      'drinks',
    )[0] as unknown as Record<string, string>;
    assert.deepEqual(
      [role, ariaLabel, ariaValueNow, ariaValueMax, ariaValueText],
      ['meter', 'Healing charges', '2', '3', '2 of 3, the next 25% filled'],
      'a screen reader reads them as a meter',
    );
  });
});

test('a diamond flashes as its charge is gained or drunk, for a moment, and not before the first word', () => {
  onFakePage((root) => {
    const vitals = new Vitals(root);
    const lit = () => findAll(root, 'drink').map((pip) => pip.classList.contains('flash'));
    vitals.update({ ...fighter, charges: 1, meter: 0 }, 1 / 60, false, false);
    assert.deepEqual(lit(), [false, false, false], 'the first word flashes nothing');
    vitals.update({ ...fighter, charges: 2, meter: 0 }, 1 / 60, false, false);
    assert.deepEqual(lit(), [false, true, false], 'gained');
    vitals.update({ ...fighter, charges: 2, meter: 0 }, CHARGE_FLASH_SECONDS, false, false);
    vitals.update({ ...fighter, charges: 2, meter: 0 }, 1 / 60, false, false);
    assert.deepEqual(lit(), [false, false, false], 'over');
    vitals.update({ ...fighter, charges: 1, meter: 0 }, 1 / 60, false, false);
    assert.deepEqual(lit(), [false, true, false], 'drunk');
    vitals.update({ ...fighter, charges: 3, meter: 0 }, 1 / 60, false, false);
    assert.deepEqual(lit(), [false, true, true], 'both a respawn fills');
  });
});
