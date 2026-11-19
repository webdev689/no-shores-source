import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ANIMA_ROWS, abilityBarOf, tenetShown } from './abilityBar.ts';

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
