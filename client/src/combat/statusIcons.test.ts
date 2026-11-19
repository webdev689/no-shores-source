import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STATUSES, type FighterView, type Statuses } from '../rules/fighters.ts';
import { FoePlate, type MarkedFoe } from './foePlate.ts';
import { findAll, onFakePage } from './page.test.ts';
import { foeDebuffs, ownBuffs, StatusClock, StatusRow, statusCss, statusSvg, statusWords } from './statusIcons.ts';
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
  for (const name of STATUSES) {
    const svg = statusSvg(name);
    assert.match(svg, /viewBox="0 0 12 12"/, name);
    const places = [...svg.matchAll(/x="(\d+)" y="(\d+)"/g)].map((found) => [Number(found[1]), Number(found[2])]);
    assert.ok(places.length > 20, `${name} draws`);
    assert.ok(
      places.every(([x = 0, y = 0]) => x < 12 && y < 12),
      `${name} within its square`,
    );
  }
  assert.match(statusSvg('expose'), /#9c55ff/, 'Expose in Cosmic');
  assert.match(statusSvg('charge'), /#46beff/, 'Charge in Volt');
  assert.match(statusSvg('crit'), /#ffd36a/, 'Crit in Blaze, its light gold');
  assert.match(statusCss(), /data-status='veiled'/);
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

test('a row shows each status as an icon with its words and its line, hiding those that ended', () =>
  onFakePage((root) => {
    const row = new StatusRow(root, 'Debuffs');
    row.show(4, foeDebuffs({ expose: 360, charge: 24, chargeImmune: 0 }));
    const icons = () => findAll(root, 'status').filter((icon) => !icon.hidden);
    assert.deepEqual(
      icons().map((icon) => icon.dataset['status']),
      ['expose', 'charge'],
    );
    row.show(4, foeDebuffs({ expose: 180, charge: 0, chargeImmune: 180 }));
    const [expose, charge] = icons();
    assert.equal(findAll(expose as unknown as HTMLElement, 'time')[0]?.style['width'], '50%');
    assert.equal(charge?.classList.contains('faded'), true, 'immune: a faded Charge');
    assert.equal((charge as unknown as HTMLElement).ariaLabel, 'Immune to Charge, 3 s left');
    row.show(4, []);
    assert.equal(icons().length, 0);
  }));

test('a foe’s plate shows its debuffs beside its bar', () =>
  onFakePage((root) => {
    const plate = new FoePlate(root, 'overhead');
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
    const shown = findAll(root, 'status').filter((icon) => !icon.hidden);
    assert.deepEqual(
      shown.map((icon) => icon.dataset['status']),
      ['expose'],
    );
  }));

test('the vitals show the player’s buffs over their health, and never rest while a buff holds', () =>
  onFakePage((root) => {
    const vitals = new Vitals(root);
    const hasted = { ...view, statuses: { ...none, haste: 360 } };
    for (let frame = 0; frame < 12; frame++) vitals.update(hasted, 0.5, false, false);
    assert.equal(vitals.root.classList.contains('rest'), false, 'awake while Hasted');
    const shown = findAll(root, 'status').filter((icon) => !icon.hidden);
    assert.deepEqual(
      shown.map((icon) => icon.dataset['status']),
      ['haste'],
    );
    for (let frame = 0; frame < 12; frame++) vitals.update({ ...view, statuses: none }, 0.5, false, false);
    assert.equal(vitals.root.classList.contains('rest'), true, 'at rest once it ends');
  }));
