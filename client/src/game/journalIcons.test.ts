import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OUTLINE } from '../combat/dropPictures.ts';
import { pixelsOf } from '../plus/pixelsForTests.ts';
import { TONES } from '../plus/tones.ts';
import { ICON_PIXELS, type IconName, POOL_GROUNDS, iconUrl, modifierIcon, poolMarkUrl } from './journalIcons.ts';

const NAMES: readonly IconName[] = [
  'land',
  'sea',
  'dungeon',
  'dawn',
  'week',
  'elite-dungeon',
  'abyss-dungeon',
  'bounty',
  'boon',
  'breach',
  'seas-normal',
  'seas-elite',
  'seas-abyss',
  'taken',
  'open',
  'locked',
  'cache',
  'revive',
  'wipe',
  'burn',
  'brawler',
  'marksman',
  'lightswitch',
  'ironclad',
  'trickle',
  'juggler',
  'exposure',
];

test('every icon is twelve square, drawn sharp, outlined as the gear glyphs are, and none another’s twin', () => {
  const drawn = NAMES.map((name) => iconUrl(name));
  assert.equal(new Set(drawn).size, NAMES.length);
  for (const [place, url] of drawn.entries()) {
    const { width, height, pixels, svg } = pixelsOf(url);
    assert.deepEqual([width, height], [ICON_PIXELS, ICON_PIXELS], NAMES[place]);
    assert.match(svg, /shape-rendering='crispEdges'/);
    assert.ok([...pixels.values()].includes(OUTLINE), `${NAMES[place]} is outlined`);
    assert.ok(pixels.size > 24, `${NAMES[place]} is a sign, not a speck`);
  }
});

test('each of the board’s three pools has its own mark and its own ground of the kit’s, and no other pool has one', () => {
  const marks = [0, 1, 2].map((pool) => poolMarkUrl(pool) ?? '');
  assert.deepEqual(marks, [iconUrl('land'), iconUrl('sea'), iconUrl('dungeon')]);
  assert.equal(poolMarkUrl(3), null);
  const palette = new Set<string>(Object.values(TONES));
  assert.equal(new Set(POOL_GROUNDS).size, 3);
  for (const ground of POOL_GROUNDS) assert.ok(palette.has(ground), `${ground} is the kit's`);
});

test('every modifier the rules draw has its icon, Burn’s flame in its Art’s colours and none for a key unknown', () => {
  const keys = ['brawler', 'marksman', 'lightswitch', 'ironclad', 'trickle', 'juggler', 'exposure'];
  for (const key of keys) assert.equal(modifierIcon(key)?.name, key);
  const burns = ['burn-storm', 'burn-divine', 'burn-shadow'].map((key) => modifierIcon(key));
  assert.ok(burns.every((burn) => burn?.name === 'burn'));
  const flames = burns.map((burn) => iconUrl('burn', burn?.tones));
  assert.equal(new Set(flames).size, 3, 'each Art burns in its own colours');
  assert.equal(modifierIcon('no-such'), null);
});
