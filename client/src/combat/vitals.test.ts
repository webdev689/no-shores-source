import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FighterView } from '../rules/fighters.ts';
import { LOSS_DRAIN, LOSS_HOLD, LOSS_HOLD_MOST, type Loss, stepLoss } from '../plus/barLoss.ts';
import { FILLS, TONES } from '../plus/tones.ts';
import type { Node } from '../ui/node.ts';
import { allOf, wordsIn } from './nodes.test.ts';
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
  const vitals = new Vitals();
  for (let frame = 0; frame < 8; frame++) vitals.update(whole, 0.5, false, false);
  assert.equal(vitals.resting, true, 'at rest');
  vitals.update(whole, 0.4, false, false);
  assert.ok((vitals.node().opacity ?? 1) < 1, 'going in hard steps');
  for (let frame = 0; frame < 4; frame++) vitals.update(whole, 0.5, false, false);
  assert.equal(vitals.node().opacity, 0, 'gone');
  vitals.update({ ...whole, health: 150 }, 1 / 60, false, false);
  assert.equal(vitals.resting, false, 'back at once');
  vitals.update({ ...whole, health: 150 }, 0.12, false, false);
  assert.equal(vitals.node().opacity, 1, 'whole again within an eighth of a second');
});

test('each bar is as long as what it holds, and tells a screen reader its name and how much of its most is left', () => {
  const vitals = new Vitals();
  vitals.lay(300, false);
  vitals.update({ ...fighter, health: 150, healthMax: 200, stamina: 42, poise: 7, poiseMax: 40 }, 1 / 60, false, false);
  const bars = vitals.node().children?.slice(0, 3) ?? [];
  assert.deepEqual(
    bars.map((bar) => bar && bar.width),
    [300, 150, 60],
    'health 200 at the length, stamina 100 half of it, poise 40 a fifth',
  );
  assert.deepEqual(
    bars.map((bar) => bar && bar.label),
    ['Health: 75%', 'Stamina: 42%', 'Poise: 18%'],
  );
  assert.equal(
    vitals.node(2).children?.[0] && (vitals.node(2).children?.[0] as { width: number }).width,
    600,
    'doubled past 1440p',
  );
});

test('poise says what holds the player beside its bar: filling says nothing, a stagger or an opening is named', () => {
  const vitals = new Vitals();
  const word = () => wordsIn(vitals.node().children?.[2]);
  vitals.update({ ...fighter, poise: 7 }, 1 / 60, false, false);
  assert.equal(vitals.warnings.poise, 'filling');
  assert.deepEqual(word(), []);
  vitals.update({ ...fighter, action: { kind: 'staggered', left: 30, cause: 'poise' } }, 1 / 60, false, false);
  assert.deepEqual([vitals.warnings.poise, vitals.warnings.breaking], ['staggered', true]);
  assert.deepEqual(word(), ['STAGGERED']);
  assert.equal(
    allOf(vitals.node()).some((node) => node.label === 'Poise: Staggered'),
    true,
  );
  vitals.update({ ...fighter, action: { kind: 'staggered', left: 20, cause: 'charged' } }, 1 / 60, false, false);
  assert.deepEqual(word(), ['CHARGED']);
  vitals.update({ ...fighter, action: { kind: 'overreach', left: 20 } }, 1 / 60, false, false);
  assert.deepEqual([vitals.warnings.poise, word()], ['open', ['OPEN']]);
});

test('health low marks its bar to flash blood, and a press with no stamina marks stamina’s to flash white', () => {
  const vitals = new Vitals();
  vitals.update({ ...fighter, health: 40 }, 1 / 60, true, false);
  assert.deepEqual([vitals.warnings.low, vitals.warnings.flashing], [true, true]);
  vitals.update(fighter, 1 / 60, false, false);
  assert.deepEqual([vitals.warnings.low, vitals.warnings.flashing], [false, false]);
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
  const vitals = new Vitals();
  vitals.update({ ...fighter, charges: 2, meter: 0.25 }, 1 / 60, false, false);
  // A 12 px diamond holds 8 rows inside its frame: a quarter is 2 of them, paler than a charge held whole.
  const shown = drawnCharges(vitals);
  assert.deepEqual(
    shown.diamonds.map(({ rows, inside }) => [rows, inside === FILLS.health]),
    [
      [8, true],
      [8, true],
      [2, false],
    ],
  );
  assert.equal(shown.label, 'Healing charges: 2 of 3, the next 25% filled', 'a screen reader hears them');
  vitals.lay(200, true);
  vitals.update({ ...fighter, charges: 2, meter: 0.25 }, 1 / 60, false, false);
  assert.equal(drawnCharges(vitals).diamonds[2]?.rows, 3, 'at the larger step, 12 rows');
});

/** The healing charges' row as drawn: its label, and each diamond's rows risen and the colour inside them. */
function drawnCharges(vitals: Vitals): { label: string | undefined; diamonds: { rows: number; inside: string }[] } {
  const row = vitals.node().children?.[3] as Node;
  const diamonds: { rows: number; inside: string }[] = [];
  const ui = {
    tileTexels: (key: string) => {
      const [, , rows, ...inside] = key.split(' ');
      diamonds.push({ rows: Number(rows), inside: inside.join(' ') });
      return null;
    },
  };
  const box = { x: 0, y: 0, width: 16, height: 16 };
  for (const diamond of row.children ?? []) (diamond as Node).draw?.(ui as never, box, 1, box, 1);
  return { label: row.label, diamonds };
}

test('a diamond flashes as its charge is gained or drunk, for a moment, and not before the first word', () => {
  const vitals = new Vitals();
  const lit = () => drawnCharges(vitals).diamonds.map(({ inside }) => inside === TONES.word);
  vitals.update({ ...fighter, charges: 1, meter: 0 }, 1 / 60, false, false);
  assert.deepEqual(lit(), [false, false, false], 'the first word flashes nothing');
  vitals.update({ ...fighter, charges: 2, meter: 0 }, 1 / 60, false, false);
  assert.deepEqual(lit(), [false, true, false], 'gained');
  vitals.update({ ...fighter, charges: 2, meter: 0 }, CHARGE_FLASH_SECONDS * 0.6, false, false);
  assert.deepEqual(lit(), [false, false, false], 'its second step');
  assert.equal(drawnCharges(vitals).diamonds[1]?.rows, 8, 'lit whole in the filling tone');
  vitals.update({ ...fighter, charges: 1, meter: 0 }, 1 / 60, false, false);
  assert.deepEqual(lit(), [false, true, false], 'drunk mid-flash: it starts afresh');
  vitals.update({ ...fighter, charges: 1, meter: 0 }, CHARGE_FLASH_SECONDS, false, false);
  assert.deepEqual(lit(), [false, false, false], 'over');
  vitals.update({ ...fighter, charges: 3, meter: 0 }, 1 / 60, false, false);
  assert.deepEqual(lit(), [false, true, true], 'both a respawn fills');
});
