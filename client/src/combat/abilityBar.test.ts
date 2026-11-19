import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AbilityBar, ANIMA_ROWS, abilityBarOf, spentBetween, tenetShown, USED_SECONDS } from './abilityBar.ts';
import { findAll, onFakePage } from './page.test.ts';

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
  onFakePage((root) => {
    const pictures = () => ({ anima: '', animaOutline: '', tenets: ['', ''] as const, diamond: '', ring: '' });
    const bar = new AbilityBar(root, pictures);
    const [anima, quicken, arcLash] = ['anima', 'tenet'].flatMap((kind) => findAll(root, kind));
    bar.update({ art: STORM, animaShare: 1, tenets: [0.96, 1] }, 1 / 60);
    assert.equal(bar.root.hidden, false);
    assert.equal(anima?.classList.contains('full'), true);
    assert.equal(quicken?.classList.contains('counting'), true, 'Quicken has 4 s left');
    assert.equal(arcLash?.classList.contains('ready'), true);
    assert.equal((arcLash as unknown as Record<string, string>)['ariaLabel'], 'Arc Lash (G), ready');
    bar.update({ art: STORM, animaShare: 0, tenets: [0.97, 1] }, 1 / 60);
    assert.equal(anima?.classList.contains('used'), true, 'the Tempest just cast');
    assert.equal((anima as unknown as Record<string, string>)['ariaLabel'], 'Tempest (R), charging, 0%');
    bar.update({ art: STORM, animaShare: 0, tenets: [0.98, 1] }, USED_SECONDS);
    assert.equal(anima?.classList.contains('used'), false, 'its flash over');
    bar.update({ art: STORM, animaShare: 0, tenets: [0.98, 1] }, 1 / 60, true);
    assert.equal(bar.root.classList.contains('unable'), true);
    assert.equal((arcLash as unknown as Record<string, string>)['ariaLabel'], 'Arc Lash (G), cannot be cast now');
  });
});

test('a screen reader hears each ability once, by its name and state: its pictures and its keycap say nothing more', () =>
  onFakePage((root) => {
    new AbilityBar(root, () => ({ anima: '', animaOutline: '', tenets: ['', ''] as const, diamond: '', ring: '' }));
    const all = findAll(root);
    const property = (node: (typeof all)[number], name: string) => (node as unknown as Record<string, unknown>)[name];
    const pictures = all.filter((node) => node.tagName === 'IMG');
    const keycaps = all.filter((node) => node.tagName === 'KBD');
    assert.deepEqual([pictures.length, keycaps.length], [8, 3]);
    assert.ok(
      pictures.every((node) => property(node, 'alt') === ''),
      'every picture is decoration',
    );
    assert.ok(
      keycaps.every((node) => property(node, 'ariaHidden') === 'true'),
      'the key is in the ability’s name',
    );
  }));
