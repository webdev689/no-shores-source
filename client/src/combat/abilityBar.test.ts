import assert from 'node:assert/strict';
import type { Child } from '../ui/node.ts';
import { test } from 'node:test';
import {
  AbilityBar,
  ANIMA_ROWS,
  filteredSvg,
  abilityBarOf,
  spentBetween,
  tenetShown,
  USED_SECONDS,
} from './abilityBar.ts';
import { allOf, wordsIn } from './nodes.test.ts';

/** A slot's label, or none for a slot not shown. */
const labelOf = (slot: Child): string | undefined => (slot ? slot.label : undefined);

const STORM = 1;
const SHADOW = 3;

test('just cast, everything is dark: the Anima unlit and each Tenet’s wedge whole, its seconds too many to count', () => {
  const shown = abilityBarOf({ art: STORM, animaShare: 0, tenets: [0, 0] });
  assert.equal(shown.animaRows, 0);
  assert.equal(shown.animaFull, false);
  for (const tenet of shown.tenets) assert.deepEqual(tenet, { sweep: 360, seconds: '', ready: false });
});

test('half way, the Anima is lit half way up and each wedge has swept half way round', () => {
  const shown = abilityBarOf({ art: STORM, animaShare: 0.5, tenets: [0.5, 0.5] });
  assert.equal(shown.animaRows, ANIMA_ROWS / 2);
  assert.equal(shown.animaFull, false);
  // Quicken has 45.5 s left and Arc Lash 52.5 s: neither is under ten.
  for (const tenet of shown.tenets) assert.deepEqual(tenet, { sweep: 180, seconds: '', ready: false });
});

test('full, the Anima glows whole and each Tenet is ready, with no wedge and no number', () => {
  const shown = abilityBarOf({ art: STORM, animaShare: 1, tenets: [1, 1] });
  assert.equal(shown.animaRows, ANIMA_ROWS);
  assert.equal(shown.animaFull, true);
  for (const tenet of shown.tenets) assert.deepEqual(tenet, { sweep: 0, seconds: '', ready: true });
});

test('a Tenet counts its last seconds, rounded up so it never reads 0 before it is ready', () => {
  // Vanish recharges over 38 s: nine tenths of the way, 3.8 s are left.
  const vanish = abilityBarOf({ art: SHADOW, animaShare: 0, tenets: [0, 0.9] }).tenets[1];
  assert.deepEqual(vanish, { sweep: 36, seconds: '4', ready: false });
  assert.equal(tenetShown(0.75, 38).seconds, '', '9.5 s left is still counted as ten');
  assert.equal(tenetShown(0.999, 38).seconds, '1');
  assert.equal(tenetShown(0.999, 38).sweep, 6, 'a sliver left still shows one step of the wedge');
});

test('shares out of range or unknown are held to the bar', () => {
  const shown = abilityBarOf({ art: STORM, animaShare: 1.4, tenets: [-1, Number.NaN] });
  assert.equal(shown.animaRows, ANIMA_ROWS);
  assert.equal(shown.tenets[0].sweep, 360);
  assert.equal(shown.tenets[1].sweep, 360);
});

test('an ability is spent when it falls from full; one changing Art, or merely charging, is not', () => {
  const full = { art: STORM, animaShare: 1, tenets: [1, 0.4] as const };
  assert.deepEqual(spentBetween(full, { art: STORM, animaShare: 0, tenets: [1, 0.41] }), [true, false, false]);
  assert.deepEqual(spentBetween(full, { art: STORM, animaShare: 1, tenets: [0, 0.41] }), [false, true, false]);
  assert.deepEqual(spentBetween(full, { art: SHADOW, animaShare: 0, tenets: [0, 0] }), [false, false, false]);
  assert.deepEqual(spentBetween(null, full), [false, false, false]);
});

