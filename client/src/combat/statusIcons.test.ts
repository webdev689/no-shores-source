import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STATUSES, type FighterView, type Statuses } from '../rules/fighters.ts';
import { FoePlate, type MarkedFoe } from './foePlate.ts';
import { allOf } from './nodes.test.ts';
import { foeDebuffs, ownBuffs, StatusClock, StatusRow, statusPixels, statusWords } from './statusIcons.ts';
import { Vitals } from './vitals.ts';

const none: Statuses = { crit: 0, expose: 0, charge: 0, haste: 0, linked: 0, veiled: 0, chargeImmune: 0 };
const view: FighterView = {
  x: 0,
  y: 0,
  z: 0,
  facing: 0,
  mode: 'ground',
  crouched: false,
  aim: 0,
  side: 'players',
  arms: 0,
  health: 100,
  healthMax: 100,
  stamina: 100,
  poise: 0,
  poiseMax: 40,
  target: null,
  action: { kind: 'idle' },
};

test('a foe shows its Expose and its Charge, and once the Charge ends its immunity as a faded Charge', () => {
  assert.deepEqual(foeDebuffs(undefined), []);
  assert.deepEqual(foeDebuffs({ expose: 0, charge: 0, chargeImmune: 0 }), []);
  assert.deepEqual(foeDebuffs({ expose: 200, charge: 60, chargeImmune: 0 }), [
    { name: 'expose', left: 200, faded: false },
    { name: 'charge', left: 60, faded: false },
  ]);
  assert.deepEqual(foeDebuffs({ expose: 0, charge: 0, chargeImmune: 90 }), [{ name: 'charge', left: 90, faded: true }]);
});

test('the player shows their Crit, Haste, Linked and Veiled in that order, never a debuff', () => {
  assert.deepEqual(ownBuffs(undefined), []);
  const held = { ...none, veiled: 30, crit: 300, expose: 50, charge: 20, linked: 1 };
  assert.deepEqual(
    ownBuffs(held).map(({ name, left }) => [name, left]),
    [
      ['crit', 300],
      ['linked', 1],
      ['veiled', 30],
    ],
  );
});

test('each icon tells a screen reader what it is and the whole seconds it has left', () => {
  assert.equal(statusWords({ name: 'expose', left: 61, faded: false }), 'Exposed, 2 s left');
  assert.equal(statusWords({ name: 'charge', left: 180, faded: true }), 'Immune to Charge, 3 s left');
  assert.equal(statusWords({ name: 'haste', left: 1, faded: false }), 'Hasted, 1 s left');
});

test('each status is a 12 by 12 glyph in its element’s colours', () => {
  const colours = (name: (typeof STATUSES)[number]) => {
    const pixels = statusPixels(name);
    const seen = new Set<string>();
    for (let place = 0; place < pixels.length; place += 4)
      if (pixels[place + 3])
        seen.add(`#${[0, 1, 2].map((step) => (pixels[place + step] ?? 0).toString(16).padStart(2, '0')).join('')}`);
    return seen;
  };
  for (const name of STATUSES) {
    assert.equal(statusPixels(name).length, 12 * 12 * 4, name);
    const drawn = statusPixels(name).filter((_unused, index) => index % 4 === 3 && _unused > 0).length;
    assert.ok(drawn > 20, `${name} draws`);
  }
  assert.ok(colours('expose').has('#9c55ff'), 'Expose in Cosmic');
  assert.ok(colours('charge').has('#46beff'), 'Charge in Volt');
  assert.ok(colours('crit').has('#ffd36a'), 'Crit in Blaze, its light gold');
});

test('a status’s line shrinks from the most it held since it began, and starts whole again when refreshed', () => {
  const clock = new StatusClock();
  assert.equal(clock.share('1:expose:false', 360), 1);
  assert.equal(clock.share('1:expose:false', 180), 0.5);
  assert.equal(clock.share('1:expose:false', 300), 1, 'refreshed');
  assert.equal(clock.share('1:expose:false', 150), 0.5);
  clock.keep(() => false);
  assert.equal(clock.share('1:expose:false', 100), 1, 'forgotten, it starts again');
});

/** The icons a row's node shows, by what each tells a screen reader. */
const iconsOf = (row: StatusRow) =>
  allOf(row.node(24)).flatMap((node) =>
    node.label && node.label !== 'Debuffs' && node.label !== 'Your buffs' ? [node] : [],
  );

test('a row shows each status as an icon with its words and its line, hiding those that ended', () => {
  const row = new StatusRow('Debuffs');
  row.show(4, foeDebuffs({ expose: 360, charge: 24, chargeImmune: 0 }));
  assert.deepEqual(
    iconsOf(row).map((icon) => icon.label),
    ['Exposed, 6 s left', 'Charged, 1 s left'],
  );
  row.show(4, foeDebuffs({ expose: 180, charge: 0, chargeImmune: 180 }));
  const [expose, charge] = iconsOf(row);
  assert.equal(expose?.children?.[1] && (expose.children[1] as { width: string }).width, '50%', 'its line half gone');
  assert.equal(charge?.opacity, 0.4, 'immune: a faded Charge');
  assert.equal(charge?.label, 'Immune to Charge, 3 s left');
  row.show(4, []);
  assert.equal(row.node(24), null);
});

test('a foe’s plate shows its debuffs beside its bar', () => {
  const plate = new FoePlate();
  const foe: MarkedFoe = {
    id: 3,
    name: 'Runner',
    view: { ...view, side: 'foes' },
    rank: 2,
    faction: 'The Grey Tithe',
    phase: 1,
    alert: 2,
    statuses: { expose: 100, charge: 0, chargeImmune: 0 },
  };
  plate.show(foe, 1 / 60);
  const labels = allOf(plate.node({ kind: 'overhead', width: 0 })).flatMap((node) => node.label ?? []);
  assert.deepEqual(labels, ['Debuffs', 'Exposed, 2 s left']);
});

test('the vitals show the player’s buffs under their bars, and never rest while a buff holds', () => {
  const vitals = new Vitals();
  const hasted = { ...view, statuses: { ...none, haste: 360 } };
  for (let frame = 0; frame < 12; frame++) vitals.update(hasted, 0.5, false, false);
  assert.equal(vitals.resting, false, 'awake while Hasted');
  assert.ok(allOf(vitals.node()).some((node) => node.label?.startsWith('Hasted')));
  for (let frame = 0; frame < 12; frame++) vitals.update({ ...view, statuses: none }, 0.5, false, false);
  assert.equal(vitals.resting, true, 'at rest once it ends');
});