test('on the display a spell just cast flashes, a Tenet counting its last seconds steps back, and none can be cast while unable', () => {
  const pictures = () => ({ anima: '<svg></svg>', animaOutline: '', tenets: ['', ''] as const, diamond: '', ring: '' });
  const bar = new AbilityBar(pictures);
  const slots = () => bar.node(false)?.children ?? [];
  const keys = (slot: number) => allOf(slots()[slot]).flatMap((node) => node.picture?.key ?? []);
  bar.update({ art: STORM, animaShare: 1, tenets: [0.96, 1] }, 1 / 60);
  assert.equal(slots().length, 3);
  assert.ok(
    allOf(slots()[0]).some((node) => node.opacity === 0.45),
    'the Anima full, glowing',
  );
  assert.deepEqual(wordsIn(slots()[1]), ['4', 'Q'], 'Quicken has 4 s left');
  assert.ok(
    keys(1).some((key) => key.startsWith('tenet sweep')),
    'its wedge still dark',
  );
  assert.equal(
    keys(2).some((key) => key.startsWith('tenet sweep')),
    false,
    'Arc Lash ready',
  );
  assert.equal(labelOf(slots()[2]), 'Arc Lash (G), ready');
  bar.update({ art: STORM, animaShare: 0, tenets: [0.97, 1] }, 1 / 60);
  assert.ok(keys(0).includes(`art ${STORM} diamond 0.45 3`), 'the Tempest just cast: its frame flashes white');
  assert.equal(labelOf(slots()[0]), 'Tempest (R), charging, 0%');
  bar.update({ art: STORM, animaShare: 0, tenets: [0.98, 1] }, USED_SECONDS);
  assert.equal(keys(0).includes(`art ${STORM} diamond 0.45 3`), false, 'its flash over');
  bar.update({ art: STORM, animaShare: 0, tenets: [0.98, 1] }, 1 / 60, true);
  assert.ok(keys(2).includes('unable hatch'), 'hatched');
  assert.ok(
    keys(2).every((key) => key === 'unable hatch' || / 0 [\d.]+$/.test(key)),
    'every picture grey',
  );
  assert.equal(labelOf(slots()[2]), 'Arc Lash (G), cannot be cast now');
  bar.hide();
  assert.equal(bar.node(false), null, 'hidden with no state');
});

test('a Tenet its road has not earned stands dark under a padlock, saying which road earns it', () => {
  assert.deepEqual(abilityBarOf({ art: STORM, animaShare: 1, tenets: [1, 1], earned: 0b011 }).locked, [
    false,
    false,
    true,
  ]);
  assert.deepEqual(abilityBarOf({ art: STORM, animaShare: 1, tenets: [1, 1] }).locked, [false, false, false], 'unsaid');
  const pictures = () => ({ anima: '<svg></svg>', animaOutline: '', tenets: ['', ''] as const, diamond: '', ring: '' });
  const bar = new AbilityBar(pictures);
  bar.update({ art: STORM, animaShare: 1, tenets: [1, 0.97], earned: 0b001 }, 1 / 60);
  const slots = bar.node(false)?.children ?? [];
  const keys = (slot: number) => allOf(slots[slot]).flatMap((node) => node.picture?.key ?? []);
  assert.equal(labelOf(slots[1]), "Quicken (Q), earned on the Stormcallers' road");
  assert.equal(labelOf(slots[2]), "Arc Lash (G), earned on the Stormcallers' road");
  assert.equal(labelOf(slots[0]), 'Tempest (R), ready', 'the Art itself, earned');
  assert.ok(
    keys(2).some((key) => key.startsWith('ability lock')),
    'a padlock over it',
  );
  assert.equal(
    keys(0).some((key) => key.startsWith('ability lock')),
    false,
  );
  assert.equal(
    keys(2).some((key) => key.startsWith('tenet sweep')),
    false,
    'no wedge on one not to be had',
  );
  assert.deepEqual(wordsIn(slots[2]), ['G'], 'nor its seconds');
});

test('a picture’s colours are turned by a filter laid over it inside its own SVG', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><rect width="1" height="1"/></svg>';
  assert.equal(filteredSvg(svg, 1, 1), svg, 'untouched');
  const turned = filteredSvg(svg, 0.45, 0.8);
  assert.match(turned, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 2 2"><defs>/);
  assert.match(turned, /type="saturate" values="0.45"/);
  assert.match(turned, /slope="0.8"/);
  assert.match(turned, /<g filter="url\(#turned\)"><rect width="1" height="1"\/><\/g><\/svg>$/);
});
